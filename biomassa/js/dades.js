const biomasses = {

    forestal: {
        icona: "🌲",
        nom: "Biomassa forestal",
        tipus: "Biomassa seca",

        quees: `Aquesta biomassa prové de la gestió directa dels boscos, principalment en forma de llenya i de restes forestals procedents de les operacions silvícoles.<br><br>

        Per a aquest estudi, a causa de la disponibilitat de dades, només es comptabilitza la biomassa forestal procedent de la producció de llenya. La fusta de major qualitat no s’inclou, ja que generalment es destina a la construcció, a la indústria del tauler o a la producció d’embalatges, productes amb un major valor afegit i una vida útil més llarga, que permeten mantenir el carboni emmagatzemat durant períodes més prolongats.`,

        distribucio: `Predomina a les comarques gironines, especialment la Selva, la Garrotxa i l'Alt Empordà, així com a Osona, el Vallès Oriental i les comarques del Pirineu i del Prepirineu amb una elevada superfície forestal, com el Ripollès, el Berguedà, la Noguera i l'Alt Urgell.`,

        reptes: `La biomassa forestal contribueix a reduir el risc d'incendis mitjançant una gestió activa dels boscos i genera noves oportunitats econòmiques per al medi rural.<br><br>

        No obstant això, el seu aprofitament està condicionat pels elevats costos de tala i transport, la fragmentació de la propietat forestal i la baixa rendibilitat de la fusta de menor qualitat.<br><br>

        Per maximitzar els beneficis ambientals i econòmics d'aquesta biomassa, és important situar les plantes de valorització a prop de les zones de producció, reduint així els costos i les emissions associades al transport. Alhora, l'extracció de biomassa ha de mantenir-se dins dels límits del creixement natural del bosc i preservar una part de les restes forestals per garantir la biodiversitat i la sostenibilitat dels ecosistemes.`,

        energia: `La biomassa forestal es valoritza principalment mitjançant combustió. El seu potencial energètic depèn del tipus de combustible i, especialment, del contingut d'humitat.<br><br>

        El poder calorífic inferior (PCI) de la biomassa forestal varia aproximadament <b>entre 1,5 i 5 MWh/t</b> segons el tipus de combustible i la humitat. Com a referència, l'ICAEN considera un PCI d'aproximadament  <b>3,8 MWh/t</b> per a l'estella forestal.<br><br>

        <b><i>Aquest valor representa l'energia continguda en el combustible i no incorpora cap rendiment associat al procés de conversió energètica.</i></b>`
    },


    agricola: {
        icona: "🌾",
        nom: "Biomassa agrícola i de la indústria agroforestal",
        tipus: "Biomassa seca",

        quees: `Aquesta biomassa procedeix de les restes lignocel·lulòsiques generades per l'activitat agrícola, com les podes de fruiters, vinya i olivera, així com dels subproductes vegetals no perillosos de la indústria agroforestal.<br><br>

        En aquest visor, la biomassa agrícola i la procedent de la indústria agroforestal s'agrupen en una única categoria, ja que les dades estadístiques oficials disponibles no permeten quantificar-les de manera desagregada. Malgrat el seu origen diferent, presenten característiques similars i constitueixen una font de biomassa seca amb potencial per al seu aprofitament energètic.`,

        distribucio: `Predomina a les planes agrícoles de Ponent i de l'Ebre, especialment a les comarques del Segrià, les Garrigues, l'Urgell, el Pla d'Urgell, la Terra Alta i el Baix Ebre, on la producció agrícola i la indústria agroalimentària generen grans quantitats de residus lignocel·lulòsics.<br><br>

        També destaca l'Alt Penedès pel volum de subproductes vegetals procedents de la indústria agroforestal.`,

        reptes: `La valorització energètica d'aquests residus contribueix a afavorir l'economia circular i a generar ingressos addicionals per als sectors agrari i forestal, donant un ús a materials que, d'altra manera, podrien quedar sense aprofitament.<br><br>

        Tanmateix, el seu aprofitament presenta diversos reptes. La disponibilitat és estacional i els recursos es troben dispersos pel territori, fet que dificulta la seva recollida i incrementa els costos logístics. La baixa densitat aparent d'aquest tipus de biomassa també fa que el transport i l'emmagatzematge siguin menys eficients.<br><br>

        Finalment, no tota la biomassa disponible ha de ser retirada del camp. Només s'hauria d'aprofitar la fracció excedentària, mantenint una part de les restes vegetals al sòl per conservar la matèria orgànica, mantenir la fertilitat, retenir la humitat i reduir el risc d'erosió. Per tant, l'aprofitament energètic ha de garantir un equilibri entre l'ús de la biomassa i el manteniment de la qualitat del sòl.`,

        energia: `La biomassa agrícola i agroforestal és una biomassa seca i es pot valoritzar principalment mitjançant combustió.<br><br>

        El seu potencial energètic depèn considerablement del tipus de residu i, especialment, del contingut d'humitat. Les restes llenyoses procedents de podes poden presentar valors similars als de la biomassa forestal, per aquest motiu com a valor de referència pendrem <b>3,8 MWh/t</b> .<br><br>

        <b><i>Els valors representen l'energia continguda en el combustible i no incorporen cap rendiment associat al procés de conversió energètica.</i></b>`
    },


    ramadera: {
        icona: "🐖",
        nom: "Biomassa ramadera",
        tipus: "Biomassa humida",

        quees: `Està formada principalment pels purins, fems i altres dejeccions generades per les explotacions ramaderes, especialment de porcí, boví i avícola.<br><br>

        Tot i considerar-se tradicionalment un residu, constitueix un recurs renovable amb potencial per a la producció de biogàs i la recuperació de nutrients dins d'un model d'economia circular.`,

        distribucio: `Es concentra a les principals zones ramaderes de Catalunya, especialment al Segrià, la Noguera, Osona, l'Alt Empordà i el Pla d'Urgell, comarques que presenten una elevada producció de dejeccions ramaderes i, per tant, un potencial important per a la producció de biogàs.`,

        reptes: `La digestió anaeròbia permet valoritzar part de la matèria orgànica de les dejeccions i reduir les emissions de metà i altres gassos d'efecte hivernacle associades al seu emmagatzematge.<br><br>

        A més, el procés genera un digestat que pot ser reutilitzat com a fertilitzant, permetent recuperar nutrients i reduir la necessitat d'aportacions externes.<br><br>

        Tanmateix, l'elevat contingut d'humitat dels purins incrementa els costos de transport, fet que fa recomanable situar les plantes de biogàs a prop de les explotacions ramaderes. També és important evitar períodes d'emmagatzematge excessivament llargs, que poden afavorir emissions de metà i altres compostos.<br><br>
        <b> Potser el repte més important és l'acceptació social: </b> Les grans plantes de biogàs poden generar preocupació per l'augment del trànsit de camions, les olors, el soroll i els possibles impactes sobre la qualitat de vida rural. Per aquest motiu, la planificació territorial i l'adequació de la dimensió de les instal·lacions a la disponibilitat local de recursos són elements importants.`,

        energia: `La biomassa ramadera és una biomassa humida i es valoritza principalment mitjançant digestió anaeròbia per produir biogàs. El potencial energètic depèn considerablement del tipus de dejecció i de les seves característiques.<br><br>

        La producció potencial de metà se situa aproximadament entre <b>2 i 15 Nm³ CH₄/t</b> per als purins de porc, entre <b>17 i 33 Nm³ CH₄/t</b> per als purins o fems bovins, entre <b>46 i 78 Nm³ CH₄/t</b> per a la gallinassa i entre <b>45 i 125 Nm³ CH₄/t</b> per a la fracció sòlida dels purins (Flotats, 2018).<br><br>

        Considerant un poder calorífic inferior del metà d'aproximadament <b>9,97 kWh/Nm³</b>, aquests valors equivalen aproximadament a <b>0,02–1,25 MWh/t</b> d'energia continguda en el metà potencialment produït.<br><br>

        <b><i>Aquest potencial representa l'energia continguda en el metà i no incorpora cap rendiment tecnològic associat a la producció d'electricitat, calor o biometà.</i></b>`
    },


    aquatica: {
        icona: "🌊",
        nom: "Biomassa aquàtica",
        tipus: "Biomassa humida",

        quees: `Aquesta biomassa inclou microalgues, macroalgues, plantes aquàtiques i altres organismes fotosintètics que creixen en medis aquàtics continentals o marítims.`,

        distribucio: `No es disposa de dades regionals suficients per quantificar-ne el potencial a Catalunya.<br><br>

        Potencialment, aquest recurs es pot trobar al litoral català, al Delta de l'Ebre, en embassaments, llacs i zones humides, així com en infraestructures artificials com canals de reg o basses.`,

        reptes: `Actualment manca informació regional fiable sobre la disponibilitat real d'aquest recurs i sobre la seva possible destinació energètica.<br><br>

        A Catalunya, alguns dels usos que s'estan desenvolupant per a determinades algues són alimentaris i biotecnològics, fet que pot generar usos alternatius de major valor afegit.<br><br>

        A més, una extracció massiva o inadequada de biomassa aquàtica pot alterar els ecosistemes marins i d'aigua dolça, afectant els hàbitats, la biodiversitat i la qualitat de l'aigua. Per tant, qualsevol aprofitament energètic hauria de garantir la sostenibilitat ecològica del recurs.`,

        energia: `A causa del seu elevat contingut d'aigua, la biomassa aquàtica no és adequada, en general, per a la combustió directa. Algunes formes de biomassa aquàtica poden ser valoritzades mitjançant processos biològics com la digestió anaeròbia.<br><br>

        <b><i>Actualment no es disposa d'un valor de referència prou robust i homogeni per estimar el potencial energètic de la biomassa aquàtica disponible a Catalunya. Per aquest motiu, aquesta categoria no s'inclou en l'estimació quantitativa del potencial energètic del visor.</i></b>`
    },


    industrial: {
        icona: "🏭",
        nom: "Biomassa de la indústria agroalimentària i d'aigües residuals",
        tipus: "Biomassa humida i seca",

        quees: `Comprèn subproductes orgànics no perillosos de la indústria agroalimentària, com ara residus d'escorxadors, greixos animals i restes del processament d'aliments, així com llots procedents de depuradores d'aigües residuals (EDAR).`,

        distribucio: `Es concentra prop de zones industrials, indústries agroalimentàries i grans depuradores urbanes o industrials, especialment al Vallès Occidental, Baix Llobregat, Barcelonès, Osona, Segrià i Bages.`,

        reptes: `La concentració d'aquest tipus de biomassa en escorxadors i estacions depuradores facilita la seva recollida i valorització i pot contribuir al foment de l'economia circular.<br><br>

        No obstant això, la composició és molt heterogènia i el potencial energètic varia considerablement segons el tipus de residu. També cal tenir en compte les possibles limitacions sanitàries i ambientals associades a determinats subproductes animals i llots de depuradora.`,

        energia: `Aquests residus presenten característiques molt diferents i, en molts casos, es poden valoritzar mitjançant digestió anaeròbia per produir biogàs.<br><br>

        El potencial energètic varia aproximadament entre <b>0,05 i 4,82 MWh/t</b> segons el tipus de residu. Els fangs d'EDAR presenten els valors més baixos, mentre que determinats residus d'escorxador, especialment els d'origen porcí, presenten un potencial considerablement superior.<br><br>

        Segons Flotats 2018, els fangs primaris d'EDAR presenten una producció potencial de <b>5–8 Nm³ CH₄/t</b>, els fangs secundaris de <b>5–6 Nm³ CH₄/t</b> i els residus d'escorxador porcí de <b>292–483 Nm³ CH₄/t</b>.<br><br>

        Considerant un poder calorífic inferior del metà d'aproximadament <b>9,97 kWh/Nm³</b>, aquests valors equivalen aproximadament a <b>0,05–0,08 MWh/t</b> per als fangs primaris, <b>0,05–0,06 MWh/t</b> per als fangs secundaris i <b>2,91–4,82 MWh/t</b> per als residus d'escorxador porcí.<br><br>

        <b><i>Aquests valors representen l'energia continguda en el metà potencialment produït i no incorporen cap rendiment tecnològic.</i></b>`
    },


    urbana: {
        icona: "🏙️",
        nom: "Biomassa urbana",
        tipus: "Biomassa humida i seca",

        quees: `Inclou principalment la fracció orgànica dels residus municipals (FORM) i les restes vegetals procedents de la poda i la jardineria urbana.`,

        distribucio: `La seva generació està vinculada a la densitat de població i al metabolisme urbà. Es concentra principalment a l'Àrea Metropolitana de Barcelona, el Vallès Occidental, el Vallès Oriental, el Baix Llobregat, el Barcelonès, el Maresme i el Tarragonès. Destaca especialment la comarca de l'Anoia.`,

        reptes: `La concentració d'aquest tipus de biomassa en els nuclis urbans facilita la seva recollida i valorització i contribueix al foment de l'economia circular.<br><br>

        No obstant això, la quantitat i la qualitat de la biomassa disponible depenen en gran mesura de la qualitat de la recollida selectiva i de la correcta separació dels residus.<br><br>

        En el cas de la poda urbana, també cal garantir que l'aprofitament energètic sigui compatible amb altres usos possibles del material.`,

        energia: `La biomassa urbana inclou materials amb característiques energètiques molt diferents.<br><br>

        Les restes de poda urbana són una biomassa seca i es poden valoritzar principalment mitjançant combustió. El seu poder calorífic depèn del tipus d'espècie i, especialment, del contingut d'humitat. Com a referència, els valors poden situar-se aproximadament dins del rang de <b>1,5–5 MWh/t</b> utilitzat per a biomasses llenyoses.<br><br>

        La fracció orgànica dels residus municipals (FORM) és una biomassa humida que es pot valoritzar mitjançant digestió anaeròbia per produir biogàs.<br><br>

Segons Flotats 2018, la FORM procedent de la recollida selectiva presenta un potencial de producció de <b>107–116 Nm³ de CH₄ per tona de FORM</b>. En el cas de la fracció orgànica separada mecànicament, el potencial és inferior, situant-se entre <b>54 i 124 Nm³ CH₄/t</b>.<br><br>

Considerant un poder calorífic inferior del metà d'aproximadament <b>9,97 kWh/Nm³</b>, el potencial energètic de la FORM de recollida selectiva se situa aproximadament entre <b>1,07 i 1,16 MWh/t</b>.<br><br>

<b><i>Aquest valor representa l'energia continguda en el metà potencialment produït i no incorpora cap rendiment tecnològic associat a la digestió anaeròbia ni a la posterior conversió energètica.</i></b>`
    }
};