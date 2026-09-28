#!/usr/bin/env Rscript

# Auditoría reproducible de la web de vulnerabilidad energética.
#
# Uso recomendado desde la raíz del proyecto:
#
#   install.packages(c("data.table", "jsonlite"))
#   Rscript scripts/audit_energy_web.R \
#     --project-dir . \
#     --web-url http://localhost:8000 \
#     --province 08 \
#     --max-metric-rows 2000000
#
# Comprobación profunda contra los CSV originales (más lenta, escanea ambos CSV):
#
#   Rscript scripts/audit_energy_web.R \
#     --project-dir . \
#     --web-url http://localhost:8000 \
#     --province 08 \
#     --raw-check \
#     --pred-heat ../website_inputs/predicciones_probabilidades_heat_Catalonia.csv \
#     --pred-cold ../website_inputs/predicciones_probabilidades_cold_Catalonia.csv
#
# Comprobación opcional del diseño en Chrome/Chromium:
#   install.packages("chromote")
#   ... añadir --browser-check al comando anterior.

options(stringsAsFactors = FALSE, scipen = 999)

args <- commandArgs(trailingOnly = TRUE)

arg_value <- function(flag, default = NULL) {
  where <- which(args == flag)
  if (!length(where)) return(default)
  position <- where[[1]] + 1L
  if (position > length(args) || startsWith(args[[position]], "--")) {
    stop(sprintf("Falta el valor de %s", flag), call. = FALSE)
  }
  args[[position]]
}

has_flag <- function(flag) flag %in% args

# Operador auxiliar para valores opcionales procedentes de listas JSON.
`%||%` <- function(left, right) if (is.null(left) || !length(left)) right else left

required_packages <- c("data.table", "jsonlite")
missing_packages <- required_packages[
  !vapply(required_packages, requireNamespace, logical(1), quietly = TRUE)
]
if (length(missing_packages)) {
  stop(
    paste0(
      "Faltan paquetes: ", paste(missing_packages, collapse = ", "),
      ". Instálalos con: install.packages(c(",
      paste(sprintf('"%s"', missing_packages), collapse = ", "), "))"
    ),
    call. = FALSE
  )
}

suppressPackageStartupMessages({
  library(data.table)
  library(jsonlite)
})

project_dir <- normalizePath(
  arg_value("--project-dir", "."), mustWork = TRUE
)
output_dir <- arg_value(
  "--output-dir", file.path(project_dir, "audit_results")
)
dir.create(output_dir, recursive = TRUE, showWarnings = FALSE)

web_url <- sub("/$", "", arg_value("--web-url", "http://localhost:8000"))
province <- sprintf("%02d", as.integer(arg_value("--province", "08")))
max_metric_rows <- as.integer(arg_value("--max-metric-rows", "2000000"))
if (!is.finite(max_metric_rows) || max_metric_rows < 10000L) {
  stop("--max-metric-rows debe ser al menos 10000", call. = FALSE)
}

raw_check <- has_flag("--raw-check")
browser_check <- has_flag("--browser-check")
pred_heat_path <- arg_value(
  "--pred-heat",
  file.path(project_dir, "..", "website_inputs", "predicciones_probabilidades_heat_Catalonia.csv")
)
pred_cold_path <- arg_value(
  "--pred-cold",
  file.path(project_dir, "..", "website_inputs", "predicciones_probabilidades_cold_Catalonia.csv")
)

checks <- list()
record_check <- function(check, status, detail) {
  status <- toupper(status)
  if (!status %in% c("PASS", "WARN", "FAIL", "SKIP")) {
    stop("Estado de comprobación no válido", call. = FALSE)
  }
  checks[[length(checks) + 1L]] <<- data.table(
    check = check,
    status = status,
    detail = as.character(detail)
  )
  icon <- switch(status, PASS = "[OK]", WARN = "[AVISO]", FAIL = "[FALLO]", SKIP = "[OMITIDO]")
  message(sprintf("%s %s: %s", icon, check, detail))
}

finish_checks <- function() {
  result <- if (length(checks)) rbindlist(checks, fill = TRUE) else data.table()
  fwrite(result, file.path(output_dir, "web_test_results.csv"))
  result
}

read_json_file <- function(path) {
  compressed <- grepl("\\.gz$", path, ignore.case = TRUE)
  connection <- if (compressed) gzfile(path, open = "rt", encoding = "UTF-8") else file(path, open = "rt", encoding = "UTF-8")
  on.exit(close(connection), add = TRUE)
  jsonlite::fromJSON(connection, simplifyVector = FALSE)
}

