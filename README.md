# Nit de la Recerca · energia i territori a Catalunya

Portal web estàtic que reuneix dos projectes:

- **Biomassa Catalunya**: projecte complet amb continguts, dades, càlculs i mapa comarcal interactiu.
- **Vulnerabilitat energètica**: recorregut divulgatiu i explorador cartogràfic complet.

Creadores: **Esther Estruch Bosch, Elisa Trujillo-Baute i Noel Blanco**.

## Canvis d'aquesta versió

- la vista de preu elèctric elimina el mapa, que no aporta variació territorial;
- el gràfic horari i la línia mitjana ocupen ara tot l'espai principal;
- el selector de territori s'oculta únicament en la vista de preu;
- les dues targetes de la portada tenen la mateixa línia superior de color;
- la referència del paper mostra autores, any i títol complet;
- tots els mapes del projecte energètic s'obren mostrant Catalunya sencera;
- el selector visible `Dia` s'elimina, tot mantenint la càrrega interna de la data correcta;
- el títol de portada passa a ser **Pot augmentar la vulnerabilitat energètica?**;
- incorporació completa de **Biomassa Catalunya** des de la versió `59bb106` del repositori original;
- accés real al projecte de biomassa des de la portada comuna;
- la portada comuna amaga el menú intern del projecte de vulnerabilitat;
- el menú s'oculta també des de l'HTML i el JavaScript per evitar que una versió antiga del CSS o la memòria cau el torni a mostrar;
- les proporcions tipogràfiques i de composició de Biomassa s'alineen amb les fitxes explicatives del projecte energètic;
- tipografia, colors i botó «Projectes» de Biomassa adaptats al portal comú, sense modificar-ne els continguts, dades ni càlculs;
- nova portada comuna per als dos projectes;
- diagrama navegable `Territori + clima i preu → risc → predicció +24 h`;
- el botó «Explora» obre només la vista demanada;
- botó per tornar del mapa a l'explicació anterior;
- eliminació de la vista separada d'indicadors territorials;
- `Vulnerabilitat agregada` passa a dir-se **Vulnerabilitat estructural**;
- la fitxa de vulnerabilitat mostra els nou indicadors que formen `V`, amb definició i unitat;
- la vista de risc compost només ofereix calor (`R_heat`) i fred (`R_cold`);
- la fitxa lateral mostra només les dades rellevants per a la vista activa;
- el nom del municipi substitueix el codi censal visible;
- el gràfic de preu inclou una línia discontínua amb la mitjana del període.

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

## 1. Copiar les dades de la versió anterior

Des de la carpeta `nit-de-recerca`:

```bash
cp -R "/Users/noelblanco/Downloads/energy_web_poject/energy-vulnerability-catalunya-complete/data/." data/
```

Comprova els dos fitxers principals:

```bash
ls -lh data/energy_vulnerability_sections.geojson data/daily/manifest.json
```

## 2. Afegir els noms dels municipis sense regenerar totes les dades

La versió anterior del GeoJSON només conservava el codi `CUSEC`. Aquest script incorpora el nom oficial del municipi i **no modifica els fitxers diaris**:

```bash
python scripts/update_municipality_names.py \
  --sections "../seccionado_2024/SECC_CE_20240101.shp" \
  --geojson "data/energy_vulnerability_sections.geojson"
```

Si la ruta del `shp` és diferent, substitueix-la per la ruta real. El script detecta noms de camp habituals com `NMUN`, `NOMMUN` o `MUNICIPI`.

## 3. Veure la web al Mac

Els navegadors bloquegen `fetch()` quan s'obre `index.html` directament amb `file://`. Per això cal servir la carpeta per HTTP:

```bash
cd "/Users/noelblanco/Downloads/energy_web_poject/nit-de-recerca"
python3 -m http.server 8000
```

Obre [http://localhost:8000](http://localhost:8000). Després d'actualitzar fitxers, força la recàrrega amb `⌘ + Shift + R`.

## 4. Publicar a GitHub Pages

GitHub Pages serveix els fitxers estàtics però **no executa Python**. Els scripts s'han d'executar al Mac abans de fer el `git push`; els resultats de `data/` sí que s'han de pujar.

```bash
touch .nojekyll
git init
git branch -M main
git add index.html css js data scripts README.md requirements.txt .nojekyll .gitignore
git commit -m "Publish Nit de la Recerca energy portal"
git remote add origin https://github.com/USUARI/nit-de-recerca.git
git push -u origin main
```

Després, a GitHub: **Settings → Pages → Deploy from a branch → main → /(root) → Save**.

La URL tindrà aquesta forma:

```text
https://USUARI.github.io/nit-de-recerca/
```

## 5. Regenerar totes les dades des de zero (opcional)

El generador complet ja conserva `MUNICIPALITY_NAME` al GeoJSON:

```bash
python scripts/build_web_data.py \
  --sections "../seccionado_2024/SECC_CE_20240101.shp" \
  --vulnerability "../website_inputs/V_indicator_CUSEC_Catalonia.csv" \
  --hourly "../website_inputs/W_V_P_indicators_2025_Catalonia.csv" \
  --pred-heat "../website_inputs/predicciones_probabilidades_heat_Catalonia.csv" \
  --pred-cold "../website_inputs/predicciones_probabilidades_cold_Catalonia.csv" \
  --period "heat|Període càlid · juny-agost|2025-06-01|2025-08-31" \
  --period "cold|Període fred · febrer-març i novembre-desembre|2025-02-01|2025-03-31" \
  --period "cold|Període fred · febrer-març i novembre-desembre|2025-11-01|2025-12-30" \
  --highlight "heat|2025-07-01|Episodi destacat de calor · 1 de juliol" \
  --highlight "cold|2025-11-21|Episodi destacat de fred · 21 de novembre" \
  --output-dir data
```

## Notes científiques

- `V` és un índex estructural relatiu construït amb nou variables normalitzades.
- `R_heat` i `R_cold` són índexs compostos continus; el visor els divideix en cinc quintils.
- La predicció mostra probabilitats a +24 hores; no és una alerta oficial.
- La cartografia cobreix Catalunya. La validació publicada del predictor correspon a Barcelona; Girona, Lleida i Tarragona són una extensió exploratòria pendent de validació específica.
