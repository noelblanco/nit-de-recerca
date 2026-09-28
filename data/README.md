Esta carpeta se completa automáticamente al ejecutar:

```bash
python scripts/build_web_data.py ...
```

Archivos esperados:

```text
energy_vulnerability_sections.geojson
metadata.json
daily/manifest.json
daily/heat/index.json
daily/heat/<fecha>.json.gz
daily/cold/index.json
daily/cold/<fecha>.json.gz
episodes/manifest.json
episodes/<episodio>.json
```

`energy_vulnerability_sections.geojson` debe incluir `MUNICIPALITY_NAME`.
Si copias `data/` de una versión anterior, ejecuta:

```bash
python scripts/update_municipality_names.py --sections RUTA/SECC_CE_20240101.shp
```

`daily/` contiene el calendario estacional completo. `episodes/` se conserva para compatibilidad con la primera versión de la web.

No copies aquí los datos originales de ICAEN, INE, ERA5, precios o clientes.