list_character <- function(x) {
  if (is.null(x)) return(character())
  if (is.atomic(x)) return(as.character(x))
  vapply(x, function(value) {
    if (is.null(value) || !length(value)) NA_character_ else as.character(value[[1]])
  }, character(1))
}

list_numeric <- function(x, expected_length = NULL) {
  if (is.null(x)) {
    if (is.null(expected_length)) return(numeric())
    return(rep(NA_real_, expected_length))
  }
  if (is.atomic(x)) {
    result <- suppressWarnings(as.numeric(x))
  } else {
    result <- vapply(x, function(value) {
      if (is.null(value) || !length(value)) NA_real_ else suppressWarnings(as.numeric(value[[1]]))
    }, numeric(1))
  }
  if (!is.null(expected_length) && length(result) != expected_length) {
    stop(sprintf("Longitud %s; se esperaba %s", length(result), expected_length), call. = FALSE)
  }
  result
}

normalize_cusec <- function(x) {
  x <- trimws(sub("\\.0$", "", as.character(x)))
  missing <- is.na(x) | x == ""
  padding <- pmax(0L, 10L - nchar(x))
  padding[missing] <- 0L
  result <- paste0(vapply(padding, function(n) paste(rep("0", n), collapse = ""), character(1)), x)
  result[missing] <- NA_character_
  result
}

parse_time <- function(x) {
  x <- sub("Z$", "", x)
  x <- sub("[+]00:00$", "", x)
  x <- gsub("T", " ", x, fixed = TRUE)
  as.POSIXct(x, tz = "UTC", format = "%Y-%m-%d %H:%M:%S")
}

relative_file <- function(path) {
  file.path(project_dir, sub("^/+", "", path))
}

roc_auc_value <- function(y, score) {
  good <- is.finite(score) & !is.na(y)
  y <- as.integer(y[good])
  score <- score[good]
  n_pos <- sum(y == 1L)
  n_neg <- sum(y == 0L)
  if (!n_pos || !n_neg) return(NA_real_)
  ranks <- rank(score, ties.method = "average")
  (sum(ranks[y == 1L]) - n_pos * (n_pos + 1) / 2) / (n_pos * n_neg)
}

# Equivalente a sklearn.metrics.average_precision_score para una clase binaria.
average_precision_value <- function(y, score) {
  good <- is.finite(score) & !is.na(y)
  y <- as.integer(y[good])
  score <- score[good]
  n_pos <- sum(y == 1L)
  if (!n_pos) return(NA_real_)
  grouped <- data.table(score = score, y = y)[
    , .(positive = sum(y == 1L), total = .N), by = score
  ][order(-score)]
  grouped[, true_positive := cumsum(positive)]
  grouped[, predicted_positive := cumsum(total)]
  grouped[, recall := true_positive / n_pos]
  grouped[, precision := true_positive / predicted_positive]
  grouped[, previous_recall := shift(recall, fill = 0)]
  grouped[, sum((recall - previous_recall) * precision)]
}

metric_values <- function(score, observed) {
  good <- is.finite(score) & !is.na(observed)
  score <- score[good]
  observed <- as.integer(observed[good])
  if (!length(score)) {
    return(list(
      n = 0L, positives = 0L, prevalence = NA_real_, mean_probability = NA_real_,
      roc_auc = NA_real_, pr_auc = NA_real_, brier = NA_real_
    ))
  }
  list(
    n = length(score),
    positives = sum(observed == 1L),
    prevalence = mean(observed == 1L),
    mean_probability = mean(score),
    roc_auc = roc_auc_value(observed, score),
    pr_auc = average_precision_value(observed, score),
    brier = mean((score - observed)^2)
  )
}

classification_values <- function(score, observed, threshold = 0.5) {
  good <- is.finite(score) & !is.na(observed)
  score <- score[good]
  observed <- as.integer(observed[good])
  predicted <- as.integer(score >= threshold)
  tp <- sum(predicted == 1L & observed == 1L)
  fp <- sum(predicted == 1L & observed == 0L)
  fn <- sum(predicted == 0L & observed == 1L)
  tn <- sum(predicted == 0L & observed == 0L)
  precision <- if ((tp + fp) > 0L) tp / (tp + fp) else NA_real_
  recall <- if ((tp + fn) > 0L) tp / (tp + fn) else NA_real_
  specificity <- if ((tn + fp) > 0L) tn / (tn + fp) else NA_real_
  f1 <- if (is.finite(precision) && is.finite(recall) && (precision + recall) > 0) {
    2 * precision * recall / (precision + recall)
  } else {
    NA_real_
  }
  list(
    threshold = threshold, tp = tp, fp = fp, fn = fn, tn = tn,
    precision = precision, recall = recall, specificity = specificity, f1 = f1
  )
}

