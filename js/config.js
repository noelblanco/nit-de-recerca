// Configuració comuna de l'explorador.
// Aquí es defineixen les vistes disponibles, els noms divulgatius,
// les unitats i les descripcions que apareixen a la fitxa lateral.
window.APP_CONFIG = {
  structuralGeoJSON: "data/energy_vulnerability_sections.geojson",
  dailyManifest: "data/daily/manifest.json",
  episodeManifest: "data/episodes/manifest.json",
  center: [41.65, 1.8],
  zoom: 8,

  // Només es mantenen les vistes que expliquen el recorregut científic.
  modes: {
    vulnerability: {
      label: "Vulnerabilitat estructural",
      temporal: false,
      metrics: { Vulnerabilidad: "Índex V de vulnerabilitat estructural" }
    },
    thermal: {
      label: "Estrès tèrmic",
      temporal: true,
      metrics: {
        W_heat: "Estrès tèrmic per calor (C_heat)",
        W_cold: "Estrès tèrmic per fred (C_cold)"
      }
    },
    price: {
      label: "Preu elèctric",
      temporal: true,
      priceOnly: true,
      metrics: { precio_electrico: "Preu horari de l'electricitat" }
    },
    risk: {
      label: "Risc energètic compost",
      temporal: true,
      // No s'ofereixen les antigues opcions binàries «risc alt».
      metrics: {
        R_heat: "Risc compost de calor (R_heat)",
        R_cold: "Risc compost de fred (R_cold)"
      }
    },
    prediction: {
      label: "Predicció +24 h",
      temporal: true,
      metrics: {
        pred_heat: "Probabilitat de risc alt per calor a +24 h",
        pred_cold: "Probabilitat de risc alt per fred a +24 h"
      }
    },
    comparison: {
      label: "Predicció vs risc observat",
      temporal: true,
      compare: true,
      metrics: {
        pred_heat: "Calor · predicció vs risc observat",
        pred_cold: "Fred · predicció vs risc observat"
      }
    }
  },

  // Metadades de cada variable. Les unitats s'afegeixen tant als valors
  // de la fitxa com als textos d'ajuda quan existeix una unitat interpretable.
  metricInfo: {
    R_M_UC: {
      label: "Renda mitjana per unitat de consum",
      unit: "€/any",
      description: "Renda anual mitjana ajustada per la composició de la llar."
    },
    I_PEN: {
      label: "Ingressos procedents de pensions",
      unit: "%",
      description: "Pes dels ingressos de pensions en els ingressos del territori."
    },
    I_DES: {
      label: "Ingressos procedents de prestacions d'atur",
      unit: "%",
      description: "Pes dels ingressos de prestacions d'atur en els ingressos del territori."
    },
    D_PCT_65P: {
      label: "Població de 65 anys o més",
      unit: "%",
      description: "Proporció de residents de 65 anys o més."
    },
    D_HH_SIZE: {
      label: "Mida mitjana de la llar",
      unit: "persones/llar",
      description: "Nombre mitjà de persones que formen una llar."
    },
    Q_CALEF_DE: {
      label: "Habitatges amb calefacció deficient",
      unit: "%",
      description: "Indicador de mancances de calefacció dels habitatges."
    },
    Q_REFRI_DE: {
      label: "Habitatges amb refrigeració deficient",
      unit: "%",
      description: "Indicador de mancances de refrigeració dels habitatges."
    },
    ConsumEnergiaFinal_ICAEN: {
      label: "Consum d'energia final residencial",
      unit: "kWh/m²·any",
      description: "Consum final d'energia residencial estimat per superfície i any."
    },
    CostAnualEnergiaHab_ICAEN: {
      label: "Cost anual d'energia per habitatge",
      unit: "€/habitatge·any",
      description: "Despesa energètica anual estimada per habitatge."
    },
    Vulnerabilidad: {
      label: "Índex V de vulnerabilitat estructural",
      unit: "índex relatiu",
      description: "Síntesi normalitzada dels nou indicadors territorials; es manté estable durant el període estudiat."
    },
    W_heat: {
      label: "Estrès tèrmic per calor (C_heat)",
      unit: "índex estandarditzat",
      description: "Excés de temperatura respecte del patró climàtic local esperat per a aquell dia i hora."
    },
    W_cold: {
      label: "Estrès tèrmic per fred (C_cold)",
      unit: "índex estandarditzat",
      description: "Dèficit de temperatura respecte del patró climàtic local esperat per a aquell dia i hora."
    },
    precio_electrico: {
      label: "Preu horari de l'electricitat",
      unit: "€/MWh",
      description: "Preu horari del mercat elèctric, comú a tot Catalunya."
    },
    R_heat: {
      label: "Risc compost de calor (R_heat)",
      unit: "índex compost",
      description: "Resultat de combinar preu, estrès per calor i vulnerabilitat estructural."
    },
    R_cold: {
      label: "Risc compost de fred (R_cold)",
      unit: "índex compost",
      description: "Resultat de combinar preu, estrès per fred i vulnerabilitat estructural."
    },
    pred_heat: {
      label: "Probabilitat de risc alt per calor a +24 h",
      unit: "%",
      description: "Probabilitat estimada 24 hores abans per al moment mostrat."
    },
    pred_cold: {
      label: "Probabilitat de risc alt per fred a +24 h",
      unit: "%",
      description: "Probabilitat estimada 24 hores abans per al moment mostrat."
    }
  },

  structuralComponents: [
    "R_M_UC",
    "I_PEN",
    "I_DES",
    "D_PCT_65P",
    "D_HH_SIZE",
    "Q_CALEF_DE",
    "Q_REFRI_DE",
    "ConsumEnergiaFinal_ICAEN",
    "CostAnualEnergiaHab_ICAEN"
  ],
  palettes: {
    green: ["#edf6e9", "#b7dcb2", "#67ad7a", "#237054", "#083d33"],
    heat: ["#fff3d7", "#f9c978", "#ee814a", "#c8403a", "#6e1e36"],
    cold: ["#edf5fb", "#b9dceb", "#68acd0", "#3474a7", "#203a72"]
  },
  probabilityFields: ["pred_heat", "pred_cold"],
  binaryFields: []
};
