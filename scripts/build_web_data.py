#!/usr/bin/env python3
"""Build a season-wide, static GitHub Pages dataset from multi-GB ACDSA CSVs.

The exporter scans each large source in chunks, partitions the requested thermal
periods by day, and writes one compressed JSON file per risk/day. The browser
therefore downloads only the selected 24-hour window.
"""

from __future__ import annotations

from pathlib import Path
import argparse
import gzip
import json
import re
import shutil
import tempfile

import geopandas as gpd
import numpy as np
import pandas as pd


CATALONIA = {"08": "Barcelona", "17": "Girona", "25": "Lleida", "43": "Tarragona"}
INDEX_VARS = [
    "R_M_UC",
    "I_PEN",
    "I_DES",
    "D_PCT_65P",
    "D_HH_SIZE",
    "Q_CALEF_DE",
    "Q_REFRI_DE",
    "ConsumEnergiaFinal_ICAEN",
    "CostAnualEnergiaHab_ICAEN",
    "Vulnerabilidad",
]


def normalize_cusec(series: pd.Series) -> pd.Series:
    return (
        series.astype("string")
        .str.replace(r"\.0$", "", regex=True)
        .str.strip()
        .str.zfill(10)
    )


def numeric(series: pd.Series) -> pd.Series:
    if pd.api.types.is_numeric_dtype(series):
        return pd.to_numeric(series, errors="coerce")
    return pd.to_numeric(series.astype("string").str.replace(",", ".", regex=False), errors="coerce")


def read_small(path: str | Path) -> pd.DataFrame:
    data = pd.read_csv(
        path,
        sep=";",
        decimal=",",
        encoding="utf-8-sig",
        low_memory=False,
        dtype={"CUSEC": "string"},
    )
    if len(data.columns) == 1:
        data = pd.read_csv(
            path,
            sep=",",
            decimal=".",
            encoding="utf-8-sig",
            low_memory=False,
            dtype={"CUSEC": "string"},
        )
    if "CUSEC" not in data:
        raise ValueError(f"{path}: falta la columna CUSEC")
    data["CUSEC"] = normalize_cusec(data["CUSEC"])
    return data


def census_key(frame: gpd.GeoDataFrame) -> str:
    candidates = [column for column in frame.columns if column.upper() in {"CUSEC", "CUSEC2024", "CUSEC_2024"}]
    if not candidates:
        raise ValueError("La cartografía no contiene una columna CUSEC")
    return candidates[0]


def municipality_key(frame: gpd.GeoDataFrame) -> str | None:
    """Detect the municipality-name field used by the official shapefile."""
    accepted = {
        "MUNICIPALITY_NAME",
        "NMUN",
        "NOMMUN",
        "NOM_MUN",
        "NOMMUNI",
        "NOM_MUNICIPI",
        "MUNICIPI",
        "MUNICIPIO",
    }
    return next((column for column in frame.columns if column.upper() in accepted), None)


def build_structural(args: argparse.Namespace, output: Path) -> tuple[gpd.GeoDataFrame, Path]:
    print("Construyendo GeoJSON estructural...", flush=True)
    geo = gpd.read_file(args.sections)
    census_column = census_key(geo)
    municipality_column = municipality_key(geo)
    geo = geo.rename(columns={census_column: "CUSEC"})
    geo["CUSEC"] = normalize_cusec(geo["CUSEC"])
    if municipality_column:
        geo["MUNICIPALITY_NAME"] = geo[municipality_column].astype("string").str.strip()
    else:
        # The website keeps working, but will explicitly say the name is unavailable.
        print("  Aviso: no se ha encontrado la columna de nombre de municipio", flush=True)
        geo["MUNICIPALITY_NAME"] = pd.NA
    if "CPRO" not in geo:
        geo["CPRO"] = geo["CUSEC"].str[:2]
    geo["CPRO"] = geo["CPRO"].astype("string").str.strip().str.zfill(2)
    geo = geo.loc[geo["CPRO"].isin(CATALONIA)].copy()
    if args.province:
        geo = geo.loc[geo["CPRO"].eq(str(args.province).zfill(2))].copy()
    geo["PROVINCE_NAME"] = geo["CPRO"].map(CATALONIA)

    vulnerability = read_small(args.vulnerability).drop_duplicates("CUSEC")
    keep = ["CUSEC"] + [column for column in INDEX_VARS if column in vulnerability]
    geo = geo.merge(vulnerability[keep], on="CUSEC", how="left", validate="one_to_one").to_crs(4326)
    if args.simplify:
        geo.geometry = geo.geometry.simplify(args.simplify, preserve_topology=True)
    keep_geo = [column for column in ["CUSEC", "MUNICIPALITY_NAME", "CPRO", "PROVINCE_NAME", *INDEX_VARS, "geometry"] if column in geo]
    geo = geo[keep_geo]
    destination = output / "energy_vulnerability_sections.geojson"
    geo.to_file(destination, driver="GeoJSON")
    print(f"  {len(geo):,} secciones guardadas en {destination}", flush=True)
    return geo, destination