payload_to_long <- function(payload, risk, province_code = NULL) {
  ids <- normalize_cusec(list_character(payload$ids))
  times_text <- list_character(payload$times)
  width <- as.integer(payload$width)
  if (!is.finite(width) || width != length(times_text)) {
    stop("width no coincide con times", call. = FALSE)
  }
  expected <- length(ids) * width
  score <- list_numeric(payload$series[[paste0("pred_", risk)]], expected)
  observed <- list_numeric(payload$series[[paste0("HighRisk_", risk)]], expected)
  selected_ids <- seq_along(ids)
  if (!is.null(province_code)) {
    selected_ids <- selected_ids[substr(ids[selected_ids], 1L, 2L) == province_code]
  }
  if (!length(selected_ids)) return(data.table())
  flat_rows <- unlist(lapply(selected_ids, function(i) {
    first <- (i - 1L) * width + 1L
    first:(first + width - 1L)
  }), use.names = FALSE)
  data.table(
    CUSEC = rep(ids[selected_ids], each = width),
    valid_time = rep(parse_time(times_text), times = length(selected_ids)),
    score = score[flat_rows],
    observed = observed[flat_rows]
  )
}

write_empty_report_and_exit <- function(reason) {
  result <- finish_checks()
  writeLines(
    c("# Auditoría de la web", "", paste("No se pudo continuar:", reason)),
    file.path(output_dir, "audit_summary.md")
  )
  quit(status = 1L)
}

message("\n1. Comprobando archivos estáticos y cartografía...")

required_local_files <- c(
  "index.html", "css/style.css", "js/config.js", "js/mapa.js", "js/app.js",
  "data/energy_vulnerability_sections.geojson", "data/daily/manifest.json"
)
for (item in required_local_files) {
  found <- file.exists(file.path(project_dir, item))
  record_check(
    paste0("Archivo local: ", item),
    if (found) "PASS" else "FAIL",
    if (found) "presente" else "no encontrado"
  )
}

manifest_path <- file.path(project_dir, "data", "daily", "manifest.json")
if (!file.exists(manifest_path)) {
  write_empty_report_and_exit("Falta data/daily/manifest.json; hay que regenerar los datos diarios.")
}

index_html <- paste(readLines(file.path(project_dir, "index.html"), warn = FALSE, encoding = "UTF-8"), collapse = "\n")
mapa_js <- paste(readLines(file.path(project_dir, "js", "mapa.js"), warn = FALSE, encoding = "UTF-8"), collapse = "\n")
record_check("Contenedor del segundo mapa", if (grepl('id="compareMap"', index_html, fixed = TRUE)) "PASS" else "FAIL", "index.html debe contener #compareMap")
record_check("Modo de comparación", if (grepl("compare-view", mapa_js, fixed = TRUE)) "PASS" else "FAIL", "mapa.js debe activar compare-view")
record_check("Etiqueta temporal t+24", if (grepl("forecast_valid_time", mapa_js, fixed = TRUE)) "PASS" else "FAIL", "mapa.js debe distinguir validez y emisión")

structural_path <- file.path(project_dir, "data", "energy_vulnerability_sections.geojson")
structural_ids <- character()
if (file.exists(structural_path)) {
  structural <- tryCatch(read_json_file(structural_path), error = identity)
  if (inherits(structural, "error")) {
    record_check("Lectura del GeoJSON", "FAIL", conditionMessage(structural))
  } else {
    features <- structural$features
    structural_ids <- vapply(features, function(feature) {
      normalize_cusec(feature$properties$CUSEC %||% NA_character_)
    }, character(1))
    structural_provinces <- substr(structural_ids, 1L, 2L)
    record_check("Lectura del GeoJSON", "PASS", sprintf("%s secciones", length(features)))
    record_check("CUSEC únicos", if (!anyDuplicated(structural_ids)) "PASS" else "FAIL", sprintf("%s identificadores únicos", uniqueN(structural_ids)))
    valid_codes <- c("08", "17", "25", "43")
    record_check("Provincias catalanas", if (all(structural_provinces %in% valid_codes)) "PASS" else "FAIL", paste(sort(unique(structural_provinces)), collapse = ", "))
    record_check("Cobertura de Catalunya", if (length(features) == 5117L) "PASS" else "WARN", sprintf("esperadas 5117; encontradas %s", length(features)))
  }
}

message("\n2. Comprobando manifiestos y todos los días web...")

manifest <- tryCatch(read_json_file(manifest_path), error = identity)
if (inherits(manifest, "error")) {
  record_check("Lectura del manifiesto", "FAIL", conditionMessage(manifest))
  write_empty_report_and_exit("El manifiesto JSON no se puede leer.")
}
record_check("Versión del manifiesto", if (as.integer(manifest$version %||% 0L) >= 2L) "PASS" else "FAIL", paste("version =", manifest$version %||% "ausente"))

