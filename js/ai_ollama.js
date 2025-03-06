import { graphState, performAction, updateGraph } from './graph.js';

/**
 * Fonction utilitaire pour lire les flux de réponses d'Ollama
 * @param {ReadableStreamDefaultReader} reader - Le lecteur de flux
 * @param {Function} processChunk - Fonction de traitement des fragments reçus
 * @returns {Promise<string>} - La réponse complète
 */
async function readOllamaStream(reader, processChunk) {
  const decoder = new TextDecoder();
  let responseText = '';
  
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value, { stream: true });
      responseText += chunk;
      
      if (processChunk) {
        processChunk(chunk, responseText);
      }
    }
    return responseText;
  } catch (error) {
    if (error.name !== 'AbortError') {
      console.error("Erreur de lecture du flux:", error);
    }
    throw error;
  }
}

/**
 * Envoie une requête à l'API Ollama
 * @param {Object} options - Options de la requête
 * @returns {Promise<Object>} - Résultat de la requête
 */
async function sendOllamaRequest(options) {
  const {
    prompt,
    model = 'mistral',
    abortController = new AbortController(),
    onChunk = null,
    onComplete = null,
    onError = null
  } = options;
  
  let responseText = '';
  
  try {
    const response = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      mode: "cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        model, 
        prompt, 
        format: "json", 
        stream: true 
      }),
      signal: abortController.signal
    });
    
    if (!response.ok) {
      throw new Error(`Erreur HTTP: ${response.status}`);
    }
    
    const reader = response.body.getReader();
    
    // Fonction de traitement de chaque fragment
    const processFragment = (chunk) => {
      chunk.split("\n").forEach(line => {
        if (line.trim()) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.response) {
              responseText += parsed.response;
              if (onChunk) onChunk(parsed.response, responseText);
            }
          } catch (err) {
            console.error("Erreur parsing:", err);
          }
        }
      });
    };
    
    await readOllamaStream(reader, processFragment);
    
    // Traiter la réponse finale
    if (onComplete) {
      try {
        const result = JSON.parse(responseText);
        onComplete(result, responseText);
      } catch (err) {
        console.error("Erreur parsing final:", err);
        if (onError) onError(new Error("Format JSON invalide dans la réponse"));
      }
    }
    
    return { success: true, text: responseText };
    
  } catch (error) {
    if (onError) {
      onError(error.name === 'AbortError' 
        ? new Error("Requête annulée par l'utilisateur") 
        : error);
    }
    return { success: false, error };
  }
}

