const C = window.APP_CONFIG;
const S = {
  // La vista territorial inicial és l'índex estructural V.
  mode: "vulnerability",
  metric: "Vulnerabilidad",
  lockedMode: null,
  province: "all",
  time: 0,
  structural: null,
  dailyManifest: { periods: {}, highlights: [] },
  periodIndexes: {},
  legacyEpisodes: [],
  active: null,
  activeSource: null,
  layer: null,
  compareLayer: null,
  timer: null,
  chart: null,
  selected: null,
  requestId: 0
};

const map = L.map("map").setView(C.center, C.zoom);
const compareMap = L.map("compareMap", { zoomControl: false }).setView(C.center, C.zoom);
window.energyMap = map;
window.energyCompareMap = compareMap;
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "© OpenStreetMap"
}).addTo(map);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "© OpenStreetMap"
}).addTo(compareMap);

let synchronizingMaps = false;
function synchronizeMap(source, target) {
  if (!C.modes[S.mode]?.compare || synchronizingMaps) return;
  synchronizingMaps = true;
  target.setView(source.getCenter(), source.getZoom(), { animate: false });
  synchronizingMaps = false;
}
map.on("moveend zoomend", () => synchronizeMap(map, compareMap));
compareMap.on("moveend zoomend", () => synchronizeMap(compareMap, map));

const $ = id => document.getElementById(id);
const valid = value => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));

function provinceCode(properties) {
  return String(properties.CPRO || properties.CUSEC?.slice(0, 2) || "").padStart(2, "0");
}

// Els fitxers cartogràfics oficials poden utilitzar noms de columna diferents.
// Aquesta funció busca el municipi en tots els noms habituals i manté CUSEC
// únicament com a clau interna per relacionar geometria i dades temporals.
function municipalityName(properties) {
  const candidates = [
    "MUNICIPALITY_NAME",
    "NMUN",
    "NOMMUN",
    "NOM_MUN",
    "NOMMUNI",
    "NOM_MUNICIPI",
    "MUNICIPI",
    "MUNICIPIO"
  ];
  const field = candidates.find(name => String(properties[name] || "").trim());
  return field ? String(properties[field]).trim() : "Municipi no identificat";
}

function riskForMetric(metric) {
  const name = String(metric || "").toLowerCase();
  if (name.includes("heat")) return "heat";
  if (name.includes("cold")) return "cold";
  return null;
}

function episodeRisk(entry) {
  if (["heat", "cold"].includes(entry?.risk)) return entry.risk;
  const text = `${entry?.id || ""} ${entry?.label || ""}`.toLowerCase();
  if (/heat|calor|juny|juliol|june|july/.test(text)) return "heat";
  if (/cold|fred|novembre|november|hivern|winter/.test(text)) return "cold";
  return null;
}

async function decodeJsonResponse(response) {
  if (!response.ok) throw new Error(`${response.status} · ${response.url}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const isGzip = bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
  if (!isGzip) return JSON.parse(new TextDecoder().decode(bytes));
  if (window.DecompressionStream) {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    return new Response(stream).json();
  }
  if (window.pako) {
    return JSON.parse(new TextDecoder().decode(window.pako.ungzip(bytes)));
  }
  throw new Error("El navegador no pot descomprimir les dades diàries.");
}

async function fetchJson(path) {
  return decodeJsonResponse(await fetch(path));
}

async function fetchOptional(path, fallback) {
  try {
    const response = await fetch(path);
    if (response.status === 404) return fallback;
    return await decodeJsonResponse(response);
  } catch (error) {
    console.warn(`No s'ha pogut carregar ${path}`, error);
    return fallback;
  }
}

function visibleFeatures() {
  return S.structural.features.filter(feature => S.province === "all" || provinceCode(feature.properties) === S.province);
}