def parse_period(spec: str) -> tuple[str, str, pd.Timestamp, pd.Timestamp]:
    parts = spec.split("|")
    if len(parts) != 4:
        raise ValueError("Cada --period debe ser RIESGO|ETIQUETA|INICIO|FIN")
    risk, label = parts[0].strip().lower(), parts[1].strip()
    if risk not in {"heat", "cold"}:
        raise ValueError("RIESGO debe ser heat o cold")
    start = pd.Timestamp(parts[2]).normalize()
    end = pd.Timestamp(parts[3]).normalize() + pd.Timedelta(days=1) - pd.Timedelta(nanoseconds=1)
    if end < start:
        raise ValueError(f"Periodo inválido: {spec}")
    return risk, label, start, end


def parse_highlight(spec: str) -> dict:
    parts = spec.split("|")
    if len(parts) != 3:
        raise ValueError("Cada --highlight debe ser RIESGO|FECHA|ETIQUETA")
    risk = parts[0].strip().lower()
    if risk not in {"heat", "cold"}:
        raise ValueError("RIESGO debe ser heat o cold")
    return {"risk": risk, "date": pd.Timestamp(parts[1]).strftime("%Y-%m-%d"), "label": parts[2].strip()}


def group_periods(specs: list[tuple[str, str, pd.Timestamp, pd.Timestamp]]) -> dict:
    periods: dict[str, dict] = {}
    for risk, label, start, end in specs:
        period = periods.setdefault(risk, {"risk": risk, "label": label, "ranges": []})
        if period["label"] != label:
            raise ValueError(f"Todas las franjas de {risk} deben usar la misma etiqueta")
        period["ranges"].append((start, end))
    for period in periods.values():
        period["ranges"].sort(key=lambda item: item[0])
    return periods


def range_mask(dates: pd.Series, ranges: list[tuple[pd.Timestamp, pd.Timestamp]]) -> pd.Series:
    mask = pd.Series(False, index=dates.index)
    for start, end in ranges:
        mask |= dates.between(start, end)
    return mask


def append_partition(frame: pd.DataFrame, root: Path, risk: str, value_name: str) -> int:
    if frame.empty:
        return 0
    frame = frame.copy()
    frame["day"] = frame["fecha"].dt.strftime("%Y-%m-%d")
    written = 0
    for day, group in frame.groupby("day", sort=False):
        destination = root / value_name / risk / f"{day}.csv"
        destination.parent.mkdir(parents=True, exist_ok=True)
        group.drop(columns="day").to_csv(
            destination,
            mode="a",
            header=not destination.exists(),
            index=False,
        )
        written += len(group)
    return written


def risk_values(chunk: pd.DataFrame, risk: str) -> pd.Series:
    paper_name, legacy_name = f"R_{risk}", f"STAR_{risk}"
    if paper_name in chunk:
        result = numeric(chunk[paper_name])
    elif legacy_name in chunk:
        result = numeric(chunk[legacy_name])
    else:
        result = numeric(chunk["precio_electrico"]) * numeric(chunk[f"W_{risk}"]) * numeric(chunk["Vulnerabilidad"])
    # Matches 4_models_RISK_TYPE.py before its q90 calculation.
    return result.round(1)