// Initialisation des fonctionnalités d'IA
function initAIFeatures() {
  // Références aux éléments DOM fréquemment utilisés
  const elements = {
    model: document.getElementById("ollamaModel"),
    prompt: document.getElementById("ollamaPrompt"),
    result: document.getElementById("ollamaResult"),
    raw: document.getElementById("ollamaRaw"),
    sendBtn: document.getElementById("ollamaSend"),
    stopBtn: document.getElementById("ollamaStop"),
    importBtn: document.getElementById("importGraph"),
    proposalsBtn: document.getElementById("ollamaSendProposals"),
    rejectBtn: document.getElementById("ollamaRejectProposals"),
    proposalNodes: document.getElementById("proposalNodes"),
    proposalLinks: document.getElementById("proposalLinks")
  };
  
  // Variables pour gérer l'état global
  let currentAbortController = null;
  let currentFinalResponse = "";
  let currentProposalResponse = "";
  
  // --- SECTION 1: Génération par prompt ---
  if (elements.sendBtn) {
    elements.sendBtn.addEventListener("click", () => {
      currentAbortController = new AbortController();
      const model = elements.model?.value.trim() || "mistral";
      const userPrompt = elements.prompt?.value.trim();
      
      const promptTemplate = `
Pour la requête : "${userPrompt}", créer un graph network en JSON.
Le JSON doit contenir "nodes" et "links" avec les propriétés nécessaires.
Répondez uniquement avec un JSON valide sans texte additionnel.
Exemple :
{
  "nodes": [ { "id": "1", "name": "Node1", "description": "Description1", "x": 100, "y": 300, "size": 30 } ],
  "links": [ { "id": "1", "source": "1", "target": "2", "name": "Link1", "description": "Description1" } ]
}`;
      
      // Réinitialiser les zones d'affichage
      if (elements.result) elements.result.textContent = "";
      if (elements.raw) elements.raw.value = "";
      currentFinalResponse = "";
      
      sendOllamaRequest({
        prompt: promptTemplate,
        model,
        abortController: currentAbortController,
        onChunk: (chunk, fullText) => {
          if (elements.raw) elements.raw.value += chunk;
          if (elements.result) elements.result.textContent = fullText;
        },
        onComplete: (jsonResult) => {
          if (elements.result) {
            elements.result.textContent = JSON.stringify(jsonResult, null, 2);
          }
        },
        onError: (error) => {
          if (elements.result) {
            elements.result.textContent = `Erreur: ${error.message}`;
          }
        }
      });
    });
  }
  
  // Gestion du bouton d'arrêt
  if (elements.stopBtn) {
    elements.stopBtn.addEventListener("click", () => {
      if (currentAbortController) currentAbortController.abort();
    });
  }
  
  // Gestion de l'importation du graphe
  if (elements.importBtn) {
    elements.importBtn.addEventListener("click", () => {
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
          data: { 
            oldState: { nodes: [...graphState.nodes], links: [...graphState.links] },
            newState: preparedGraph,
            label: "Import graph from Ollama generation" 
          }
        });
        
        updateGraph();
        alert("Graph importé avec succès dans le graph actuel !");
        
      } catch (err) {
        alert("Erreur lors de l'importation du graph généré: " + err.message);
      }
    });
  }
  
  // --- SECTION 2: Propositions basées sur le graph actuel ---
  if (elements.proposalsBtn) {
    elements.proposalsBtn.addEventListener("click", () => {
      currentAbortController = new AbortController();
      const model = elements.model?.value.trim() || "mistral";
      
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
      
      // Réinitialiser les zones d'affichage
      if (elements.proposalNodes) elements.proposalNodes.innerHTML = "";
      if (elements.proposalLinks) elements.proposalLinks.innerHTML = "";
      currentProposalResponse = "";
      if (elements.raw) elements.raw.value = "Envoi de la requête à Ollama...";
      
      sendOllamaRequest({
        prompt: proposalPrompt,
        model,
        abortController: currentAbortController,
        onChunk: (chunk, fullText) => {
          if (elements.raw) elements.raw.value += chunk;
        },
        onComplete: (proposals) => {
          if (!proposals.nodes || !proposals.links) {
            throw new Error("Propositions JSON invalide.");
          }
          
          // Afficher les noeuds proposés
          if (elements.proposalNodes) {
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
              elements.proposalNodes.appendChild(li);
            });
          }
          
          // Afficher les liens proposés
          if (elements.proposalLinks) {
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
              elements.proposalLinks.appendChild(li);
            });
          }
        },
        onError: (error) => {
          if (elements.raw) {
            elements.raw.value += "\nErreur : " + 
              ((error.name === 'AbortError') ? "Génération de propositions stoppée." : error.message);
          }
        }
      });
    });
  }
  
  // Réinitialiser les propositions
  if (elements.rejectBtn) {
    elements.rejectBtn.addEventListener("click", () => {
      currentProposalResponse = "";
      if (elements.proposalNodes) elements.proposalNodes.innerHTML = "";
      if (elements.proposalLinks) elements.proposalLinks.innerHTML = "";
    });
  }
  
  // Afficher/Masquer le log
  const toggleRawBtn = document.getElementById("toggleRaw");
  if (toggleRawBtn) {
    toggleRawBtn.addEventListener("click", () => {
      const rawArea = document.getElementById("ollamaRaw");
      if (rawArea) {
        rawArea.style.display = (rawArea.style.display === "none") ? "block" : "none";
      }
    });
  }
}

// Démarrer l'initialisation après chargement du DOM
document.addEventListener("DOMContentLoaded", () => {
  setTimeout(initAIFeatures, 100);
});
