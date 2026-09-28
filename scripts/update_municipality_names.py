#!/usr/bin/env python3
"""Add municipality names to an already generated structural GeoJSON.

Use this small updater when ``data/`` already exists and rebuilding all daily
files would be unnecessary. It only touches the structural GeoJSON; the
compressed daily files remain unchanged.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import geopandas as gpd
import pandas as pd


def normalize_cusec(series: pd.Series) -> pd.Series:
    """Keep census identifiers as ten-character strings."""
    return (
        series.astype("string")
        .str.replace(r"\.0$", "", regex=True)
        .str.strip()
        .str.zfill(10)
    )


def find_field(frame: gpd.GeoDataFrame, accepted: set[str], description: str) -> str:
    """Find a field without depending on one specific shapefile version."""
    field = next((column for column in frame.columns if column.upper() in accepted), None)
    if not field:
        raise ValueError(f"No se ha encontrado la columna de {description}")
    return field


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Añade el nombre del municipio al GeoJSON web existente."
    )
    parser.add_argument("--sections", required=True, help="Shapefile oficial de secciones censales")
    parser.add_argument(
        "--geojson",
        default="data/energy_vulnerability_sections.geojson",
        help="GeoJSON estructural que se actualizará",
    )
    args = parser.parse_args()

    destination = Path(args.geojson)
    if not destination.exists():
        raise FileNotFoundError(destination)

    # 1. Read only the two identifiers needed from the source cartography.
    sections = gpd.read_file(args.sections)
    census_field = find_field(
        sections,
        {"CUSEC", "CUSEC2024", "CUSEC_2024"},
        "código de sección censal",
    )
    municipality_field = find_field(
        sections,
        {
            "MUNICIPALITY_NAME",
            "NMUN",
            "NOMMUN",
            "NOM_MUN",
            "NOMMUNI",
            "NOM_MUNICIPI",
            "MUNICIPI",
            "MUNICIPIO",
        },
        "nombre de municipio",
    )
    lookup = sections[[census_field, municipality_field]].copy()
    lookup.columns = ["CUSEC", "MUNICIPALITY_NAME"]
    lookup["CUSEC"] = normalize_cusec(lookup["CUSEC"])
    lookup["MUNICIPALITY_NAME"] = lookup["MUNICIPALITY_NAME"].astype("string").str.strip()
    lookup = lookup.drop_duplicates("CUSEC")

    # 2. Join names to the existing lightweight web geometry.
    web = gpd.read_file(destination)
    web["CUSEC"] = normalize_cusec(web["CUSEC"])
    web = web.drop(columns=["MUNICIPALITY_NAME"], errors="ignore")
    web = web.merge(lookup, on="CUSEC", how="left", validate="one_to_one")

    missing = int(web["MUNICIPALITY_NAME"].isna().sum())
    temporary = destination.with_name(f"{destination.stem}.tmp.geojson")
    web.to_file(temporary, driver="GeoJSON")
    temporary.replace(destination)

    print(f"Actualizado: {destination}")
    print(f"Secciones: {len(web):,} · sin nombre de municipio: {missing:,}")


if __name__ == "__main__":
    main()