available_risks <- names(manifest$periods)
record_check("Periodos heat/cold", if (all(c("heat", "cold") %in% available_risks)) "PASS" else "FAIL", paste(available_risks, collapse = ", "))

day_catalog <- list()
for (risk in intersect(c("heat", "cold"), available_risks)) {
  index_path <- relative_file(manifest$periods[[risk]]$index)
  if (!file.exists(index_path)) {
    record_check(paste("Índice", risk), "FAIL", index_path)
    next
  }
  period_index <- read_json_file(index_path)
  days <- period_index$days
  actual_dates <- vapply(days, function(day) as.character(day$date), character(1))
  expected_dates <- unique(unlist(lapply(period_index$ranges, function(period_range) {
    as.character(seq(as.Date(period_range$start), as.Date(period_range$end), by = "day"))
  })))
  missing_dates <- setdiff(expected_dates, actual_dates)
  extra_dates <- setdiff(actual_dates, expected_dates)
  status <- if (!length(missing_dates) && !length(extra_dates) && !anyDuplicated(actual_dates)) "PASS" else "FAIL"
  record_check(
    paste("Calendario", risk), status,
    sprintf("%s días; faltan %s; sobran %s", length(actual_dates), length(missing_dates), length(extra_dates))
  )
  for (i in seq_along(days)) {
    day_catalog[[length(day_catalog) + 1L]] <- list(risk = risk, entry = days[[i]])
  }
}

if (!length(day_catalog)) {
  write_empty_report_and_exit("No hay días en los índices heat/cold.")
}

set.seed(20260827)
sample_per_day <- max(1000L, floor(max_metric_rows / length(day_catalog)))
metric_samples <- list()
daily_metrics <- list()
payload_summary_mismatches <- 0L
invalid_payloads <- 0L
missing_day_files <- 0L
time_basis_failures <- 0L
series_length_failures <- 0L
probability_range_failures <- 0L
binary_failures <- 0L
id_mismatches <- 0L

for (position in seq_along(day_catalog)) {
  risk <- day_catalog[[position]]$risk
  entry <- day_catalog[[position]]$entry
  day_path <- relative_file(entry$file)
  if (!file.exists(day_path)) {
    missing_day_files <- missing_day_files + 1L
    next
  }
  payload <- tryCatch(read_json_file(day_path), error = identity)
  if (inherits(payload, "error")) {
    invalid_payloads <- invalid_payloads + 1L
    next
  }
  ids <- normalize_cusec(list_character(payload$ids))
  times <- list_character(payload$times)
  width <- suppressWarnings(as.integer(payload$width))
  expected_length <- length(ids) * width
  required_series <- c(paste0("W_", risk), paste0("R_", risk), paste0("HighRisk_", risk), paste0("pred_", risk))
  lengths <- vapply(required_series, function(metric) {
    length(payload$series[[metric]])
  }, integer(1))
  if (any(lengths != expected_length)) series_length_failures <- series_length_failures + 1L
  if (!identical(payload$time_basis, "forecast_valid_time") || as.integer(payload$prediction_horizon_hours) != 24L) {
    time_basis_failures <- time_basis_failures + 1L
  }
  if (length(times) != width || !all(substr(times, 1L, 10L) == entry$date)) {
    invalid_payloads <- invalid_payloads + 1L
  }
  if (anyDuplicated(ids) || any(!grepl("^[0-9]{10}$", ids))) invalid_payloads <- invalid_payloads + 1L
  if (length(structural_ids) && any(!ids %in% structural_ids)) id_mismatches <- id_mismatches + 1L

  score <- tryCatch(list_numeric(payload$series[[paste0("pred_", risk)]], expected_length), error = identity)
  observed <- tryCatch(list_numeric(payload$series[[paste0("HighRisk_", risk)]], expected_length), error = identity)
  if (inherits(score, "error") || inherits(observed, "error")) {
    invalid_payloads <- invalid_payloads + 1L
    next
  }
  if (any(score < 0 | score > 1, na.rm = TRUE)) probability_range_failures <- probability_range_failures + 1L
  if (any(!observed %in% c(0, 1), na.rm = TRUE)) binary_failures <- binary_failures + 1L

  long <- tryCatch(payload_to_long(payload, risk, province), error = identity)
  if (inherits(long, "error") || !nrow(long)) {
    invalid_payloads <- invalid_payloads + 1L
    next
  }
  paired <- long[is.finite(score) & !is.na(observed)]
  exact <- metric_values(paired$score, paired$observed)
  daily_metrics[[length(daily_metrics) + 1L]] <- data.table(
    risk = risk,
    date = as.Date(entry$date),
    province = province,
    n = exact$n,
    positives = exact$positives,
    prevalence = exact$prevalence,
    mean_probability = exact$mean_probability,
    brier = exact$brier
  )

  province_summary <- payload$summary_by_province[[province]]
  if (!is.null(province_summary) && is.finite(exact$brier)) {
    reported_brier <- suppressWarnings(as.numeric(province_summary$brier_score %||% NA_real_))
    if (is.finite(reported_brier) && abs(reported_brier - exact$brier) > 0.00011) {
      payload_summary_mismatches <- payload_summary_mismatches + 1L
    }
  }

  if (nrow(paired) > sample_per_day) paired <- paired[sample.int(nrow(paired), sample_per_day)]
  paired[, `:=`(risk = risk, date = as.Date(entry$date), month = format(as.Date(entry$date), "%Y-%m"))]
  metric_samples[[length(metric_samples) + 1L]] <- paired[, .(risk, date, month, CUSEC, valid_time, score, observed)]

  if (position %% 20L == 0L || position == length(day_catalog)) {
    message(sprintf("  %s/%s días revisados", position, length(day_catalog)))
  }
}