// Cada vegada que s'obre una vista nova, el punt de partida torna a ser
// Catalunya sencera. El filtre provincial continua disponible perquè
// l'usuari pugui apropar-s'hi després de veure el conjunt del territori.
function selectCatalonia() {
  S.province = "all";
  const provinceSelect = $("provinceSelect");
  if (provinceSelect) provinceSelect.value = "all";
}

function showCatalonia() {
  selectCatalonia();
  S.selected = null;
  resetInfo();
  draw(true);
  renderDailySummary();
}

function palette(metric) {
  if (C.binaryFields.includes(metric)) return C.palettes.binary;
  if (metric.toLowerCase().includes("heat")) return C.palettes.heat;
  if (metric.toLowerCase().includes("cold")) return C.palettes.cold;
  return C.palettes.green;
}

function temporalSeries(metric) {
  const legacy = { R_heat: "STAR_heat", R_cold: "STAR_cold" };
  if (S.active?.format === "columnar-v1") return S.active.series?.[metric] ?? S.active.series?.[legacy[metric]];
  return null;
}

function temporalValue(cusec, metric, timeIndex) {
  if (!S.active) return null;
  if (S.active.format === "columnar-v1") {
    const row = S.active._idIndex?.get(cusec);
    const series = temporalSeries(metric);
    if (row === undefined || !Array.isArray(series)) return null;
    return series[row * S.active.width + timeIndex];
  }
  const legacy = { R_heat: "STAR_heat", R_cold: "STAR_cold" };
  const row = S.active.values?.[cusec];
  const series = row?.[metric] ?? row?.[legacy[metric]];
  return Array.isArray(series) ? series[timeIndex] : null;
}

// Retorna el valor d'una mètrica per a una secció. Aquesta funció comuna
// permet construir de la mateixa manera el mapa principal i el mapa observat.
function featureMetricValue(feature, metric) {
  if (metric === "precio_electrico") return S.active?.prices?.[S.time];
  return C.modes[S.mode].temporal
    ? temporalValue(feature.properties.CUSEC, metric, S.time)
    : feature.properties[metric];
}

function featureValue(feature) {
  return featureMetricValue(feature, S.metric);
}

// Calcula els cinc quintils amb totes les seccions que tenen una dada vàlida
// en el territori seleccionat. Els valors zero també formen part del càlcul;
// només s'exclouen les dades absents, que es representen en gris.
function breaks(metric = S.metric) {
  if (C.binaryFields.includes(metric)) return [0, 1];
  const values = visibleFeatures()
    .map(feature => featureMetricValue(feature, metric))
    .filter(valid)
    .map(Number)
    .sort((a, b) => a - b);
  if (!values.length) return [0, 0.2, 0.4, 0.6, 0.8, 1];
  return [0, 0.2, 0.4, 0.6, 0.8, 1].map(q => values[Math.min(values.length - 1, Math.floor(q * (values.length - 1)))]);
}

function fill(value, cuts, metric = S.metric) {
  if (!valid(value)) return "#cdd3d0";
  const colors = palette(metric);
  if (C.binaryFields.includes(metric)) return Number(value) === 1 ? colors[1] : colors[0];
  let index = 0;
  while (index < 4 && Number(value) > cuts[index + 1]) index += 1;
  return colors[index];
}

function format(value, metric = S.metric) {
  if (!valid(value)) return "Sense dades";
  if (C.probabilityFields.includes(metric)) {
    return `${(Number(value) * 100).toLocaleString("ca-ES", { maximumFractionDigits: 1 })}%`;
  }
  const number = Number(value).toLocaleString("ca-ES", { maximumFractionDigits: 2 });
  const unit = C.metricInfo?.[metric]?.unit;
  return unit ? `${number} ${unit}` : number;
}

function metricLabel() {
  return C.metricInfo?.[S.metric]?.label || C.modes[S.mode].metrics[S.metric] || S.metric;
}

function observedMetric() {
  const risk = riskForMetric(S.metric);
  // La comparació mostra el risc compost continu complet, no un sí/no.
  return risk ? `R_${risk}` : null;
}

