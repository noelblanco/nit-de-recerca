// =====================================================
// ELEMENTS PRINCIPALS
// =====================================================

const portada = document.getElementById("portada");
const menu = document.getElementById("menu");
const ramadera = document.getElementById("ramadera");

const titolBiomassa = document.getElementById("titolBiomassa");
const contingut = document.getElementById("contingut");

let biomassaActual = "";


// =====================================================
// BOTÓ COMENÇA
// =====================================================

document.getElementById("comenca").addEventListener("click", function () {

    portada.style.display = "none";
    ramadera.style.display = "none";

    menu.style.display = "flex";

});



// =====================================================
// SELECCIONAR UNA BIOMASSA
// =====================================================

document.querySelectorAll(".icona[data-biomassa]").forEach(function (icona) {

    icona.addEventListener("click", function () {

        const tipus = this.dataset.biomassa;

        biomassaActual = tipus;

        console.log("Biomassa seleccionada:", tipus);


        // ---------------------------------------------
        // COMPROVAR QUE EXISTEIXEN LES DADES
        // ---------------------------------------------

        if (!biomasses || !biomasses[tipus]) {

            console.error(
                "No existeixen dades per a:",
                tipus
            );

            return;
        }


        const dades = biomasses[tipus];


        // ---------------------------------------------
        // TÍTOL
        // ---------------------------------------------

        titolBiomassa.innerHTML =
            dades.icona + " " + dades.nom;


        // ---------------------------------------------
        // CONTINGUT INICIAL
        // ---------------------------------------------

        contingut.innerHTML = `

            <h2>📖 Què és?</h2>

            <p>
                ${dades.quees}
            </p>

        `;


        // ---------------------------------------------
        // CANVI DE PANTALLA
        // ---------------------------------------------

        menu.style.display = "none";

        ramadera.style.display = "flex";

    });

});


// =====================================================
// TORNAR AL MENÚ DES DE BIOMASSA
// =====================================================

document.getElementById("tornarMenu").addEventListener("click", function () {

    ramadera.style.display = "none";

    menu.style.display = "flex";

});


// =====================================================
// BOTONS LATERALS
// =====================================================

document.querySelectorAll(".opcio").forEach(function (boto) {

    boto.addEventListener("click", function () {

        const seccio = this.dataset.seccio;

        const dades = biomasses[biomassaActual];


        if (!dades) {

            console.error(
                "No hi ha dades per:",
                biomassaActual
            );

            return;
        }


        // =================================================
        // QUÈ ÉS?
        // =================================================

        if (seccio === "quees") {

            contingut.innerHTML = `

                <h2>
                    📖 Què és?
                </h2>

                <p>
                    ${dades.quees}
                </p>

            `;

        }


        // =================================================
        // DISTRIBUCIÓ
        // =================================================

        else if (seccio === "distribucio") {

            contingut.innerHTML = `

                <h2>
                    🗺 Distribució territorial
                </h2>

                <p>
                    ${dades.distribucio}
                </p>

                <div id="visor">

                    <div id="mapa"></div>

                    <div id="infoComarca">

                        <h2>
                            📍 Selecciona una comarca
                        </h2>

                        <p>
                            Fes clic sobre una comarca
                            del mapa.
                        </p>

                    </div>

                </div>

            `;


            // ---------------------------------------------
            // IMPORTANT:
            // actualitzem el tipus de biomassa del mapa
            // ---------------------------------------------

            seleccionarBiomassa(biomassaActual);

            // Crear el mapa després d'haver creat #mapa
            crearMapa();

        }


        // =================================================
        // OPORTUNITATS I REPTES
        // =================================================

        else if (seccio === "oportunitats i reptes") {

            contingut.innerHTML = `

                <h2>
                    ⚠️ Oportunitats i reptes
                </h2>

                <p>
                    ${dades.reptes}
                </p>

            `;

        }


        // =================================================
        // ENERGIA
        // =================================================

        else if (seccio === "energia") {

            contingut.innerHTML = `

                <h2>
                    ⚡ Valor energètic
                </h2>

                <p>
                    ${dades.energia}
                </p>

            `;

        }

    });

});
