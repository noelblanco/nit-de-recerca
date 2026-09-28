// Contingut divulgatiu de cadascun dels quatre passos del recorregut.
// Cada botó «Explora» indica exactament quina vista del mapa ha d'obrir.
const TOPICS = {
  territory: {
    icon: "🏘️",
    title: "El territori",
    definition: `
      <h2>📖 Què és?</h2>
      <p class="lead">La vulnerabilitat estructural descriu les condicions persistents que poden fer més difícil afrontar la calor, el fred o l'encariment de l'energia.</p>
      <p>Es construeix amb <strong>nou indicadors territorials</strong> de renda, pensions, atur, edat, mida de la llar, calefacció, refrigeració, consum i despesa energètica.</p>
      <div class="content-note">El mapa treballa amb seccions censals. Mostra el nom del municipi com a referència, però no identifica llars ni persones concretes.</div>`,
    relation: `
      <h2>🔗 Com encaixa?</h2>
      <div class="relation-row"><span>01</span><p>Els nou indicadors descriuen les condicions estructurals de cada secció censal.</p></div>
      <div class="relation-arrow">↓</div>
      <div class="relation-row"><span>02</span><p>Després de normalitzar-los, es combinen amb el mateix pes en l'índex <b>V</b>.</p></div>
      <p class="muted">V canvia entre territoris, però es manté estable durant el període estudiat. És un índex relatiu, no un percentatge ni un diagnòstic individual.</p>`,
    actions: [["vulnerability", "🏘️ Explorar la vulnerabilitat estructural"]],
    remember: `
      <h2>💡 Recorda</h2>
      <ul class="remember-list">
        <li>Un sol indicador no explica tota la vulnerabilitat estructural.</li>
        <li>La fitxa del mapa mostra els nou components i les seves unitats.</li>
        <li>Els colors comparen seccions del territori; no són diagnòstics individuals.</li>
      </ul>`
  },
  conditions: {
    icon: "🌡️",
    title: "Clima i preu",
    definition: `
      <h2>📖 Què és?</h2>
      <p class="lead">El risc també depèn del que passa en cada moment.</p>
      <p>L'<strong>estrès tèrmic</strong> indica fins a quin punt la temperatura queda fora del patró climàtic local esperat per a aquell lloc, dia i hora. El <strong>preu elèctric</strong> és horari i és comú a tot el territori.</p>`,
    relation: `
      <h2>🔗 Com encaixa?</h2>
      <div class="relation-pair">
        <div><span>03</span><b>Estrès tèrmic</b><small>Calor o fred fora del patró local.</small></div>
        <strong>+</strong>
        <div><span>04</span><b>Preu elèctric</b><small>Canvia cada hora.</small></div>
      </div>
      <p class="muted">Aquests components temporals s'uneixen a la vulnerabilitat estructural del territori.</p>`,
    actions: [
      ["thermal", "🌡️ Explorar l'estrès tèrmic"],
      ["price", "⚡ Explorar el preu elèctric"]
    ],
    remember: `
      <h2>💡 Recorda</h2>
      <ul class="remember-list">
        <li>Calor i fred es calculen per separat.</li>
        <li>La mateixa temperatura no és igual d'excepcional a tot Catalunya.</li>
        <li>El gràfic de preu inclou la mitjana del període per facilitar la comparació dels extrems.</li>
      </ul>`
  },
  risk: {
    icon: "✦",
    title: "El risc",
    definition: `
      <h2>📖 Què és?</h2>
      <p class="lead">El risc energètic augmenta quan coincideixen vulnerabilitat estructural, estrès tèrmic i un preu elèctric elevat.</p>
      <div class="plain-formula"><span>Vulnerabilitat estructural</span><b>×</b><span>estrès tèrmic</span><b>×</b><span>preu</span><b>=</b><strong>risc R</strong></div>
      <p>No és una alerta oficial: és un indicador de recerca que ajuda a identificar llocs i moments que mereixen més atenció.</p>`,
    relation: `
      <h2>🔗 Com encaixa?</h2>
      <div class="relation-row"><span>05</span><p>La combinació produeix un valor continu de risc per secció censal, data i hora.</p></div>
      <p>La web mostra per separat <b>R_heat</b> per a la calor i <b>R_cold</b> per al fred. Els cinc colors són quintils del valor complet del risc.</p>`,
    actions: [["risk", "✦ Explorar el risc compost"]],
    remember: `
      <h2>💡 Recorda</h2>
      <ul class="remember-list">
        <li>Un valor alt mostra una combinació desfavorable de factors.</li>
        <li>Risc de calor i risc de fred són dos indicadors diferents.</li>
        <li>Gris significa sense dades, no risc zero.</li>
      </ul>`
  },
  forecast: {
    icon: "⏱️",
    title: "La predicció",
    definition: `
      <h2>📖 Què és?</h2>
      <p class="lead">El model estima la probabilitat que una secció presenti risc alt 24 hores després.</p>
      <p>És una probabilitat, no una certesa. Hi ha una predicció per calor i una altra per fred.</p>
      <div class="time-example"><div><b>30 juny, 22 h</b><span>Es calcula la predicció</span></div><strong>+24 h →</strong><div><b>1 juliol, 22 h</b><span>Moment pronosticat</span></div></div>`,
    relation: `
      <h2>🔗 Com encaixa?</h2>
      <div class="relation-row"><span>06</span><p>El model calcula la probabilitat de risc alt per al moment pronosticat.</p></div>
      <div class="relation-arrow">↓</div>
      <div class="relation-row"><span>07</span><p>La probabilitat es compara amb la distribució completa del risc compost observat en el mateix moment.</p></div>`,
    actions: [
      ["prediction", "⏱️ Explorar la predicció +24 h"],
      ["comparison", "⚖️ Comparar predicció i risc observat"]
    ],
    remember: `
      <h2>💡 Recorda</h2>
      <ul class="remember-list">
        <li>La data mostrada és el <b>moment pronosticat</b>.</li>
        <li>La predicció es va calcular 24 hores abans.</li>
        <li>En la comparació, els dos mapes corresponen a la mateixa data i hora.</li>
        <li>Cada mapa utilitza cinc quintils propis; els colors indiquen posicions relatives, no el mateix valor numèric.</li>
      </ul>`
  }
};