def scan_hourly(
    path: str | Path,
    periods: dict,
    province: str | None,
    chunksize: int,
    temp_root: Path,
) -> tuple[dict, set[str], dict[str, int]]:
    wanted = {
        "CUSEC",
        "fecha",
        "precio_electrico",
        "Vulnerabilidad",
        "W_heat",
        "W_cold",
        "R_heat",
        "R_cold",
        "STAR_heat",
        "STAR_cold",
    }
    threshold_dir = temp_root / "thresholds"
    threshold_dir.mkdir(parents=True, exist_ok=True)
    threshold_handles = {
        (risk, code): (threshold_dir / f"{risk}_{code}.f32").open("ab")
        for risk in periods
        for code in CATALONIA
    }
    seen: set[str] = set()
    read_rows = 0
    kept = {risk: 0 for risk in periods}
    try:
        reader = pd.read_csv(
            path,
            sep=";",
            decimal=",",
            encoding="utf-8-sig",
            low_memory=False,
            chunksize=chunksize,
            usecols=lambda column: column in wanted,
            dtype={"CUSEC": "string"},
        )
        for chunk in reader:
            seen.update(chunk.columns)
            read_rows += len(chunk)
            if not {"CUSEC", "fecha", "precio_electrico", "Vulnerabilidad"}.issubset(chunk.columns):
                missing = {"CUSEC", "fecha", "precio_electrico", "Vulnerabilidad"} - set(chunk.columns)
                raise ValueError(f"{path}: faltan {sorted(missing)}")
            chunk["CUSEC"] = normalize_cusec(chunk["CUSEC"])
            chunk["CPRO"] = chunk["CUSEC"].str[:2]
            chunk["fecha"] = pd.to_datetime(chunk["fecha"], errors="coerce")
            chunk["precio_electrico"] = numeric(chunk["precio_electrico"])
            chunk["Vulnerabilidad"] = numeric(chunk["Vulnerabilidad"])
            if province:
                chunk = chunk.loc[chunk["CPRO"].eq(str(province).zfill(2))].copy()

            for risk, period in periods.items():
                stress = f"W_{risk}"
                if stress not in chunk:
                    raise ValueError(f"{path}: falta {stress}")
                chunk[stress] = numeric(chunk[stress])
                composite = f"R_{risk}"
                chunk[composite] = risk_values(chunk, risk)

                positive = chunk.loc[chunk[composite].gt(0) & chunk[composite].notna(), ["CPRO", composite]]
                for code, values in positive.groupby("CPRO")[composite]:
                    handle = threshold_handles.get((risk, str(code)))
                    if handle is not None:
                        values.to_numpy(dtype=np.float32).tofile(handle)

                selected = chunk.loc[
                    range_mask(chunk["fecha"], period["ranges"]),
                    ["CUSEC", "CPRO", "fecha", "precio_electrico", stress, composite],
                ]
                kept[risk] += append_partition(selected, temp_root, risk, "base")

            if read_rows % (chunksize * 10) == 0:
                print(f"  {Path(path).name}: {read_rows:,} filas revisadas", flush=True)
    finally:
        for handle in threshold_handles.values():
            handle.close()

    print(
        f"  {Path(path).name}: {read_rows:,} filas leídas; "
        + ", ".join(f"{risk}={count:,}" for risk, count in kept.items()),
        flush=True,
    )
    thresholds: dict[str, dict[str, float | None]] = {}
    for risk in periods:
        thresholds[risk] = {}
        for code in CATALONIA:
            source = threshold_dir / f"{risk}_{code}.f32"
            if not source.exists() or source.stat().st_size == 0:
                thresholds[risk][code] = None
                continue
            values = np.memmap(source, dtype=np.float32, mode="r")
            thresholds[risk][code] = round(float(np.quantile(values, 0.90)), 4)
            del values
    return thresholds, seen, kept