function observedValue(feature) {
  const metric = observedMetric();
  return metric ? temporalValue(feature.properties.CUSEC, metric, S.time) : null;
}

function draw(fitMap = false) {
  if (!S.structural) return;
  if (S.layer) S.layer.remove();
  S.layer = null;
  if (S.compareLayer) {
    S.compareLayer.remove();
    S.compareLayer = null;
  }
  // El preu és únic per a tot el territori. En aquesta vista no es dibuixen
  // milers de polígons idèntics: el gràfic horari és la visualització útil.
  if (C.modes[S.mode].priceOnly) {
    renderLegend([]);
    return;
  }
  const cuts = breaks();
  const collection = { type: "FeatureCollection", features: visibleFeatures() };
  S.layer = L.geoJSON(collection, {
    style: feature => ({
      color: "#fff",
      weight: 0.55,
      fillOpacity: 0.8,
      fillColor: fill(featureValue(feature), cuts)
    }),
    onEachFeature: (feature, layer) => {
      const properties = feature.properties;
      layer.bindTooltip(`<b>${municipalityName(properties)}</b><br>${metricLabel()}: ${format(featureValue(feature))}`);
      layer.on({
        mouseover: event => event.target.setStyle({ weight: 2, color: "#183c32" }),
        mouseout: () => S.layer.resetStyle(layer),
        click: () => {
          S.selected = properties.CUSEC;
          showInfo(properties);
        }
      });
    }
  }).addTo(map);
  if (C.modes[S.mode].compare) {
    const actualMetric = observedMetric();
    // Cada mapa es divideix en cinc grups de la mateixa mida. Els talls del
    // mapa observat es calculen sobre R_heat o R_cold, segons correspongui.
    const observedCuts = breaks(actualMetric);
    S.compareLayer = L.geoJSON(collection, {
      style: feature => {
        const value = observedValue(feature);
        return {
          color: "#fff",
          weight: 0.55,
          fillOpacity: 0.8,
          fillColor: fill(value, observedCuts, actualMetric)
        };
      },
      onEachFeature: (feature, layer) => {
        const properties = feature.properties;
        layer.bindTooltip(`<b>${municipalityName(properties)}</b><br>${C.metricInfo?.[actualMetric]?.label || "Risc compost observat"}: ${format(observedValue(feature), actualMetric)}`);
        layer.on({
          mouseover: event => event.target.setStyle({ weight: 2, color: "#183c32" }),
          mouseout: () => S.compareLayer.resetStyle(layer),
          click: () => {
            S.selected = properties.CUSEC;
            showInfo(properties);
          }
        });
      }
    }).addTo(compareMap);
    renderCompareLegend(observedCuts, actualMetric);
  }
  renderLegend(cuts);
  if (fitMap && S.layer.getBounds().isValid()) {
    map.fitBounds(S.layer.getBounds(), { padding: [10, 10] });
    if (C.modes[S.mode].compare) compareMap.fitBounds(S.layer.getBounds(), { padding: [10, 10] });
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// Recupera el valor correcte segons si la variable és estructural, temporal
// o el preu territorial únic guardat en l'array horari.
function valueForInfo(properties, metric) {
  if (metric === "precio_electrico") return S.active?.prices?.[S.time];
  if (["Vulnerabilidad", ...C.structuralComponents].includes(metric)) return properties[metric];
  return temporalValue(properties.CUSEC, metric, S.time);
}

function infoMetric(metric, value, compact = false) {
  const info = C.metricInfo?.[metric] || { label: metric, description: "" };
  return `<article class="info-metric${compact ? " compact" : ""}">
    <div><span>${escapeHtml(info.label)}</span><b>${escapeHtml(format(value, metric))}</b></div>
    ${info.description ? `<small>${escapeHtml(info.description)}</small>` : ""}
  </article>`;
}

// La fitxa lateral ja no barreja totes les variables. Cada vista mostra només
// el valor actiu i els components imprescindibles per interpretar-lo.
function showInfo(properties) {
  const risk = riskForMetric(S.metric);
  const municipality = municipalityName(properties);
  let body = "";

  if (S.mode === "vulnerability") {
    body = `${infoMetric("Vulnerabilidad", properties.Vulnerabilidad)}
      <h3>Indicadors que formen l'índex V</h3>
      <p class="info-intro">Els nou components es normalitzen i es combinen amb el mateix pes.</p>
      <div class="component-list">${C.structuralComponents
        .map(metric => infoMetric(metric, properties[metric], true))
        .join("")}</div>`;
  } else if (S.mode === "thermal") {
    body = infoMetric(S.metric, valueForInfo(properties, S.metric));
  } else if (S.mode === "price") {
    body = `${infoMetric("precio_electrico", valueForInfo(properties, "precio_electrico"))}
      <p class="info-note">Aquest valor és comú a tot Catalunya en l'hora seleccionada.</p>`;
  } else if (S.mode === "risk") {
    const stressMetric = risk ? `W_${risk}` : null;
    body = `${infoMetric(S.metric, valueForInfo(properties, S.metric))}
      <h3>Components del risc</h3>
      <div class="component-list">
        ${infoMetric("Vulnerabilidad", properties.Vulnerabilidad, true)}
        ${stressMetric ? infoMetric(stressMetric, valueForInfo(properties, stressMetric), true) : ""}
        ${infoMetric("precio_electrico", valueForInfo(properties, "precio_electrico"), true)}
      </div>`;
  } else if (S.mode === "prediction") {
    body = infoMetric(S.metric, valueForInfo(properties, S.metric));
  } else if (S.mode === "comparison") {
    const actualMetric = observedMetric();
    body = `<h3>Predicció calculada 24 h abans</h3>
      ${infoMetric(S.metric, valueForInfo(properties, S.metric), true)}
      <h3>Risc observat en aquest moment</h3>
      ${actualMetric ? infoMetric(actualMetric, valueForInfo(properties, actualMetric), true) : ""}`;
  }

  $("info").innerHTML = `<h2>📍 ${escapeHtml(municipality)}</h2>
    <small>${escapeHtml(properties.PROVINCE_NAME || "Catalunya")}</small>
    <p class="info-geo-note">El municipi es pot repetir perquè el mapa representa diverses seccions censals dins del mateix municipi.</p>
    ${body}`;
}

function renderLegend(cuts) {
  if (C.modes[S.mode].priceOnly) {
    $("legend").innerHTML = "<b>Preu únic a Catalunya</b><p>El preu és comú a tot el territori i es representa al gràfic horari.</p>";
    return;
  }
  const colors = palette(S.metric);
  $("legend").innerHTML = C.binaryFields.includes(S.metric)
    ? `<b>Llegenda</b><div class="binary"><i style="background:${colors[0]}"></i>No <i style="background:${colors[1]}"></i>Sí</div>`
    : `<b>Llegenda · quintils</b><div class="ramp"><span>Baix</span>${colors.map(color => `<i style="background:${color}"></i>`).join("")}<span>Alt</span></div><small>Gris = sense dades. Talls: ${cuts.slice(1, -1).map(value => format(value)).join(" · ")}</small>`;
}

// Llegenda independent del segon mapa. Els seus talls pertanyen al valor
// continu del risc observat i, per tant, no s'expressen com a percentatges.
function renderCompareLegend(cuts, metric) {
  const colors = palette(metric);
  $("compareLegend").innerHTML = `<b>Llegenda · quintils</b><div class="ramp"><span>Baix</span>${colors
    .map(color => `<i style="background:${color}"></i>`)
    .join("")}<span>Alt</span></div><small>Gris = sense dades. Talls: ${cuts
    .slice(1, -1)
    .map(value => format(value, metric))
    .join(" · ")}</small>`;
}

function summaryForTerritory() {
  if (!S.active || S.activeSource !== "day") return null;
  if (S.province !== "all") return S.active.summary_by_province?.[S.province] || null;
  return S.active.summary || null;
}

function percent(value) {
  return valid(value) ? `${(Number(value) * 100).toLocaleString("ca-ES", { maximumFractionDigits: 1 })}%` : "—";
}

function number(value, digits = 2) {
  return valid(value) ? Number(value).toLocaleString("ca-ES", { maximumFractionDigits: digits }) : "—";
}

function renderDailySummary() {
  const box = $("dailySummary");
  const summary = summaryForTerritory();
  if (!summary) {
    box.style.display = "none";
    return;
  }
  let cards;
  if (S.mode === "price") {
    cards = [
      ["Preu mitjà", `${number(summary.mean_price)} €/MWh`],
      ["Preu màxim", `${number(summary.max_price)} €/MWh`]
    ];
  } else if (S.mode === "thermal") {
    cards = [
      ["Estrès mitjà", number(summary.mean_stress)],
      ["Estrès màxim", number(summary.max_stress)]
    ];
  } else if (S.mode === "risk") {
    cards = [
      ["Risc mitjà", number(summary.mean_risk)],
      ["Risc màxim", number(summary.max_risk)]
    ];
  } else if (S.mode === "comparison") {
    cards = [
      ["Probabilitat predita mitjana", percent(summary.mean_probability)],
      ["Risc observat mitjà", number(summary.mean_risk)],
      ["Risc observat màxim", number(summary.max_risk)]
    ];
  } else {
    cards = [
      ["Probabilitat mitjana", percent(summary.mean_probability)],
      ["Probabilitat màxima", percent(summary.max_probability)],
      ["Hora de màxima extensió", summary.peak_hour ? new Date(summary.peak_hour).toLocaleTimeString("ca-ES", { hour: "2-digit", minute: "2-digit" }) : "—"]
    ];
  }
  box.style.display = "grid";
  box.innerHTML = cards.map(([label, value]) => `<div><span>${label}</span><b>${value}</b></div>`).join("");
}

function renderPrice() {
  if (!S.active) return;
  if (S.chart) S.chart.destroy();
  const availablePrices = (S.active.prices || []).filter(valid).map(Number);
  const averagePrice = availablePrices.length
    ? availablePrices.reduce((sum, value) => sum + value, 0) / availablePrices.length
    : null;
  S.chart = new Chart($("priceChart"), {
    type: "line",
    data: {
      labels: S.active.times.map(time => new Date(time).toLocaleString("ca-ES", { day: "2-digit", month: "2-digit", hour: "2-digit" })),
      datasets: [
        {
          label: "Preu horari",
          data: S.active.prices,
          borderColor: "#e3693d",
          backgroundColor: "#e3693d22",
          fill: true,
          pointRadius: S.active.times.map((_, index) => index === S.time ? 5 : 0),
          pointBackgroundColor: "#173f35",
          tension: 0.2
        },
        {
          // La línia discontínua permet veure ràpidament la distància dels pics.
          label: `Mitjana · ${averagePrice === null ? "—" : averagePrice.toLocaleString("ca-ES", { maximumFractionDigits: 2 })} €/MWh`,
          data: S.active.times.map(() => averagePrice),
          borderColor: "#315f55",
          borderDash: [7, 5],
          borderWidth: 2,
          fill: false,
          pointRadius: 0,
          tension: 0
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: true, position: "top", labels: { boxWidth: 18 } } },
      scales: {
        x: { ticks: { maxTicksLimit: 8 } },
        y: { title: { display: true, text: "€/MWh" } }
      }
    }
  });
}

function stopPlayback() {
  if (S.timer) clearInterval(S.timer);
  S.timer = null;
  $("playTime").textContent = "▶ Reprodueix";
}

function updateTime() {
  if (!S.active) return;
  S.time = Number($("timeSlider").value);
  const validTime = new Date(S.active.times[S.time]);
  if (S.active.time_basis === "forecast_valid_time" && ["prediction", "comparison"].includes(S.mode)) {
    const issueTime = new Date(validTime.getTime() - 24 * 60 * 60 * 1000);
    $("timeLabel").value = `Moment pronosticat: ${validTime.toLocaleString("ca-ES")} · calculada 24 h abans: ${issueTime.toLocaleString("ca-ES")}`;
  } else {
    $("timeLabel").value = validTime.toLocaleString("ca-ES");
  }
  draw(false);
  if (S.selected) {
    const feature = S.structural.features.find(item => item.properties.CUSEC === S.selected);
    if (feature) showInfo(feature.properties);
  }
  renderPrice();
  renderDailySummary();
}

function prepareDataset(dataset) {
  if (dataset.format === "columnar-v1") {
    dataset._idIndex = new Map(dataset.ids.map((id, index) => [String(id), index]));
  }
  return dataset;
}

async function loadDataset(path, source) {
  const requestId = ++S.requestId;
  stopPlayback();
  $("timeLabel").value = "Carregant…";
  $("info").classList.add("loading");
  try {
    const dataset = prepareDataset(await fetchJson(path));
    if (requestId !== S.requestId) return;
    S.active = dataset;
    S.activeSource = source;
    S.time = 0;
    $("timeSlider").max = Math.max(0, dataset.times.length - 1);
    $("timeSlider").value = 0;
    $("info").classList.remove("loading");
    updateTime();
  } catch (error) {
    if (requestId !== S.requestId) return;
    console.error("Error carregant les dades temporals:", error);
    $("timeLabel").value = "Dades no disponibles";
    $("info").classList.remove("loading");
    $("info").innerHTML = "<h2>Dades no disponibles</h2><p>No s'han pogut carregar les dades d'aquest moment. Prova un altre període o torna-ho a intentar més tard.</p>";
  }
}

function periodKeys() {
  const keys = Object.keys(S.dailyManifest.periods || {});
  const risk = riskForMetric(S.metric);
  return risk ? keys.filter(key => key === risk) : keys;
}

async function loadPeriodIndex(risk) {
  if (!S.periodIndexes[risk]) {
    const descriptor = S.dailyManifest.periods[risk];
    if (!descriptor) return null;
    S.periodIndexes[risk] = await fetchJson(descriptor.index);
  }
  return S.periodIndexes[risk];
}

function fillDateSelect(index, preferredDate = null) {
  const select = $("dateSelect");
  const previous = preferredDate || select.value;
  select.innerHTML = index.days.map(day => `<option value="${day.date}">${day.label}</option>`).join("");
  if (index.days.some(day => day.date === previous)) select.value = previous;
}

async function loadSelectedDay() {
  const risk = $("periodSelect").value;
  const index = await loadPeriodIndex(risk);
  const entry = index?.days.find(day => day.date === $("dateSelect").value);
  if (entry) await loadDataset(entry.file, "day");
}

async function selectPeriod(risk, preferredDate = null) {
  const index = await loadPeriodIndex(risk);
  if (!index) return false;
  $("periodSelect").value = risk;
  fillDateSelect(index, preferredDate);
  await loadSelectedDay();
  return true;
}

function compatibleLegacyEpisodes() {
  const risk = riskForMetric(S.metric);
  return risk ? S.legacyEpisodes.filter(entry => episodeRisk(entry) === risk) : S.legacyEpisodes;
}

function syncHighlights() {
  const risk = riskForMetric(S.metric);
  const daily = (S.dailyManifest.highlights || []).filter(entry => !risk || entry.risk === risk)
    .map(entry => ({ value: `day|${entry.risk}|${entry.date}`, label: entry.label }));
  const legacy = compatibleLegacyEpisodes()
    .map(entry => ({ value: `legacy|${entry.id}`, label: entry.label }));
  const options = [...daily, ...legacy];
  $("episodeSelect").innerHTML = `<option value="">Selecciona un accés ràpid…</option>${options.map(entry => `<option value="${entry.value}">${entry.label}</option>`).join("")}`;
  $("episodeWrap").style.display = options.length ? "flex" : "none";
  return options;
}

async function loadHighlight(value) {
  if (!value) return;
  const [type, first, second] = value.split("|");
  if (type === "day") {
    await selectPeriod(first, second);
    return;
  }
  const entry = S.legacyEpisodes.find(item => item.id === first);
  if (entry) await loadDataset(entry.file, "episode");
}

async function configureTemporal() {
  syncHighlights();
  const keys = periodKeys();
  if (keys.length) {
    $("periodWrap").style.display = "flex";
    // El dia segueix seleccionant el fitxer intern correcte, però el control
    // no es presenta a la interfície per mantenir el visor més senzill.
    $("dateWrap").style.display = "none";
    const previous = $("periodSelect").value;
    $("periodSelect").innerHTML = keys.map(key => `<option value="${key}">${S.dailyManifest.periods[key].label}</option>`).join("");
    const selected = keys.includes(previous) ? previous : keys[0];
    await selectPeriod(selected);
    return;
  }
  $("periodWrap").style.display = "none";
  $("dateWrap").style.display = "none";
  if (C.modes[S.mode].compare) {
    S.active = null;
    $("timeLabel").value = "Dades temporals no disponibles";
    $("info").innerHTML = "<h2>Dades no disponibles</h2><p>No hi ha dades disponibles per a aquesta comparació.</p>";
    draw(false);
    return;
  }
  const legacy = compatibleLegacyEpisodes();
  if (legacy.length) await loadDataset(legacy[0].file, "episode");
  else $("timeLabel").value = "No hi ha dades temporals";
}

function resetInfo() {
  $("info").innerHTML = "<h2>Selecciona una zona</h2><p>Fes clic en una secció censal per consultar el municipi i la informació rellevant.</p>";
}

// Omple el selector de vistes. Si l'usuari arriba des d'un botó «Explora»,
// el selector conté només aquella vista; l'accés directe del menú les recupera totes.
function renderModeSelect(onlyMode = null) {
  const entries = onlyMode ? [[onlyMode, C.modes[onlyMode]]] : Object.entries(C.modes);
  $("modeSelect").innerHTML = entries
    .map(([value, mode]) => `<option value="${value}">${mode.label}</option>`)
    .join("");
  $("modeSelect").disabled = Boolean(onlyMode);
  $("modeSelect").title = onlyMode ? "Vista actual" : "Canvia de vista";
}

async function setMode(mode, options = {}) {
  if (!C.modes[mode]) return;
  stopPlayback();
  // Una vista nova sempre s'obre amb Catalunya com a territori actiu.
  selectCatalonia();
  if (options.locked === true) S.lockedMode = mode;
  if (options.locked === false) S.lockedMode = null;
  renderModeSelect(S.lockedMode);
  S.mode = mode;
  S.metric = Object.keys(C.modes[mode].metrics)[0];
  S.selected = null;
  resetInfo();
  $("viewTitle").textContent = C.modes[mode].label;
  $("viewEyebrow").textContent = C.modes[mode].priceOnly
    ? "EVOLUCIÓ HORÀRIA"
    : "CATALUNYA I LES QUATRE PROVÍNCIES";
  $("modeSelect").value = mode;
  $("metricSelect").innerHTML = Object.entries(C.modes[mode].metrics)
    .map(([value, name]) => `<option value="${value}">${name}</option>`).join("");
  const temporal = C.modes[mode].temporal;
  const compare = Boolean(C.modes[mode].compare);
  const priceOnly = Boolean(C.modes[mode].priceOnly);
  const visual = document.querySelector(".visual");
  visual.classList.toggle("compare-view", compare);
  visual.classList.toggle("price-view", priceOnly);
  const territoryWrap = $("territoryWrap");
  if (territoryWrap) territoryWrap.style.display = priceOnly ? "none" : "flex";
  $("primaryMapTitle").textContent = compare ? "1 · Probabilitat predita per a aquest moment" : "";
  $("compareMapTitle").textContent = compare ? "2 · Risc compost observat en aquest moment" : "";
  const compareHelp = $("compareHelp");
  if (compareHelp) compareHelp.style.display = compare ? "block" : "none";
  $("timeControls").style.display = temporal ? "block" : "none";
  $("pricePanel").style.display = priceOnly ? "flex" : "none";
  if (temporal) {
    await configureTemporal();
    // configureTemporal carrega les dades i dibuixa el mapa. Aquest segon
    // dibuix només ajusta l'enquadrament al conjunt complet de Catalunya.
    draw(true);
  }
  else {
    $("periodWrap").style.display = "none";
    $("dateWrap").style.display = "none";
    $("episodeWrap").style.display = "none";
    $("dailySummary").style.display = "none";
    draw(true);
  }
  setTimeout(() => {
    map.invalidateSize();
    if (compare) compareMap.invalidateSize();
  }, 80);
}

function openMode(mode) {
  return setMode(mode, { locked: true });
}

function showAllModes() {
  S.lockedMode = null;
  renderModeSelect();
  $("modeSelect").value = S.mode;
}

function step(delta) {
  if (!S.active) return;
  $("timeSlider").value = (S.time + delta + S.active.times.length) % S.active.times.length;
  updateTime();
}

function addProvinceControl() {
  const label = document.createElement("label");
  label.id = "territoryWrap";
  label.innerHTML = '<span>Territori</span><select id="provinceSelect"><option value="all">Catalunya</option><option value="08">Barcelona</option><option value="17">Girona</option><option value="25">Lleida</option><option value="43">Tarragona</option></select>';
  document.querySelector(".workspace aside").prepend(label);
  $("provinceSelect").onchange = event => {
    S.province = event.target.value;
    S.selected = null;
    resetInfo();
    draw(true);
    renderDailySummary();
  };
}

renderModeSelect();
$("modeSelect").onchange = event => setMode(event.target.value);
$("metricSelect").onchange = async event => {
  S.metric = event.target.value;
  if (C.modes[S.mode].temporal) await configureTemporal();
  else draw(false);
};
$("periodSelect").onchange = event => selectPeriod(event.target.value);
$("dateSelect").onchange = loadSelectedDay;
$("episodeSelect").onchange = event => loadHighlight(event.target.value);
$("timeSlider").oninput = updateTime;
$("prevTime").onclick = () => step(-1);
$("nextTime").onclick = () => step(1);
$("playTime").onclick = () => {
  if (S.timer) stopPlayback();
  else {
    S.timer = setInterval(() => step(1), 700);
    $("playTime").textContent = "Ⅱ Pausa";
  }
};

Promise.all([
  fetchJson(C.structuralGeoJSON),
  fetchOptional(C.dailyManifest, { version: 0, periods: {}, highlights: [] }),
  fetchOptional(C.episodeManifest, [])
]).then(([structural, dailyManifest, legacyEpisodes]) => {
  S.structural = structural;
  S.dailyManifest = dailyManifest;
  S.legacyEpisodes = Array.isArray(legacyEpisodes) ? legacyEpisodes : [];
  addProvinceControl();
  setMode(S.lockedMode || S.mode, { locked: Boolean(S.lockedMode) });
}).catch(error => {
  console.error("Error inicialitzant el visor:", error);
  $("map").innerHTML = "<div class=\"error\"><b>No s'han pogut carregar les dades.</b><p>Comprova la connexió i torna-ho a intentar més tard.</p></div>";
});

window.EnergyExplorer = { setMode, openMode, showAllModes, showCatalonia };
