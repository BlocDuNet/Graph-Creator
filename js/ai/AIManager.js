/**
 * Gestion centralisée des fonctionnalités IA
 */
import { OllamaProvider } from './OllamaProvider.js';
import { performAction } from '../state/undo_redo.js';
import { aiConfig } from '../config/index.js';
import * as templates from '../config/templates/graphGeneration.js';
import * as proposalTemplates from '../config/templates/proposals.js';

export class AIManager {
  constructor(graphState, renderer) {
    this.graphState = graphState;
    this.renderer = renderer;
    
    // Initialiser les fournisseurs d'IA
    this.ollamaProvider = new OllamaProvider();
    
    // État local
    this.currentAbortController = null;
    this.currentGraphData = null;
    this.currentProposalResponse = null;
    
    // Initialiser les gestionnaires d'événements
    this.initUIElements();
    this.initEventListeners();
  }
  
  /**
   * Initialise les éléments d'interface
   */
  initUIElements() {
    this.elements = {
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
    
    // Initialiser la liste des modèles
    this.ollamaProvider.fetchModels().then(models => {
      if (this.elements.model && models.length > 0) {
        this.updateModelDropdown(models);
      }
    });
  }
  
  /**
   * Met à jour le menu déroulant des modèles
   */
  updateModelDropdown(models) {
    const modelElement = this.elements.model;
    
    // Convertir en select si ce n'est pas déjà le cas
    if (modelElement.tagName !== 'SELECT') {
      const select = document.createElement('select');
      select.id = modelElement.id;
      select.className = modelElement.className + ' form-control';
      select.setAttribute('title', 'Sélectionnez un modèle Ollama');
      modelElement.parentNode.replaceChild(select, modelElement);
      this.elements.model = select;
    }
    
    // Vider les options actuelles
    while (this.elements.model.firstChild) {
      this.elements.model.removeChild(this.elements.model.firstChild);
    }
    
    // Ajouter l'option par défaut
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = '-- Sélectionnez un modèle --';
    this.elements.model.appendChild(defaultOption);
    
    // Ajouter les options pour chaque modèle
    models.forEach(model => {
      const option = document.createElement('option');
      option.value = model;
      option.textContent = model;
      this.elements.model.appendChild(option);
    });
    
    // Sélectionner le premier modèle
    if (models.length > 0) {
      this.elements.model.value = models[0];
    }
  }
  
  /**
   * Initialise les écouteurs d'événements
   */
  initEventListeners() {
    if (this.elements.sendBtn) {
      this.elements.sendBtn.addEventListener("click", () => this.handleGenerateGraph());
    }
    
    if (this.elements.stopBtn) {
      this.elements.stopBtn.addEventListener("click", () => this.handleStopRequest());
    }
    
    if (this.elements.importBtn) {
      this.elements.importBtn.addEventListener("click", () => this.handleImportGraph());
    }
    
    if (this.elements.proposalsBtn) {
      this.elements.proposalsBtn.addEventListener("click", () => this.handleGenerateProposals());
    }
    
    if (this.elements.rejectBtn) {
      this.elements.rejectBtn.addEventListener("click", () => this.handleClearProposals());
    }
  }
  
  /**
   * Met à jour l'état de chargement d'un bouton
   */
  updateLoadingState(element, isLoading, stateType) {
    if (!element) return;
    
    const states = aiConfig.ollama.ui.loadingStates[stateType];
    element.disabled = isLoading;
    element.textContent = isLoading ? states.loading : states.default;
  }
  
  /**
   * Gère la demande de génération de graphe
   */
  handleGenerateGraph() {
    this.currentAbortController = new AbortController();
    const model = this.elements.model?.value.trim() || aiConfig.ollama.api.defaultModel;
    const userPrompt = this.elements.prompt?.value.trim();
    
    if (!userPrompt) {
      alert("Veuillez saisir une requête");
      return;
    }
    
    // Construire le prompt en utilisant le template
    const promptTemplate = templates.getGraphGenerationPrompt(userPrompt);
    
    // Réinitialiser les zones d'affichage
    if (this.elements.result) this.elements.result.textContent = "Attendez la réponse...";
    if (this.elements.raw) this.elements.raw.value = "";
    this.currentGraphData = null;
    
    // Mettre à jour l'état du bouton
    this.updateLoadingState(this.elements.sendBtn, true, "generation");
    
    // Envoyer la requête à Ollama
    this.ollamaProvider.sendRequest({
      prompt: promptTemplate,
      model,
      abortController: this.currentAbortController,
      onChunk: (chunk, fullText) => {
        if (this.elements.raw) this.elements.raw.value = fullText;
        try {
          // Essayer de parser la réponse en cours
          const testParse = JSON.parse(fullText);
          if (this.elements.result) this.elements.result.textContent = JSON.stringify(testParse, null, 2);
        } catch (e) {
          // Ne pas afficher d'erreur, la réponse est incomplète
          if (this.elements.result) this.elements.result.textContent = "Assemblage du JSON en cours...";
        }
      },
      onComplete: (result) => {
        console.log("Complete response received:", result);
        
        // Validation des données
        const isValid = result && 
                        Array.isArray(result.nodes) && 
                        Array.isArray(result.links) && 
                        result.nodes.length > 0;
                        
        if (isValid) {
          this.currentGraphData = result;
          if (this.elements.result) {
            this.elements.result.textContent = JSON.stringify(result, null, 2);
            this.elements.importBtn.disabled = false;
          }
        } else {
          if (this.elements.result) {
            this.elements.result.textContent = "Réponse reçue mais format invalide: " + 
                                             JSON.stringify(result, null, 2);
          }
          this.elements.importBtn.disabled = true;
        }
        
        // Réactiver le bouton d'envoi
        this.updateLoadingState(this.elements.sendBtn, false, "generation");
      },
      onError: (error) => {
        console.error("Ollama request error:", error);
        if (this.elements.result) {
          this.elements.result.textContent = `Error: ${error.message}`;
        }
        this.elements.importBtn.disabled = true;
        this.updateLoadingState(this.elements.sendBtn, false, "generation");
      }
    });
  }
  
  /**
   * Gère l'arrêt de la requête en cours
   */
  handleStopRequest() {
    if (this.currentAbortController) {
      this.currentAbortController.abort();
      this.updateLoadingState(this.elements.sendBtn, false, "generation");
      this.updateLoadingState(this.elements.proposalsBtn, false, "proposals");
    }
  }
  
  /**
   * Gère l'importation du graphe généré
   */
  handleImportGraph() {
    if (!this.currentGraphData) {
      alert("Aucun graphe généré disponible à importer.");
      return;
    }
    
    try {
      // Normaliser les données
      const normalizedGraph = this.normalizeGraphData(this.currentGraphData);
      
      // Sauvegarder l'état précédent
      const oldState = {
        nodes: [...this.graphState.nodes],
        links: [...this.graphState.links]
      };
      
      // Effectuer l'action avec Undo/Redo
      performAction({
        type: "import_graph",
        data: { 
          oldState,
          newState: normalizedGraph,
          label: "Import graph from Ollama" 
        }
      });
      
      // Mettre à jour le graphe
      this.renderer.updateGraph();
      
      // Déclencher un événement pour notifier de l'importation et forcer le rafraîchissement des formulaires
      window.dispatchEvent(new CustomEvent('graph-imported', { 
        detail: { nodes: normalizedGraph.nodes, links: normalizedGraph.links } 
      }));
      
      // Message de confirmation
      const msg = `Graphe importé avec succès ! (${normalizedGraph.nodes.length} nœuds, ${normalizedGraph.links.length} liens)`;
      alert(msg);
      
    } catch (err) {
      console.error("Error during import:", err);
      alert(`Erreur d'importation: ${err.message}\nVérifiez la console pour plus de détails.`);
    }
  }
  
  /**
   * Normalise les données du graphe pour l'importation
   */
  normalizeGraphData(data) {
    console.log("Normalizing graph data from AI:", data);
    
    // Normaliser les nœuds en préservant tous les champs
    const nodes = data.nodes.map(node => {
      // Conserver tous les champs originaux avec le spread operator
      const normalizedNode = {
        ...node,  // Garde tous les champs personnalisés intacts!
        // Assurer uniquement que les champs obligatoires sont normalisés
        id: String(node.id || Math.random().toString(36).substr(2, 9)),
        x: node.x !== undefined ? Number(node.x) : Math.random() * 500,
        y: node.y !== undefined ? Number(node.y) : Math.random() * 500
      };
      
      // Ajouter les champs par défaut uniquement s'ils n'existent pas
      if (!node.name) normalizedNode.name = "Sans nom";
      if (!node.description) normalizedNode.description = "";
      if (!node.size && node.size !== 0) normalizedNode.size = 30;
      
      return normalizedNode;
    });
    
    console.log("Normalized nodes with preserved fields:", nodes);
    
    // Normaliser les liens en préservant tous les champs
    const links = [];
    data.links.forEach(link => {
      const sourceNode = nodes.find(n => String(n.id) === String(link.source));
      const targetNode = nodes.find(n => String(n.id) === String(link.target));
      
      if (!sourceNode || !targetNode) {
        console.warn(`Lien ignoré: source=${link.source}, target=${link.target} (nœuds non trouvés)`);
        return;
      }
      
      // Conserver tous les champs originaux avec le spread operator
      const normalizedLink = {
        ...link,  // Garde tous les champs personnalisés intacts!
        // Remplacer uniquement les références et assurer les champs obligatoires
        id: String(link.id || Math.random().toString(36).substr(2, 9)),
        source: sourceNode,
        target: targetNode
      };
      
      // Ajouter les champs par défaut uniquement s'ils n'existent pas
      if (!link.name) normalizedLink.name = `Lien ${sourceNode.name}-${targetNode.name}`;
      if (!link.description) normalizedLink.description = "";
      if (!link.width && link.width !== 0) normalizedLink.width = 2;
      
      links.push(normalizedLink);
    });
    
    console.log("Normalized links with preserved fields:", links);
    
    return { nodes, links };
  }
  
  /**
   * Gère la génération de propositions
   */
  handleGenerateProposals() {
    // Désactiver le bouton et indiquer la requête en cours
    this.updateLoadingState(this.elements.proposalsBtn, true, "proposals");
    
    this.currentAbortController = new AbortController();
    const model = this.elements.model?.value.trim() || aiConfig.ollama.api.defaultModel;
    
    // Générer le prompt pour les propositions
    const proposalPrompt = proposalTemplates.getProposalPrompt(this.graphState);
    
    // Réinitialiser les zones d'affichage
    if (this.elements.proposalNodes) this.elements.proposalNodes.innerHTML = "";
    if (this.elements.proposalLinks) this.elements.proposalLinks.innerHTML = "";
    this.currentProposalResponse = null;
    if (this.elements.raw) this.elements.raw.value = "Envoi de la requête à Ollama...";
    
    // Envoyer la requête
    this.ollamaProvider.sendRequest({
      prompt: proposalPrompt,
      model,
      abortController: this.currentAbortController,
      onChunk: (chunk, fullText) => {
        if (this.elements.raw) this.elements.raw.value = fullText;
      },
      onComplete: (proposals) => {
        try {
          // Valider la réponse
          this.validateProposal(proposals);
          
          // Afficher les nœuds proposés
          if (this.elements.proposalNodes) {
            proposals.nodes.forEach(nodeP => {
              const nodeElement = this.createProposalNodeElement(nodeP);
              this.elements.proposalNodes.appendChild(nodeElement);
            });
          }
          
          // Afficher les liens proposés
          if (this.elements.proposalLinks) {
            proposals.links.forEach(linkP => {
              const linkElement = this.createProposalLinkElement(linkP, proposals.nodes);
              this.elements.proposalLinks.appendChild(linkElement);
            });
          }
        } catch (error) {
          console.error("Error processing proposals:", error);
          if (this.elements.raw) {
            this.elements.raw.value += "\n\nErreur de traitement: " + error.message;
          }
          alert("Erreur de traitement des propositions: " + error.message);
        } finally {
          // Réactiver le bouton
          this.updateLoadingState(this.elements.proposalsBtn, false, "proposals");
        }
      },
      onError: (error) => {
        console.error("Proposal request error:", error);
        if (this.elements.raw) {
          this.elements.raw.value += "\nErreur: " + 
            ((error.name === 'AbortError') ? "Génération des propositions arrêtée." : error.message);
        }
        
        // Réactiver le bouton
        this.updateLoadingState(this.elements.proposalsBtn, false, "proposals");
      }
    });
  }
  
  /**
   * Valide la structure de la réponse de propositions
   */
  validateProposal(data) {
    if (!data || typeof data !== 'object') {
      throw new Error("Réponse invalide: pas un objet JSON");
    }
    
    if (!data.nodes || !Array.isArray(data.nodes)) {
      throw new Error("Propositions JSON invalides: 'nodes' manquant ou pas un tableau");
    }
    
    if (!data.links || !Array.isArray(data.links)) {
      throw new Error("Propositions JSON invalides: 'links' manquant ou pas un tableau");
    }
  }
  
  /**
   * Crée un élément de nœud proposé
   */
  createProposalNodeElement(nodeData) {
    const li = document.createElement("li");
    li.textContent = `${nodeData.name} (id: ${nodeData.id})`;
    
    const approve = document.createElement("button");
    approve.textContent = "Approuver";
    approve.style.marginLeft = "10px";
    approve.addEventListener("click", () => {
      performAction({ 
        type: "create_node", 
        data: { 
          node: nodeData, 
          label: `Ajout node ${nodeData.name}` 
        } 
      });
      li.style.textDecoration = "line-through";
      this.renderer.updateGraph();
    });
    
    const reject = document.createElement("button");
    reject.textContent = "Rejeter";
    reject.style.marginLeft = "5px";
    reject.addEventListener("click", () => { 
      li.style.display = "none"; 
    });
    
    li.appendChild(approve);
    li.appendChild(reject);
    return li;
  }
  
  /**
   * Crée un élément de lien proposé
   */
  createProposalLinkElement(linkData, proposalNodes) {
    const li = document.createElement("li");
    li.textContent = `${linkData.name} (de ${linkData.source} vers ${linkData.target})`;
    
    const approve = document.createElement("button");
    approve.textContent = "Approuver";
    approve.style.marginLeft = "10px";
    approve.addEventListener("click", () => {
      const src = proposalNodes.find(n => n.id === linkData.source) ||
                  this.graphState.nodes.find(n => n.id === linkData.source);
      const tgt = proposalNodes.find(n => n.id === linkData.target) ||
                  this.graphState.nodes.find(n => n.id === linkData.target);
                  
      if (src && tgt) {
        performAction({ 
          type: "create_link", 
          data: { 
            link: { ...linkData, source: src, target: tgt }, 
            label: `Ajout link ${linkData.name}` 
          } 
        });
        li.style.textDecoration = "line-through";
        this.renderer.updateGraph();
      } else {
        alert("Impossible de trouver les nœuds source ou cible pour ce lien.");
      }
    });
    
    const reject = document.createElement("button");
    reject.textContent = "Rejeter";
    reject.style.marginLeft = "5px";
    reject.addEventListener("click", () => { 
      li.style.display = "none"; 
    });
    
    li.appendChild(approve);
    li.appendChild(reject);
    return li;
  }
  
  /**
   * Gère la suppression des propositions
   */
  handleClearProposals() {
    this.currentProposalResponse = null;
    if (this.elements.proposalNodes) this.elements.proposalNodes.innerHTML = "";
    if (this.elements.proposalLinks) this.elements.proposalLinks.innerHTML = "";
  }
}
