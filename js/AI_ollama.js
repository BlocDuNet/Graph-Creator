import { graphState, performAction, updateGraph } from './graph.js';

/**
 * @module AI_ollama
 * Module for interacting with the Ollama API to generate and manage graph data
 */

// ===== Configuration =====
const CONFIG = {
  api: {
    url: "http://localhost:11434/api/generate",
    modelsUrl: "http://localhost:11434/api/tags",
    defaultModel: "mistral",
    requestOptions: {
      format: "json",
      stream: true
    }
  },
  ui: {
    loadingStates: {
      generation: {
        loading: "Génération en cours...",
        default: "Envoyer la requête"
      },
      proposals: {
        loading: "Génération en cours...",
        default: "Envoyer le graph actuel pour propositions"
      }
    },
    initDelay: 100 // ms to wait before initialization
  },
  templates: {
    // Template definitions moved to their own section
  }
};

// Add template definitions to the configuration
CONFIG.templates = {
  graphGeneration: (userPrompt) => `
Pour la requête : "${userPrompt}", créer un graph network en JSON.
Le JSON doit contenir "nodes" et "links" avec les propriétés nécessaires.
Répondez uniquement avec un JSON valide sans texte additionnel.
Chaque node doit avoir: id, name, description, size, x, y.
Chaque link doit avoir: id, source (id d'un node), target (id d'un autre node), name, description.

Exemple :
{
  "nodes": [ 
    { "id": "1", "name": "Node1", "description": "Description1", "x": 100, "y": 300, "size": 30 },
    { "id": "2", "name": "Node2", "description": "Description2", "x": 200, "y": 200, "size": 30 }
  ],
  "links": [ 
    { "id": "1", "source": "1", "target": "2", "name": "Link1", "description": "Description1", "width": 2 }
  ]
}`,
  proposals: (currentGraph) => {
    const currentGraphJSON = JSON.stringify({
      nodes: currentGraph.nodes.map(node => {
        const { vx, vy, fx, fy, index, ...rest } = node;
        return rest;
      }),
      links: currentGraph.links.map(link => ({
        id: link.id,
        source: link.source.id,
        target: link.target.id,
        name: link.name || "",
        description: link.description || ""
      }))
    });
    
    return `
Voici le graph network actuel en JSON :
${currentGraphJSON}
Propose uniquement des ajouts au graph sous forme de nouveaux nodes et links au format JSON.
Assure-toi que les nouveaux nodes ont des ids uniques et que les liens référencent des ids valides.
Ton format de réponse DOIT être un objet JSON valide avec les propriétés "nodes" et "links" qui sont des tableaux.
Ne retourne AUCUN texte explicatif avant ou après le JSON.`;
  }
};

/**
 * Class handling API interactions with Ollama
 */
class OllamaAPI {
  /**
   * Fetch available models from Ollama
   * @returns {Promise<Array>} List of available models
   */
  static async fetchModels() {
    try {
      console.log("Fetching Ollama models from:", CONFIG.api.modelsUrl);
      const response = await fetch(CONFIG.api.modelsUrl);
      
      if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status}`);
      }
      
      const data = await response.json();
      console.log("Models data received:", data);
      
      // Extract model names from the response
      // The structure should be { models: [{name: "..."}, ...] }
      if (data && Array.isArray(data.models)) {
        return data.models.map(model => model.name);
      } else {
        // Fall back to checking if there's an array of objects with name property
        const modelList = Array.isArray(data) ? data : [];
        return modelList.map(model => model.name || model.model || model);
      }
    } catch (error) {
      console.error("Error fetching Ollama models:", error);
      // Return a default model if there's an error
      return [CONFIG.api.defaultModel];
    }
  }

  /**
   * Read a stream from Ollama response
   * @param {ReadableStreamDefaultReader} reader - Stream reader
   * @param {Function} processChunk - Function to process each chunk
   * @returns {Promise<string>} Full response text
   */
  static async readStream(reader, processChunk) {
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
        console.error("Error reading stream:", error);
      }
      throw error;
    }
  }
  
  /**
   * Parse JSON response with fallback mechanisms
   * @param {string} text - Text to parse
   * @returns {Object} Parsed JSON
   * @throws {Error} If parsing fails after recovery attempts
   */
  static parseJsonResponse(text) {
    try {
      return JSON.parse(text);
    } catch (err) {
      // Try to extract JSON from text that might have non-JSON parts
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        console.log("JSON extract found:", jsonMatch[0]);
        return JSON.parse(jsonMatch[0]);
      }
      throw new Error("Could not find valid JSON in the response");
    }
  }
  
  /**
   * Send a request to Ollama API
   * @param {Object} options - Request options
   * @returns {Promise<Object>} API response
   */
  static async sendRequest(options) {
    const {
      prompt,
      model = CONFIG.api.defaultModel,
      abortController = new AbortController(),
      onChunk = null,
      onComplete = null,
      onError = null
    } = options;
    
    let responseText = '';
    
    try {
      const response = await fetch(CONFIG.api.url, {
        method: "POST",
        mode: "cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          model, 
          prompt,
          ...CONFIG.api.requestOptions
        }),
        signal: abortController.signal
      });
      
      if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status}`);
      }
      
      const reader = response.body.getReader();
      
      // Process each chunk from the stream
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
              console.error("Error parsing line:", err, line);
            }
          }
        });
      };
      
      await this.readStream(reader, processFragment);
      
      // Handle the complete response
      if (onComplete) {
        try {
          const result = this.parseJsonResponse(responseText);
          onComplete(result, responseText);
        } catch (err) {
          console.error("Final parsing error:", err);
          console.log("Raw response:", responseText);
          if (onError) onError(new Error("Invalid JSON format in response: " + err.message));
        }
      }
      
      return { success: true, text: responseText };
      
    } catch (error) {
      console.error("Request error:", error);
      if (onError) {
        onError(error.name === 'AbortError' 
          ? new Error("Request canceled by user") 
          : error);
      }
      return { success: false, error };
    }
  }
}

