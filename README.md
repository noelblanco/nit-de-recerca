# Nit de la Recerca · energia i territori a Catalunya

Portal web estàtic que reuneix dos projectes:

- **Biomassa Catalunya**: projecte complet amb continguts, dades, càlculs i mapa comarcal interactiu.
- **Vulnerabilitat energètica**: recorregut divulgatiu i explorador cartogràfic complet.

Creadores: **Esther Estruch Bosch, Elisa Trujillo-Baute i Noel Blanco**.

## Estructura

```text
nit-de-recerca/
├── index.html
├── css/style.css
├── biomassa/
│   ├── index.html
│   ├── css/style.css
│   ├── js/
│   └── data/
├── js/
│   ├── app.js
│   ├── config.js
│   └── mapa.js
├── scripts/
│   ├── build_web_data.py
│   └── update_municipality_names.py
└── data/
```

La carpeta `biomassa/data/` ja inclou les dades del projecte de Biomassa. La carpeta principal no duplica els fitxers generats de vulnerabilitat energètica, que ocupen molts megabytes: cal copiar-hi `data/` de la versió completa anterior.

## Notes científiques

- `V` és un índex estructural relatiu construït amb nou variables normalitzades.
- `R_heat` i `R_cold` són índexs compostos continus; el visor els divideix en cinc quintils.
- La predicció mostra probabilitats a +24 hores; no és una alerta oficial.
- La cartografia cobreix Catalunya. La validació publicada del predictor correspon a Barcelona; Girona, Lleida i Tarragona són una extensió exploratòria pendent de validació específica.