def scan_predictions(
    path: str | Path | None,
    risk: str,
    ranges: list[tuple[pd.Timestamp, pd.Timestamp]],
    province: str | None,
    chunksize: int,
    temp_root: Path,
) -> int:
    if not path:
        print(f"  Aviso: no se proporcionó predicción {risk}", flush=True)
        return 0
    read_rows = kept = 0
    seen: set[str] = set()
    target_source = f"HighRisk_{risk}_h24"
    target_output = f"target_{risk}"
    reader = pd.read_csv(
        path,
        sep=";",
        decimal=",",
        encoding="utf-8-sig",
        low_memory=False,
        chunksize=chunksize,
        usecols=lambda column: column in {"CUSEC", "fecha", "pred_proba", target_source},
        dtype={"CUSEC": "string"},
    )
    for chunk in reader:
        seen.update(chunk.columns)
        read_rows += len(chunk)
        if not {"CUSEC", "fecha", "pred_proba"}.issubset(chunk.columns):
            missing = {"CUSEC", "fecha", "pred_proba"} - set(chunk.columns)
            raise ValueError(f"{path}: faltan {sorted(missing)}")
        chunk["CUSEC"] = normalize_cusec(chunk["CUSEC"])
        # In the model output, fecha is forecast issue time t. The probability
        # and HighRisk_*_h24 target refer to t+24, so the web stores valid time.
        chunk["fecha"] = pd.to_datetime(chunk["fecha"], errors="coerce") + pd.Timedelta(hours=24)
        chunk[f"pred_{risk}"] = numeric(chunk["pred_proba"])
        if target_source in chunk:
            chunk[target_output] = numeric(chunk[target_source])
        mask = range_mask(chunk["fecha"], ranges)
        if province:
            mask &= chunk["CUSEC"].str[:2].eq(str(province).zfill(2))
        columns = ["CUSEC", "fecha", f"pred_{risk}"]
        if target_output in chunk:
            columns.append(target_output)
        selected = chunk.loc[mask, columns]
        kept += append_partition(selected, temp_root, risk, "pred")
        if read_rows % (chunksize * 10) == 0:
            print(f"  {Path(path).name}: {read_rows:,} filas revisadas", flush=True)
    print(f"  {Path(path).name}: {read_rows:,} filas leídas; {kept:,} conservadas", flush=True)
    return kept


def clean_value(value, digits: int = 4, integer: bool = False):
    if pd.isna(value):
        return None
    return int(value) if integer else round(float(value), digits)


def summarize(frame: pd.DataFrame, risk: str) -> dict:
    stress, composite, high, pred = f"W_{risk}", f"R_{risk}", f"HighRisk_{risk}", f"pred_{risk}"
    paired = frame[[pred, high]].dropna() if pred in frame and high in frame else pd.DataFrame()
    result = {
        "mean_stress": clean_value(frame[stress].mean()),
        "max_stress": clean_value(frame[stress].max()),
        "mean_risk": clean_value(frame[composite].mean()),
        "max_risk": clean_value(frame[composite].max()),
        "mean_probability": clean_value(frame[pred].mean()) if pred in frame else None,
        "max_probability": clean_value(frame[pred].max()) if pred in frame else None,
        "high_risk_share": clean_value(frame[high].mean()) if high in frame else None,
        "sections_high_risk": int(frame.loc[frame[high].eq(1), "CUSEC"].nunique()) if high in frame else 0,
        "mean_price": clean_value(frame["precio_electrico"].mean(), 2),
        "max_price": clean_value(frame["precio_electrico"].max(), 2),
        "peak_hour": None,
        "brier_score": None,
        "mean_probability_actual_high": None,
        "mean_probability_actual_normal": None,
        "comparison_observations": int(len(paired)),
    }
    if high in frame and frame[high].eq(1).any():
        shares = frame.groupby("fecha")[high].mean()
        result["peak_hour"] = pd.Timestamp(shares.idxmax()).isoformat()
    if not paired.empty:
        result["brier_score"] = clean_value(((paired[pred] - paired[high]) ** 2).mean())
        result["mean_probability_actual_high"] = clean_value(paired.loc[paired[high].eq(1), pred].mean())
        result["mean_probability_actual_normal"] = clean_value(paired.loc[paired[high].eq(0), pred].mean())
    return result