/**
 * Class for graph data processing and normalization
 */
class GraphProcessor {
  /**
   * Normalize nodes for import
   * @param {Array} nodes - Nodes to normalize
   * @returns {Array} Normalized nodes
   */
  static normalizeNodes(nodes) {
    return nodes.map(node => ({
      id: String(node.id || Math.random().toString(36).substr(2, 9)),
      name: node.name || "Unnamed",
      description: node.description || "",
      x: Number(node.x || Math.random() * 500),
      y: Number(node.y || Math.random() * 500),
      size: Number(node.size || 30)
    }));
  }
  
  /**
   * Normalize links for import
   * @param {Array} links - Links to normalize
   * @param {Array} normalizedNodes - Normalized nodes for references
   * @returns {Array} Normalized links
   */
  static normalizeLinks(links, normalizedNodes) {
    const normalizedLinks = [];
    
    links.forEach(link => {
      const sourceNode = normalizedNodes.find(n => String(n.id) === String(link.source));
      const targetNode = normalizedNodes.find(n => String(n.id) === String(link.target));
      
      if (!sourceNode || !targetNode) {
        console.warn(`Link ignored: source=${link.source}, target=${link.target} (nodes not found)`);
        return;
      }
      
      normalizedLinks.push({
        id: String(link.id || Math.random().toString(36).substr(2, 9)),
        source: sourceNode,
        target: targetNode,
        name: link.name || `Link ${sourceNode.name}-${targetNode.name}`,
        description: link.description || "",
        width: Number(link.width || 2)
      });
    });
    
    return normalizedLinks;
  }
  
  /**
   * Validate proposal response structure
   * @param {Object} data - Data to validate
   * @throws {Error} If data is invalid
   */
  static validateProposal(data) {
    if (!data || typeof data !== 'object') {
      throw new Error("Invalid response: not a JSON object");
    }
    
    if (!data.nodes || !Array.isArray(data.nodes)) {
      throw new Error("Invalid JSON proposals: 'nodes' missing or not an array");
    }
    
    if (!data.links || !Array.isArray(data.links)) {
      throw new Error("Invalid JSON proposals: 'links' missing ou pas un tableau");
    }
  }
}

/**
 * Class for UI creation and element management
 */
class UIManager {
  /**
   * Create and manage all UI elements
   */
  constructor() {
    // Map all DOM elements
    this.elements = this.mapDOMElements();
    
    // State variables
    this.state = {
      currentAbortController: null,
      currentGraphData: null,
      currentProposalResponse: "",
      availableModels: []
    };
    
    // Initialize model dropdown when constructed
    this.initModelDropdown();
  }
  
  /**
   * Map all required DOM elements
   * @returns {Object} Object containing all needed DOM elements
   */
  mapDOMElements() {
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
      proposalLinks: document.getElementById("proposalLinks"),
      toggleRawBtn: document.getElementById("toggleRaw")
    };
    
    // Detect missing elements
    Object.entries(elements).forEach(([key, el]) => {
      if (!el) console.warn(`DOM element not found: ${key}`);
    });
    