let activeTopic = "territory";

// Activa una pantalla i actualitza el menú superior.
function showScreen(id) {
  // La portada comuna no necessita el menú intern del projecte d'energia.
  // La classe també permet reduir l'espai reservat a la capçalera.
  document.body.classList.toggle("projects-view", id === "projects");
  const primaryNav = document.querySelector("header nav");
  if (primaryNav) primaryNav.hidden = id === "projects";
  document.querySelectorAll(".screen").forEach(screen => screen.classList.remove("active"));
  document.getElementById(id)?.classList.add("active");
  document.querySelectorAll("nav [data-screen]").forEach(button => {
    const isTopic = id === "topic" && button.dataset.screen === "menu";
    button.classList.toggle("active", button.dataset.screen === id || isTopic);
  });
  window.scrollTo({ top: 0, behavior: "smooth" });

  // Leaflet necessita recalcular la mida després que el mapa torni a ser visible.
  if (id === "explorer") {
    setTimeout(() => {
      // No es conserva el zoom o la província de la visita anterior:
      // tots els mapes comencen mostrant Catalunya sencera.
      window.energyMap?.invalidateSize();
      window.energyCompareMap?.invalidateSize();
      window.EnergyExplorer?.showCatalonia();
    }, 80);
  }
}

// Renderitza una de les quatre pestanyes de la fitxa explicativa.
function renderTopicSection(section) {
  const topic = TOPICS[activeTopic];
  const content = document.getElementById("topicContent");
  document.querySelectorAll("[data-topic-section]").forEach(button => {
    const selected = button.dataset.topicSection === section;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-selected", String(selected));
  });

  if (section === "explore") {
    content.innerHTML = `<h2>🗺 Explora les dades</h2><p class="lead">Observa l'evolució temporal i, quan correspongui, la distribució territorial de cada indicador.</p><div class="map-actions">${topic.actions.map(([mode, label]) => `<button data-mode="${mode}">${label}</button>`).join("")}</div>`;
  } else {
    content.innerHTML = topic[section];
  }
}

// Obre la fitxa del pas seleccionat des del diagrama principal.
function openTopic(id) {
  activeTopic = id;
  const topic = TOPICS[id];
  document.getElementById("topicTitle").textContent = `${topic.icon} ${topic.title}`;
  renderTopicSection("definition");
  showScreen("topic");
}

// Delegació d'esdeveniments: tots els botons dinàmics es gestionen aquí.
document.addEventListener("click", event => {
  const backFromMap = event.target.closest("[data-back-from-map]");
  if (backFromMap) {
    showScreen("topic");
    renderTopicSection("explore");
    return;
  }

  const screenButton = event.target.closest("[data-screen]");
  if (screenButton) {
    // L'accés directe del menú superior mostra totes les vistes disponibles.
    if (screenButton.dataset.screen === "explorer") {
      window.EnergyExplorer?.showAllModes();
    }
    showScreen(screenButton.dataset.screen);
    return;
  }

  const topicButton = event.target.closest("[data-topic]");
  if (topicButton) {
    openTopic(topicButton.dataset.topic);
    return;
  }

  const sectionButton = event.target.closest("[data-topic-section]");
  if (sectionButton) {
    renderTopicSection(sectionButton.dataset.topicSection);
    return;
  }

  const modeButton = event.target.closest("[data-mode]");
  if (modeButton) {
    showScreen("explorer");
    // Des d'«Explora» només queda visible la vista sol·licitada.
    window.EnergyExplorer?.openMode(modeButton.dataset.mode);
  }
});

// La primera visita sempre comença al portal dels dos projectes.
showScreen("projects");