record_check("Archivos diarios presentes", if (!missing_day_files) "PASS" else "FAIL", sprintf("%s ausentes", missing_day_files))
record_check("JSON diarios legibles", if (!invalid_payloads) "PASS" else "FAIL", sprintf("%s incidencias", invalid_payloads))
record_check("Alineación declarada t+24", if (!time_basis_failures) "PASS" else "FAIL", sprintf("%s archivos sin forecast_valid_time/+24", time_basis_failures))
record_check("Longitud de series", if (!series_length_failures) "PASS" else "FAIL", sprintf("%s archivos incoherentes", series_length_failures))
record_check("Probabilidades dentro de [0,1]", if (!probability_range_failures) "PASS" else "FAIL", sprintf("%s archivos con valores inválidos", probability_range_failures))
record_check("HighRisk binario", if (!binary_failures) "PASS" else "FAIL", sprintf("%s archivos con valores distintos de 0/1", binary_failures))
record_check("CUSEC diario presente en GeoJSON", if (!id_mismatches) "PASS" else "FAIL", sprintf("%s archivos con IDs no cartografiados", id_mismatches))
record_check("Resumen Brier del JSON", if (!payload_summary_mismatches) "PASS" else "FAIL", sprintf("%s diferencias", payload_summary_mismatches))

daily_metrics_dt <- rbindlist(daily_metrics, fill = TRUE)
metric_sample_dt <- rbindlist(metric_samples, fill = TRUE)
fwrite(daily_metrics_dt, file.path(output_dir, "metrics_by_day.csv"))

if (!nrow(metric_sample_dt)) {
  write_empty_report_and_exit("No se pudieron construir observaciones comparables.")
}

monthly_metrics <- metric_sample_dt[, metric_values(score, observed), by = .(risk, month)]
global_metrics <- metric_sample_dt[, metric_values(score, observed), by = risk]
classification_05 <- metric_sample_dt[, classification_values(score, observed, 0.5), by = risk]

metric_sample_dt[, probability_bin := cut(
  score,
  breaks = seq(0, 1, by = 0.1),
  include.lowest = TRUE,
  right = TRUE
)]
calibration <- metric_sample_dt[is.finite(score) & !is.na(observed), .(
  n = .N,
  mean_probability = mean(score),
  observed_rate = mean(observed)
), by = .(risk, probability_bin)]
calibration[, absolute_gap := abs(mean_probability - observed_rate)]
calibration[, ece_contribution := n / sum(n) * absolute_gap, by = risk]
calibration_summary <- calibration[, .(ece = sum(ece_contribution)), by = risk]

fwrite(monthly_metrics, file.path(output_dir, "metrics_by_month.csv"))
fwrite(global_metrics, file.path(output_dir, "metrics_global_sample.csv"))
fwrite(classification_05, file.path(output_dir, "classification_threshold_0_5.csv"))
fwrite(calibration, file.path(output_dir, "calibration_bins.csv"))
fwrite(calibration_summary, file.path(output_dir, "calibration_summary.csv"))

