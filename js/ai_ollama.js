import { graphState, performAction, updateGraph } from './graph.js';

document.addEventListener("DOMContentLoaded", () => {
  const tab4 = document.getElementById("tab4");
  if (!tab4) {
    console.error("L'élément avec l'ID 'tab4' n'a pas été trouvé dans le DOM.");
    return;
  }
  
  // Rebuild the UI
  tab4.innerHTML = `
    <h3>Génération par prompt</h3>
    <div style="margin-bottom: 8px;">
      <label for="ollamaModel">Modèle d’IA (ollama only):</label>
      <input id="ollamaModel" type="text" placeholder="ex: mistral" style="width:100%;">
    </div>
    <textarea id="ollamaPrompt" placeholder="Saisissez votre requête ici" style="width:100%; height:100px;"></textarea>
    <br>
    <button id="ollamaSend">Envoyer la requête</button>
    <button id="ollamaStop" style="margin-left:10px;">Stop Generation</button>
    <!-- Export/import pour graph généré -->
    <button id="importGraph" style="margin-left:10px;">Importer Graph Ollama</button>
    <br><br>
    <h3>Propositions basées sur le graph actuel</h3>
    <button id="ollamaSendProposals">Envoyer le graph actuel pour propositions</button>
    <div id="proposalLists" style="margin-top:10px;">
      <div>
        <h4>Noeuds proposés</h4>
        <ul id="proposalNodes"></ul>
      </div>
      <div>
        <h4>Liens proposés</h4>
        <ul id="proposalLinks"></ul>
      </div>
    </div>
    <br>
    <button id="ollamaRejectProposals">Réinitialiser Propositions</button>
    <br>
    <button id="toggleRaw" style="margin-top:10px;">Afficher/Masquer log</button>
    <br>
    <textarea id="ollamaRaw" style="width:100%; height:150px; margin-top:5px; display:none;" readonly></textarea>
    <pre id="ollamaResult" style="background:#f8f8f8; padding:10px; max-height:200px; overflow:auto;"></pre>
  `;
  
  document.getElementById("toggleRaw").addEventListener("click", () => {
    const rawArea = document.getElementById("ollamaRaw");
    rawArea.style.display = (rawArea.style.display === "none") ? "block" : "none";
  });
  
  // Globals for responses
  let currentAbortController = null;
  let currentFinalResponse = "";    // For generation by prompt
  let currentProposalResponse = "";   // For proposals
  
  /* --- SECTION 1: Génération par prompt --- */
  document.getElementById("ollamaSend").addEventListener("click", () => {
    currentAbortController = new AbortController();
    const model = document.getElementById("ollamaModel").value.trim() || "mistral";
    const userPrompt = document.getElementById("ollamaPrompt").value.trim();
    const promptText = `
Pour la requête : "${userPrompt}", créer un graph network en JSON.
Le JSON doit contenir "nodes" et "links" avec les propriétés nécessaires.
Répondez uniquement avec un JSON valide sans texte additionnel.
Exemple :
{
  "nodes": [ { "id": "1", "name": "Node1", "description": "Description1", "x": 100, "y": 300, "size": 30 } ],
  "links": [ { "id": "1", "source": "1", "target": "2", "name": "Link1", "description": "Description1" } ]
}`;
    const payload = { model, prompt: promptText, format: "json", stream: true };
    document.getElementById("ollamaResult").textContent = "";
    document.getElementById("ollamaRaw").value = "";
    currentFinalResponse = "";
    fetch("http://localhost:11434/api/generate", {
      method: "POST",
      mode: "cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: currentAbortController.signal
    })
    .then(response => {
      if (!response.ok) throw new Error(`Erreur HTTP : ${response.status}`);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      function readStream() {
        return reader.read().then(({ done, value }) => {
          if (done) return currentFinalResponse;
          const chunk = decoder.decode(value, { stream: true });
          chunk.split("\n").forEach(line => {
            if (line.trim()) {
              try {
                const parsed = JSON.parse(line);
                if (parsed.response) {
                  currentFinalResponse += parsed.response;
                  document.getElementById("ollamaRaw").value += parsed.response;
                  document.getElementById("ollamaResult").textContent = currentFinalResponse;
                }
              } catch (err) {
                console.error("Parsing error:", err);
              }
            }
          });
          return readStream();
        });
      }
      return readStream();
    })
    .then(() => {
      try {
        const jsonObj = JSON.parse(currentFinalResponse);
        if (!jsonObj.nodes || !jsonObj.links) throw new Error("JSON invalide.");
        document.getElementById("ollamaResult").textContent = JSON.stringify(jsonObj, null, 2);
      } catch (err) {
        console.error("Final parsing error:", err);
      }
    })
    .catch(error => {
      document.getElementById("ollamaResult").textContent =
        (error.name === 'AbortError')
          ? "Génération stoppée par l'utilisateur."
          : `Erreur : ${error.message}`;
    });
  });
  
  // Stop generation
  document.getElementById("ollamaStop").addEventListener("click", () => {
    if (currentAbortController) currentAbortController.abort();
  });
  
  /* --- IMPORT DU GRAPH GÉNÉRÉ (Génération par prompt) --- */
  document.getElementById("importGraph").addEventListener("click", () => {
    // Importer le graph généré (currentFinalResponse) dans le graphe actuel
    if (!currentFinalResponse) {
      alert("Aucun graph généré disponible à importer.");
      return;
    }
    try {
      const generatedGraph = JSON.parse(currentFinalResponse);
      if (!generatedGraph.nodes || !generatedGraph.links) {
        throw new Error("Graph JSON invalide");
      }
      // Préparer les nodes et links pour l'import
      const preparedGraph = {
        nodes: generatedGraph.nodes,
        links: generatedGraph.links.map(link => ({
          ...link,
          source: generatedGraph.nodes.find(n => n.id === link.source),
          target: generatedGraph.nodes.find(n => n.id === link.target)
        }))
      };
      performAction({
        type: "import_graph",
        data: { oldState: { nodes: [...graphState.nodes], links: [...graphState.links] },
                newState: preparedGraph,
                label: "Import graph from Ollama generation" }
      });
      updateGraph();
      alert("Graph importé avec succès dans le graph actuel !");
    } catch (err) {
      alert("Erreur lors de l'importation du graph généré : " + err.message);
    }
  });
  
  /* --- SECTION 2: Propositions basées sur le graph actuel --- */
  document.getElementById("ollamaSendProposals").addEventListener("click", () => {
    currentAbortController = new AbortController();
    const model = document.getElementById("ollamaModel").value.trim() || "mistral";
    
    // Utiliser le graph actuel (graphState) pour constituer la requête
    const currentGraphJSON = JSON.stringify({
      nodes: graphState.nodes.map(node => {
        const { vx, vy, fx, fy, index, ...rest } = node;
        return rest;
      }),
      links: graphState.links.map(link => ({
        id: link.id,
        source: link.source.id,
        target: link.target.id,
        name: link.name || "",
        description: link.description || ""
      }))
    });
    
    const proposalPrompt = `
Voici le graph network actuel en JSON :
${currentGraphJSON}
Propose uniquement des ajouts au graph sous forme de nouveaux nodes et links au format JSON.
Assure-toi que les nouveaux nodes ont des ids uniques et que les liens référencent des ids valides.
Ne retourne aucun autre texte.
`;
    document.getElementById("proposalNodes").innerHTML = "";
    document.getElementById("proposalLinks").innerHTML = "";
    currentProposalResponse = "";
    document.getElementById("ollamaRaw").value = "Envoi de la requête à Ollama...";
    
    fetch("http://localhost:11434/api/generate", {
      method: "POST",
      mode: "cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt: proposalPrompt, format: "json", stream: true }),
      signal: currentAbortController.signal
    })
    .then(response => {
      if (!response.ok) throw new Error(`Erreur HTTP : ${response.status}`);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      function readStream() {
        return reader.read().then(({ done, value }) => {
          if (done) return currentProposalResponse;
          const chunk = decoder.decode(value, { stream: true });
          chunk.split("\n").forEach(line => {
            if (line.trim()) {
              try {
                const parsed = JSON.parse(line);
                if (parsed.response) {
                  currentProposalResponse += parsed.response;
                  document.getElementById("ollamaRaw").value += parsed.response;
                }
              } catch (err) {
                console.error("Erreur proposals parsing:", err);
              }
            }
          });
          return readStream();
        });
      }
      return readStream();
    })
    .then(() => {
      try {
        const proposals = JSON.parse(currentProposalResponse);
        if (!proposals.nodes || !proposals.links) throw new Error("Propositions JSON invalide.");
        // Afficher les noeuds proposés
        const nodesUl = document.getElementById("proposalNodes");
        proposals.nodes.forEach(nodeP => {
          const li = document.createElement("li");
          li.textContent = `${nodeP.name} (id: ${nodeP.id})`;
          const approve = document.createElement("button");
          approve.textContent = "Approuver";
          approve.style.marginLeft = "10px";
          approve.addEventListener("click", () => {
            performAction({ type: "create_node", data: { node: nodeP, label: `Ajout node ${nodeP.name}` } });
            li.style.textDecoration = "line-through";
            updateGraph();
          });
          const reject = document.createElement("button");
          reject.textContent = "Rejeter";
          reject.style.marginLeft = "5px";
          reject.addEventListener("click", () => { li.style.display = "none"; });
          li.appendChild(approve);
          li.appendChild(reject);
          nodesUl.appendChild(li);
        });
        // Afficher les liens proposés
        const linksUl = document.getElementById("proposalLinks");
        proposals.links.forEach(linkP => {
          const li = document.createElement("li");
          li.textContent = `${linkP.name} (de ${linkP.source} vers ${linkP.target})`;
          const approve = document.createElement("button");
          approve.textContent = "Approuver";
          approve.style.marginLeft = "10px";
          approve.addEventListener("click", () => {
            const src = proposals.nodes.find(n => n.id === linkP.source) ||
                        graphState.nodes.find(n => n.id === linkP.source);
            const tgt = proposals.nodes.find(n => n.id === linkP.target) ||
                        graphState.nodes.find(n => n.id === linkP.target);
            if (src && tgt) {
              performAction({ type: "create_link", data: { link: { ...linkP, source: src, target: tgt }, label: `Ajout link ${linkP.name}` } });
              li.style.textDecoration = "line-through";
              updateGraph();
            } else {
              alert("Impossible de trouver les noeuds source ou cible pour ce lien.");
            }
          });
          const reject = document.createElement("button");
          reject.textContent = "Rejeter";
          reject.style.marginLeft = "5px";
          reject.addEventListener("click", () => { li.style.display = "none"; });
          li.appendChild(approve);
          li.appendChild(reject);
          linksUl.appendChild(li);
        });
      } catch (err) {
        console.error("Erreur lors du traitement final des propositions:", err);
      }
    })
    .catch(error => {
      document.getElementById("ollamaRaw").value += "\nErreur : " + 
        ((error.name === 'AbortError') ? "Génération de propositions stoppée." : error.message);
    });
  });
  
  // Réinitialiser les propositions
  document.getElementById("ollamaRejectProposals").addEventListener("click", () => {
    currentProposalResponse = "";
    document.getElementById("proposalNodes").innerHTML = "";
    document.getElementById("proposalLinks").innerHTML = "";
  });
});