    return elements;
  }
  
  /**
   * Initialize the models dropdown menu
   */
  async initModelDropdown() {
    const modelElement = this.elements.model;
    if (!modelElement) return;
    
    try {
      // Store current value if any
      const currentValue = modelElement.value || CONFIG.api.defaultModel;
      
      // Convert to select element if it's not already one
      if (modelElement.tagName !== 'SELECT') {
        const select = document.createElement('select');
        select.id = modelElement.id;
        select.className = modelElement.className + ' form-control';
        select.setAttribute('title', 'Sélectionnez un modèle Ollama');
        modelElement.parentNode.replaceChild(select, modelElement);
        this.elements.model = select;
      }
      
      // Get available models
      const models = await OllamaAPI.fetchModels();
      this.state.availableModels = models;
      
      // Clear existing options
      while (this.elements.model.firstChild) {
        this.elements.model.removeChild(this.elements.model.firstChild);
      }
      
      // Add default option
      const defaultOption = document.createElement('option');
      defaultOption.value = '';
      defaultOption.textContent = '-- Sélectionnez un modèle --';
      this.elements.model.appendChild(defaultOption);
      
      // Add options for each model
      models.forEach(model => {
        const option = document.createElement('option');
        option.value = model;
        option.textContent = model;
        this.elements.model.appendChild(option);
      });
      
      // Set the previously selected value or default
      if (models.includes(currentValue)) {
        this.elements.model.value = currentValue;
      } else if (models.length > 0) {
        this.elements.model.value = models[0];
      }
      
      console.log(`Initialized model dropdown with ${models.length} models`);
    } catch (error) {
      console.error("Error initializing model dropdown:", error);
      
      // Make sure we have a default option even if fetching fails
      if (this.elements.model.tagName === 'SELECT' && this.elements.model.children.length === 0) {
        const option = document.createElement('option');
        option.value = CONFIG.api.defaultModel;
        option.textContent = CONFIG.api.defaultModel;
        this.elements.model.appendChild(option);
        this.elements.model.value = CONFIG.api.defaultModel;
      }
    }
  }

  /**
   * Initialize all event listeners
   */
  initEventListeners() {
    // Graph generation events
    if (this.elements.sendBtn) {
      this.elements.sendBtn.addEventListener("click", () => this.handleGenerateGraph());
    }
    
    if (this.elements.stopBtn) {
      this.elements.stopBtn.addEventListener("click", () => this.handleStopRequest());
    }
    
    if (this.elements.importBtn) {
      this.elements.importBtn.addEventListener("click", () => this.handleImportGraph());
    }
    
    // Proposals events
    if (this.elements.proposalsBtn) {
      this.elements.proposalsBtn.addEventListener("click", () => this.handleGenerateProposals());
    }
    
    if (this.elements.rejectBtn) {
      this.elements.rejectBtn.addEventListener("click", () => this.handleClearProposals());
    }
    
    // UI utility events
    if (this.elements.toggleRawBtn) {
      this.elements.toggleRawBtn.addEventListener("click", () => this.toggleRawLog());
    }
  }
  
  /**
   * Update the loading state of an element
   * @param {HTMLElement} element - Element to update
   * @param {boolean} isLoading - Whether loading is in progress
   * @param {string} loadingText - Text to display during loading
   * @param {string} defaultText - Text to display when not loading
   */
  updateLoadingState(element, isLoading, loadingText, defaultText) {
    if (!element) return;
    
    element.disabled = isLoading;
    element.textContent = isLoading ? loadingText : defaultText;
  }
  
  /**
   * Toggle raw log visibility
   */
  toggleRawLog() {
    const rawArea = this.elements.raw;
    if (rawArea) {
      rawArea.style.display = (rawArea.style.display === "none") ? "block" : "none";
    }
  }
  
  /**
   * Create a proposal node element
   * @param {Object} nodeData - Data for the node
   * @returns {HTMLElement} Created element
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
      updateGraph();
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
   * Create a proposal link element
   * @param {Object} linkData - Data for the link
   * @param {Array} proposalNodes - Available proposal nodes
   * @returns {HTMLElement} Created element
   */
  createProposalLinkElement(linkData, proposalNodes) {
    const li = document.createElement("li");
    li.textContent = `${linkData.name} (de ${linkData.source} vers ${linkData.target})`;
    
    const approve = document.createElement("button");
    approve.textContent = "Approuver";
    approve.style.marginLeft = "10px";
    approve.addEventListener("click", () => {
      const src = proposalNodes.find(n => n.id === linkData.source) ||
                  graphState.nodes.find(n => n.id === linkData.source);
      const tgt = proposalNodes.find(n => n.id === linkData.target) ||
                  graphState.nodes.find(n => n.id === linkData.target);
                  
      if (src && tgt) {
        performAction({ 
          type: "create_link", 
          data: { 
            link: { ...linkData, source: src, target: tgt }, 
            label: `Ajout link ${linkData.name}` 
          } 
        });
        li.style.textDecoration = "line-through";
        updateGraph();
      } else {
        alert("Impossible de trouver les noeuds source ou cible pour ce lien.");
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
   * Handle graph generation request
   */
  handleGenerateGraph() {
    this.state.currentAbortController = new AbortController();
    const model = this.elements.model?.value.trim() || CONFIG.api.defaultModel;
    const userPrompt = this.elements.prompt?.value.trim();
    
    const promptTemplate = CONFIG.templates.graphGeneration(userPrompt);
    
    // Reset display areas
    if (this.elements.result) this.elements.result.textContent = "Attendez la réponse...";
    if (this.elements.raw) this.elements.raw.value = "";
    this.state.currentGraphData = null;
    
    console.log("Sending request to Ollama:", model);
    this.updateLoadingState(
      this.elements.sendBtn, 
      true, 
      CONFIG.ui.loadingStates.generation.loading, 
      CONFIG.ui.loadingStates.generation.default
    );
    
    OllamaAPI.sendRequest({
      prompt: promptTemplate,
      model,
      abortController: this.state.currentAbortController,
      onChunk: (chunk, fullText) => {
        if (this.elements.raw) this.elements.raw.value = fullText;
        try {
          // Try to parse each update as JSON
          const testParse = JSON.parse(fullText);
          if (this.elements.result) this.elements.result.textContent = JSON.stringify(testParse, null, 2);
        } catch (e) {
          // Don't show error - response is still incomplete
          if (this.elements.result) this.elements.result.textContent = "Assemblage du JSON en cours...";
        }
      },
      onComplete: (result) => {
        console.log("Complete response received:", result);
        
        // Data validation
        const isValid = result && 
                        Array.isArray(result.nodes) && 
                        Array.isArray(result.links) && 
                        result.nodes.length > 0;
                        
        if (isValid) {
          this.state.currentGraphData = result;
          if (this.elements.result) {
            this.elements.result.textContent = JSON.stringify(result, null, 2);
            this.elements.importBtn.disabled = false;
          }
        } else {
          if (this.elements.result) {
            this.elements.result.textContent = "Response received but invalid format: " + 
                                             JSON.stringify(result, null, 2);
          }
          this.elements.importBtn.disabled = true;
        }
        
        // Reactivate send button
        this.updateLoadingState(
          this.elements.sendBtn, 
          false, 
          "", 
          CONFIG.ui.loadingStates.generation.default
        );
      },
      onError: (error) => {
        console.error("Ollama request error:", error);
        if (this.elements.result) {
          this.elements.result.textContent = `Error: ${error.message}`;
        }
        this.elements.importBtn.disabled = true;
        this.updateLoadingState(
          this.elements.sendBtn, 
          false, 
          "", 
          CONFIG.ui.loadingStates.generation.default
        );
      }
    });
  }
  
  /**
   * Handle stop request button
   */
  handleStopRequest() {
    if (this.state.currentAbortController) {
      this.state.currentAbortController.abort();
      this.updateLoadingState(
        this.elements.sendBtn, 
        false, 
        "", 
        CONFIG.ui.loadingStates.generation.default
      );
      this.updateLoadingState(
        this.elements.proposalsBtn, 
        false, 
        "", 
        CONFIG.ui.loadingStates.proposals.default
      );
    }
  }
  
  /**
   * Handle import graph button
   */
  handleImportGraph() {
    if (!this.state.currentGraphData) {
      alert("No generated graph available to import.");
      return;
    }
    
    try {
      console.log("Starting graph import:", this.state.currentGraphData);
      
      // Data normalization
      const nodes = GraphProcessor.normalizeNodes(this.state.currentGraphData.nodes);
      console.log("Normalized nodes:", nodes);
      
      // Process links using node references
      const links = GraphProcessor.normalizeLinks(this.state.currentGraphData.links, nodes);
      console.log("Normalized links:", links);
      
      // Prepare the new graph
      const preparedGraph = { nodes, links };
      
      // Save previous state
      const oldState = {
        nodes: [...graphState.nodes],
        links: [...graphState.links]
      };
      
      // Perform action with Undo/Redo
      performAction({
        type: "import_graph",
        data: { 
          oldState,
          newState: preparedGraph,
          label: "Import graph from Ollama" 
        }
      });
      
      // Update graph
      updateGraph();
      
      // Confirmation message
      const msg = `Graph successfully imported! (${nodes.length} nodes, ${links.length} links)`;
      alert(msg);
      console.log(msg);
      
    } catch (err) {
      console.error("Error during import:", err);
      alert(`Import error: ${err.message}\nCheck console for details.`);
    }
  }
  
  /**
   * Handle generate proposals button
   */
  handleGenerateProposals() {
    // Disable button and indicate request in progress
    this.updateLoadingState(
      this.elements.proposalsBtn, 
      true, 
      CONFIG.ui.loadingStates.proposals.loading, 
      CONFIG.ui.loadingStates.proposals.default
    );
    console.log("Proposals button clicked - preparing request");
    
    this.state.currentAbortController = new AbortController();
    const model = this.elements.model?.value.trim() || CONFIG.api.defaultModel;
    
    console.log(`Current graph: ${graphState.nodes.length} nodes, ${graphState.links.length} links`);
    const proposalPrompt = CONFIG.templates.proposals(graphState);
    
    // Reset display areas
    if (this.elements.proposalNodes) this.elements.proposalNodes.innerHTML = "";
    if (this.elements.proposalLinks) this.elements.proposalLinks.innerHTML = "";
    this.state.currentProposalResponse = "";
    if (this.elements.raw) this.elements.raw.value = "Sending request to Ollama...";
    
    console.log("Sending proposal request to Ollama:", model);
    
    OllamaAPI.sendRequest({
      prompt: proposalPrompt,
      model,
      abortController: this.state.currentAbortController,
      onChunk: (chunk, fullText) => {
        if (this.elements.raw) this.elements.raw.value = fullText;
        console.log("Data received:", chunk.length, "characters");
      },
      onComplete: (proposals) => {
        console.log("Proposal response received:", proposals);
        
        try {
          GraphProcessor.validateProposal(proposals);
          console.log(`Valid proposals received: ${proposals.nodes.length} nodes, ${proposals.links.length} links`);
          
          // Display proposed nodes
          if (this.elements.proposalNodes) {
            proposals.nodes.forEach(nodeP => {
              const nodeElement = this.createProposalNodeElement(nodeP);
              this.elements.proposalNodes.appendChild(nodeElement);
            });
          }
          
          // Display proposed links
          if (this.elements.proposalLinks) {
            proposals.links.forEach(linkP => {
              const linkElement = this.createProposalLinkElement(linkP, proposals.nodes);
              this.elements.proposalLinks.appendChild(linkElement);
            });
          }
        } catch (error) {
          console.error("Error processing proposals:", error);
          if (this.elements.raw) {
            this.elements.raw.value += "\n\nProcessing error: " + error.message;
          }
          alert("Error processing proposals: " + error.message);
        } finally {
          // Reactivate button regardless of outcome
          this.updateLoadingState(
            this.elements.proposalsBtn, 
            false, 
            "", 
            CONFIG.ui.loadingStates.proposals.default
          );
        }
      },
      onError: (error) => {
        console.error("Proposal request error:", error);
        if (this.elements.raw) {
          this.elements.raw.value += "\nError: " + 
            ((error.name === 'AbortError') ? "Proposal generation stopped." : error.message);
        }
        
        // Reactivate button on error
        this.updateLoadingState(
          this.elements.proposalsBtn, 
          false, 
          "", 
          CONFIG.ui.loadingStates.proposals.default
        );
      }
    });
  }
  
  /**
   * Handle clear proposals button
   */
  handleClearProposals() {
    this.state.currentProposalResponse = "";
    if (this.elements.proposalNodes) this.elements.proposalNodes.innerHTML = "";
    if (this.elements.proposalLinks) this.elements.proposalLinks.innerHTML = "";
  }
}

/**
 * Initialize AI features and UI
 */
function initAIFeatures() {
  console.log("Initializing AI features...");
  try {
    // Create UI manager and initialize event listeners
    const uiManager = new UIManager();
    uiManager.initEventListeners();
    console.log("AI features initialized successfully");
  } catch (error) {
    console.error("Failed to initialize AI features:", error);
  }
}

// Initialize after DOM is loaded with a small delay to ensure everything is ready
document.addEventListener("DOMContentLoaded", () => {
  console.log("DOM loaded, initializing AI features soon...");
  setTimeout(initAIFeatures, CONFIG.ui.initDelay);
});

// Export necessary functions for external use
export { OllamaAPI as sendOllamaRequest };