paper_reference <- data.table(
  risk = c(rep("heat", 3), rep("cold", 4)),
  month_number = c("06", "07", "08", "02", "03", "11", "12"),
  paper_prevalence = c(0.0374, 0.0176, 0.0130, NA, 0.0013, 0.0038, 0.0055),
  paper_roc_auc = c(0.96, 0.99, 0.97, NA, 0.52, 0.97, 0.90),
  paper_pr_auc = c(0.44, 0.53, 0.28, NA, 0.01, 0.08, 0.07)
)
monthly_metrics[, month_number := substr(month, 6L, 7L)]
paper_comparison <- merge(
  paper_reference, monthly_metrics,
  by = c("risk", "month_number"), all.x = TRUE
)
paper_comparison[, `:=`(
  delta_prevalence = prevalence - paper_prevalence,
  delta_roc_auc = roc_auc - paper_roc_auc,
  delta_pr_auc = pr_auc - paper_pr_auc,
  note = "Las métricas web se estiman sobre una muestra; el paper valida exclusivamente Barcelona."
)]
fwrite(paper_comparison, file.path(output_dir, "paper_comparison_barcelona.csv"))

large_paper_differences <- paper_comparison[
  is.finite(delta_roc_auc) & is.finite(delta_pr_auc) &
    (abs(delta_roc_auc) > 0.05 | abs(delta_pr_auc) > 0.08)
]
record_check(
  "Métricas mensuales frente al paper",
  if (!nrow(large_paper_differences)) "PASS" else "WARN",
  if (!nrow(large_paper_differences)) {
    "sin diferencias grandes en la muestra de Barcelona"
  } else {
    paste("revisar", paste(paste(large_paper_differences$risk, large_paper_differences$month_number, sep = "-"), collapse = ", "))
  }
)

for (risk_name in global_metrics$risk) {
  row <- global_metrics[risk == risk_name]
  ratio <- row$mean_probability / row$prevalence
  record_check(
    paste("Calibración descriptiva", risk_name),
    if (is.finite(ratio) && ratio <= 3) "PASS" else "WARN",
    sprintf(
      "probabilidad media %.4f; prevalencia %.4f; razón %.1f. Una razón alta sugiere probabilidades no calibradas.",
      row$mean_probability, row$prevalence, ratio
    )
  )
}

message("\n3. Generando gráficos de diagnóstico...")

png(file.path(output_dir, "calibration_barcelona.png"), width = 1500, height = 900, res = 150)
plot(
  c(0, 1), c(0, 1), type = "n", xlab = "Probabilidad media predicha",
  ylab = "Frecuencia observada", main = sprintf("Calibración · provincia %s", province),
  xlim = c(0, 1), ylim = c(0, 1)
)
abline(0, 1, col = "grey50", lty = 2, lwd = 2)
colors <- c(heat = "#c8403a", cold = "#3474a7")
for (risk_name in unique(calibration$risk)) {
  subset_data <- calibration[risk == risk_name]
  points(
    subset_data$mean_probability, subset_data$observed_rate,
    type = "b", pch = 19, col = colors[[risk_name]], lwd = 2
  )
}
legend("topleft", legend = names(colors), col = colors, pch = 19, lwd = 2, bty = "n")
dev.off()

png(file.path(output_dir, "monthly_performance_barcelona.png"), width = 1700, height = 900, res = 150)
old_par <- par(mfrow = c(1, 2), mar = c(7, 4, 3, 1))
for (risk_name in c("heat", "cold")) {
  subset_data <- monthly_metrics[risk == risk_name][order(month)]
  if (!nrow(subset_data)) {
    plot.new()
    title(risk_name)
    next
  }
  x <- seq_len(nrow(subset_data))
  plot(
    x, subset_data$roc_auc, type = "b", pch = 19, col = "#173f35",
    ylim = c(0, 1), xaxt = "n", xlab = "", ylab = "Métrica",
    main = paste("Rendimiento", risk_name)
  )
  lines(x, subset_data$pr_auc, type = "b", pch = 17, col = "#e3693d")
  axis(1, at = x, labels = subset_data$month, las = 2, cex.axis = 0.8)
  legend("bottomleft", legend = c("ROC-AUC", "Average precision"), col = c("#173f35", "#e3693d"), pch = c(19, 17), lty = 1, bty = "n")
}
par(old_par)
dev.off()

message("\n4. Comprobando que el servidor publica los archivos...")

download_status <- function(url) {
  destination <- tempfile(fileext = ".download")
  on.exit(unlink(destination), add = TRUE)
  result <- tryCatch(
    suppressWarnings(utils::download.file(url, destination, quiet = TRUE, mode = "wb", method = "libcurl")),
    error = identity
  )
  if (inherits(result, "error")) return(conditionMessage(result))
  if (!identical(result, 0L) || !file.exists(destination) || file.info(destination)$size <= 0) return("respuesta vacía o error HTTP")
  "OK"
}