def write_gzip_json(destination: Path, payload: dict, level: int) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    encoded = json.dumps(payload, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode("utf-8")
    with destination.open("wb") as raw:
        with gzip.GzipFile(fileobj=raw, mode="wb", compresslevel=level, mtime=0) as compressed:
            compressed.write(encoded)


def build_day(
    base_path: Path,
    pred_path: Path,
    risk: str,
    thresholds: dict[str, float | None],
    output: Path,
    gzip_level: int,
) -> tuple[dict, dict]:
    day = base_path.stem
    frame = pd.read_csv(base_path, dtype={"CUSEC": "string", "CPRO": "string"})
    frame["CUSEC"] = normalize_cusec(frame["CUSEC"])
    frame["CPRO"] = frame["CUSEC"].str[:2]
    frame["fecha"] = pd.to_datetime(frame["fecha"], errors="coerce", format="mixed")
    frame = frame.drop_duplicates(["CUSEC", "fecha"], keep="last")
    pred_name = f"pred_{risk}"
    if pred_path.exists():
        predictions = pd.read_csv(pred_path, dtype={"CUSEC": "string"})
        predictions["CUSEC"] = normalize_cusec(predictions["CUSEC"])
        predictions["fecha"] = pd.to_datetime(predictions["fecha"], errors="coerce", format="mixed")
        predictions = predictions.drop_duplicates(["CUSEC", "fecha"], keep="last")
        prediction_columns = ["CUSEC", "fecha", pred_name]
        target_name = f"target_{risk}"
        if target_name in predictions:
            predictions[target_name] = numeric(predictions[target_name])
            prediction_columns.append(target_name)
        frame = frame.merge(predictions[prediction_columns], on=["CUSEC", "fecha"], how="left", validate="one_to_one")
    else:
        frame[pred_name] = np.nan

    high_name, composite = f"HighRisk_{risk}", f"R_{risk}"
    frame[high_name] = 0
    for code, threshold in thresholds.items():
        if threshold is not None:
            mask = frame["CPRO"].eq(code) & frame[composite].ge(threshold)
            frame.loc[mask, high_name] = 1
    target_name = f"target_{risk}"
    if target_name in frame:
        available_target = frame[target_name].notna()
        frame.loc[available_target, high_name] = frame.loc[available_target, target_name].round().clip(0, 1)
    frame[high_name] = frame[high_name].astype("int8")

    times = sorted(frame["fecha"].dropna().unique())
    ids = sorted(frame["CUSEC"].dropna().unique())
    full_index = pd.MultiIndex.from_product([ids, times], names=["CUSEC", "fecha"])
    ordered = frame.set_index(["CUSEC", "fecha"]).reindex(full_index)
    metrics = [f"W_{risk}", composite, high_name, pred_name]
    series = {
        metric: [clean_value(value, 4, metric == high_name) for value in ordered[metric].tolist()]
        for metric in metrics
    }
    prices = frame.groupby("fecha")["precio_electrico"].first().reindex(times)
    summary = summarize(frame, risk)
    summary_by_province = {
        code: summarize(group, risk)
        for code, group in frame.groupby("CPRO")
        if code in CATALONIA
    }
    payload = {
        "format": "columnar-v1",
        "risk": risk,
        "day": day,
        "prediction_horizon_hours": 24,
        "time_basis": "forecast_valid_time",
        "width": len(times),
        "times": [pd.Timestamp(value).isoformat() for value in times],
        "prices": [clean_value(value, 2) for value in prices],
        "ids": ids,
        "series": series,
        "summary": summary,
        "summary_by_province": summary_by_province,
    }
    destination = output / "daily" / risk / f"{day}.json.gz"
    write_gzip_json(destination, payload, gzip_level)
    entry = {
        "date": day,
        "label": pd.Timestamp(day).strftime("%d/%m/%Y"),
        "file": f"data/daily/{risk}/{day}.json.gz",
        "summary": summary,
    }
    return entry, {"raw_rows": len(frame), "ids": len(ids), "hours": len(times), "bytes": destination.stat().st_size}


def build_daily_files(
    periods: dict,
    thresholds: dict,
    temp_root: Path,
    output: Path,
    gzip_level: int,
) -> tuple[dict, dict]:
    period_manifest: dict[str, dict] = {}
    build_stats: dict[str, dict] = {}
    for risk, period in periods.items():
        print(f"Creando días de {period['label']}...", flush=True)
        day_entries = []
        risk_stats = {"days": 0, "compressed_bytes": 0, "rows": 0}
        base_dir = temp_root / "base" / risk
        for base_path in sorted(base_dir.glob("*.csv")):
            pred_path = temp_root / "pred" / risk / base_path.name
            entry, stats = build_day(base_path, pred_path, risk, thresholds[risk], output, gzip_level)
            day_entries.append(entry)
            risk_stats["days"] += 1
            risk_stats["compressed_bytes"] += stats["bytes"]
            risk_stats["rows"] += stats["raw_rows"]
            if risk_stats["days"] % 10 == 0:
                print(f"  {risk}: {risk_stats['days']} días creados", flush=True)
        if not day_entries:
            raise ValueError(f"No se encontraron días para {risk}")
        ranges_json = [
            {"start": start.strftime("%Y-%m-%d"), "end": end.normalize().strftime("%Y-%m-%d")}
            for start, end in period["ranges"]
        ]
        index_payload = {
            "risk": risk,
            "label": period["label"],
            "ranges": ranges_json,
            "days": day_entries,
        }
        index_path = output / "daily" / risk / "index.json"
        index_path.write_text(json.dumps(index_payload, ensure_ascii=False, indent=2, allow_nan=False), encoding="utf-8")
        period_manifest[risk] = {
            "risk": risk,
            "label": period["label"],
            "ranges": ranges_json,
            "start": day_entries[0]["date"],
            "end": day_entries[-1]["date"],
            "day_count": len(day_entries),
            "index": f"data/daily/{risk}/index.json",
        }
        build_stats[risk] = risk_stats
    return period_manifest, build_stats


def main() -> None:
    parser = argparse.ArgumentParser(formatter_class=argparse.ArgumentDefaultsHelpFormatter)
    parser.add_argument("--sections", required=True)
    parser.add_argument("--vulnerability", required=True)
    parser.add_argument("--hourly", required=True)
    parser.add_argument("--pred-heat")
    parser.add_argument("--pred-cold")
    parser.add_argument("--period", action="append", required=True, help='"heat|Període càlid|2025-06-01|2025-08-31"')
    parser.add_argument("--highlight", action="append", default=[], help='"heat|2025-07-01|Episodi destacat de calor"')
    parser.add_argument("--province", default=None, help="08, 17, 25 o 43; omitir para Catalunya")
    parser.add_argument("--simplify", type=float, default=0.00015)
    parser.add_argument("--output-dir", default="data")
    parser.add_argument("--chunksize", type=int, default=250_000)
    parser.add_argument("--gzip-level", type=int, choices=range(1, 10), default=6)
    args = parser.parse_args()

    period_specs = [parse_period(spec) for spec in args.period]
    periods = group_periods(period_specs)
    highlights = [parse_highlight(spec) for spec in args.highlight]
    for highlight in highlights:
        if highlight["risk"] not in periods:
            raise ValueError(f"El destacado {highlight['label']} no pertenece a un periodo exportado")

    output = Path(args.output_dir)
    output.mkdir(parents=True, exist_ok=True)
    daily_root = output / "daily"
    daily_root.mkdir(parents=True, exist_ok=True)
    geo, structural_path = build_structural(args, output)
    temp_root = Path(tempfile.mkdtemp(prefix=".season-build-", dir=output))
    try:
        thresholds, seen, kept_hourly = scan_hourly(
            args.hourly,
            periods,
            args.province,
            args.chunksize,
            temp_root,
        )
        required = {"CUSEC", "fecha", "precio_electrico", "Vulnerabilidad"} | {f"W_{risk}" for risk in periods}
        if not required.issubset(seen):
            raise ValueError(f"--hourly no contiene {sorted(required - seen)}")
        for risk, period in periods.items():
            prediction_path = args.pred_heat if risk == "heat" else args.pred_cold
            scan_predictions(
                prediction_path,
                risk,
                period["ranges"],
                args.province,
                args.chunksize,
                temp_root,
            )
        period_manifest, build_stats = build_daily_files(
            periods,
            thresholds,
            temp_root,
            output,
            args.gzip_level,
        )
    finally:
        shutil.rmtree(temp_root, ignore_errors=True)

    available = {
        risk: {entry["date"] for entry in json.loads((output / "daily" / risk / "index.json").read_text(encoding="utf-8"))["days"]}
        for risk in period_manifest
    }
    for highlight in highlights:
        if highlight["date"] not in available[highlight["risk"]]:
            raise ValueError(f"El destacado {highlight['label']} usa un día no disponible: {highlight['date']}")

    manifest = {
        "version": 2,
        "periods": period_manifest,
        "highlights": highlights,
    }
    (daily_root / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2, allow_nan=False),
        encoding="utf-8",
    )
    metadata = {
        "sections": len(geo),
        "province_filter": args.province,
        "structural_file": str(structural_path),
        "periods": period_manifest,
        "highlights": highlights,
        "q90_thresholds_by_province": thresholds,
        "build_stats": build_stats,
        "hourly_rows_kept": kept_hourly,
        "note": "Missing values are null, never zero. R follows the paper notation; W_* are legacy source names for C_*.",
    }
    (output / "metadata.json").write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2, allow_nan=False),
        encoding="utf-8",
    )
    total_days = sum(item["day_count"] for item in period_manifest.values())
    total_size = sum(item["compressed_bytes"] for item in build_stats.values())
    print(
        f"Terminado: {len(geo):,} secciones, {total_days} días y {total_size / 1024**2:.1f} MiB comprimidos",
        flush=True,
    )


if __name__ == "__main__":
    main()