server_assets <- c(
  homepage = paste0(web_url, "/?audit=1"),
  css = paste0(web_url, "/css/style.css?audit=1"),
  javascript = paste0(web_url, "/js/mapa.js?audit=1"),
  manifest = paste0(web_url, "/data/daily/manifest.json?audit=1")
)
for (asset_name in names(server_assets)) {
  status <- download_status(server_assets[[asset_name]])
  record_check(
    paste("Servidor", asset_name),
    if (identical(status, "OK")) "PASS" else "WARN",
    status
  )
}

if (browser_check) {
  message("\n5. Comprobación opcional en navegador...")
  if (!requireNamespace("chromote", quietly = TRUE)) {
    record_check("Prueba visual con Chrome", "SKIP", "Falta el paquete chromote: install.packages('chromote')")
  } else {
    browser_result <- tryCatch({
      browser <- chromote::ChromoteSession$new()
      on.exit(browser$close(), add = TRUE)
      browser$Page$navigate(paste0(web_url, "/?audit-browser=1"))
      browser$Page$loadEventFired()
      Sys.sleep(3)
      browser$Runtime$evaluate(
        expression = "(async()=>{document.querySelector('[data-screen=explorer]').click();await window.EnergyExplorer.setMode('comparison');await new Promise(r=>setTimeout(r,2500));return true;})()",
        awaitPromise = TRUE,
        returnByValue = TRUE
      )
      js <- browser$Runtime$evaluate(
        expression = "JSON.stringify((()=>{const a=document.getElementById('primaryMapFrame').getBoundingClientRect();const b=document.getElementById('comparePanel').getBoundingClientRect();const label=document.getElementById('timeLabel').value||document.getElementById('timeLabel').textContent;return{leftTitle:document.getElementById('primaryMapTitle').textContent,rightTitle:document.getElementById('compareMapTitle').textContent,sideBySide:Math.abs(a.top-b.top)<5&&a.width>200&&b.width>200,validIssue:/Validesa:.*emesa:/.test(label),comparisonClass:document.querySelector('.visual').classList.contains('compare-view')};})())",
        returnByValue = TRUE
      )
      jsonlite::fromJSON(js$result$value)
    }, error = identity)
    if (inherits(browser_result, "error")) {
      record_check("Prueba visual con Chrome", "WARN", conditionMessage(browser_result))
    } else {
      browser_ok <- isTRUE(browser_result$sideBySide) && isTRUE(browser_result$validIssue) && isTRUE(browser_result$comparisonClass)
      record_check(
        "Prueba visual con Chrome",
        if (browser_ok) "PASS" else "FAIL",
        sprintf("lado a lado=%s; validez/emisión=%s; clase comparación=%s", browser_result$sideBySide, browser_result$validIssue, browser_result$comparisonClass)
      )
    }
  }
}

if (raw_check) {
  message("\n6. Contrastando fechas y valores con los CSV originales (puede tardar)...")

  extract_prediction_day <- function(path, issue_day) {
    if (!file.exists(path)) stop(paste("No existe", path), call. = FALSE)
    header <- readLines(path, n = 1L, warn = FALSE, encoding = "UTF-8")
    header <- sub("^\\ufeff", "", header)
    fields <- strsplit(header, ";", fixed = TRUE)[[1]]
    fields <- gsub('^"|"$', "", fields)
    date_column <- match("fecha", fields)
    if (is.na(date_column)) stop("No se encontró fecha en el CSV", call. = FALSE)
    temporary <- tempfile(fileext = ".csv")
    on.exit(unlink(temporary), add = TRUE)
    awk_program <- sprintf(
      'NR==1 {print; next} {value=$%s; gsub(/"/,"",value); if(substr(value,1,10)=="%s") print}',
      date_column, issue_day
    )
    command <- sprintf(
      "awk -F';' %s %s > %s",
      shQuote(awk_program), shQuote(normalizePath(path)), shQuote(temporary)
    )
    status <- system(command)
    if (status != 0L) stop("awk no pudo filtrar el CSV", call. = FALSE)
    fread(
      temporary, sep = ";", dec = ",", encoding = "UTF-8",
      colClasses = list(character = c("CUSEC", "fecha")), showProgress = FALSE
    )
  }

  raw_spot_check <- function(risk, path, valid_day) {
    catalog_position <- which(vapply(day_catalog, function(item) {
      identical(item$risk, risk) && identical(as.character(item$entry$date), valid_day)
    }, logical(1)))[1]
    if (is.na(catalog_position)) {
      record_check(paste("CSV original", risk), "SKIP", paste("No está exportado", valid_day))
      return(invisible(NULL))
    }
    issue_day <- as.character(as.Date(valid_day) - 1L)
    raw <- tryCatch(extract_prediction_day(path, issue_day), error = identity)
    if (inherits(raw, "error")) {
      record_check(paste("CSV original", risk), "FAIL", conditionMessage(raw))
      return(invisible(NULL))
    }
    if (!nrow(raw)) {
      record_check(paste("CSV original", risk), "FAIL", paste("Sin filas para emisión", issue_day))
      return(invisible(NULL))
    }
    payload <- read_json_file(relative_file(day_catalog[[catalog_position]]$entry$file))
    web <- payload_to_long(payload, risk, province)
    raw[, CUSEC := normalize_cusec(CUSEC)]
    raw <- raw[substr(CUSEC, 1L, 2L) == province]
    raw[, issue_time := parse_time(as.character(fecha))]
    raw[, valid_time := issue_time + 24 * 60 * 60]
    raw[, score_raw := as.numeric(pred_proba)]
    target_name <- paste0("HighRisk_", risk, "_h24")
    keep <- c("CUSEC", "valid_time", "score_raw")
    if (target_name %in% names(raw)) {
      raw[, observed_raw := as.numeric(get(target_name))]
      keep <- c(keep, "observed_raw")
    }
    comparison <- merge(web, raw[, ..keep], by = c("CUSEC", "valid_time"))
    if (!nrow(comparison)) {
      record_check(paste("Alineación original-web", risk), "FAIL", "No hay claves CUSEC+hora coincidentes")
      return(invisible(NULL))
    }
    max_difference <- max(abs(comparison$score - comparison$score_raw), na.rm = TRUE)
    target_mismatches <- if ("observed_raw" %in% names(comparison)) {
      sum(comparison$observed != comparison$observed_raw, na.rm = TRUE)
    } else {
      NA_integer_
    }
    aligned <- is.finite(max_difference) && max_difference <= 0.00051 && (is.na(target_mismatches) || target_mismatches == 0L)
    record_check(
      paste("Alineación original-web", risk),
      if (aligned) "PASS" else "FAIL",
      sprintf("emisión %s → validez %s; n=%s; diferencia máxima=%.6f; targets distintos=%s", issue_day, valid_day, nrow(comparison), max_difference, target_mismatches)
    )
  }

  raw_spot_check("heat", pred_heat_path, "2025-07-01")
  raw_spot_check("cold", pred_cold_path, "2025-11-21")
}

checks_dt <- finish_checks()

status_counts <- checks_dt[, .N, by = status][order(match(status, c("FAIL", "WARN", "PASS", "SKIP")))]
summary_lines <- c(
  "# Auditoría de la web de vulnerabilidad energética",
  "",
  sprintf("- Proyecto: `%s`", project_dir),
  sprintf("- Provincia usada para las métricas: `%s` (08 = Barcelona, territorio validado en el paper)", province),
  sprintf("- Observaciones máximas de la muestra métrica: %s", format(max_metric_rows, big.mark = ".")),
  sprintf("- Fecha de ejecución: %s", format(Sys.time(), "%Y-%m-%d %H:%M:%S")),
  "",
  "## Resultado de las comprobaciones",
  "",
  paste0("- ", status_counts$status, ": ", status_counts$N),
  "",
  "## Métricas globales de la muestra web",
  "",
  "```",
  capture.output(print(global_metrics)),
  "```",
  "",
  "## Clasificación descriptiva con umbral 0,5",
  "",
  "El paper no define 0,5 como umbral operativo. Esta tabla es solo un diagnóstico; no debe presentarse como resultado validado.",
  "",
  "```",
  capture.output(print(classification_05)),
  "```",
  "",
  "## Interpretación",
  "",
  "- ROC-AUC y average precision evalúan discriminación/ranking.",
  "- Brier y la curva de calibración evalúan si las probabilidades tienen significado probabilístico.",
  "- Una probabilidad media muy superior a la prevalencia es compatible con un modelo ponderado por clases, pero indica que no debe interpretarse literalmente sin calibración.",
  "- Las métricas del paper corresponden a Barcelona. Girona, Lleida y Tarragona requieren validación independiente.",
  "- Para la comprobación más estricta, repetir con `--raw-check` y `--browser-check`.",
  ""
)
writeLines(summary_lines, file.path(output_dir, "audit_summary.md"), useBytes = TRUE)

message("\nAuditoría terminada. Resultados en: ", normalizePath(output_dir))
if (any(checks_dt$status == "FAIL")) {
  message("Resultado general: FALLO. Revisa web_test_results.csv y audit_summary.md")
  quit(status = 1L)
}
if (any(checks_dt$status == "WARN")) {
  message("Resultado general: OK CON AVISOS. Revisa calibración y métricas.")
  quit(status = 0L)
}
message("Resultado general: OK")
