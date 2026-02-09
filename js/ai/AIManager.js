/**
 * Centralized management of AI features.
 */
import { performAction } from '../state/undo_redo.js';
import { aiConfig } from '../config/index.js';
import eventBus from '../services/EventBus.js';
import * as templates from '../config/templates/graphGeneration.js';
import * as proposalTemplates from '../config/templates/proposals.js';
import {
  getModel,
  registerSettingsControls,
  sendAiRequest
} from './AIService.js';

export class AIManager {
  constructor(graphState, renderer) {
    this.graphState = graphState;
    this.renderer = renderer;
    
    // Local state.
    this.currentAbortController = null;
    this.currentGraphData = null;
    this.currentProposalResponse = null;
    
    // Initialize event handlers.
    this.initUIElements();
    this.initEventListeners();
  }
  
  /**
   * Initializes UI elements.
   */
  initUIElements() {
    this.elements = {
      provider: document.getElementById("aiProvider"),
      model: document.getElementById("aiModel"),
      configProvider: document.getElementById("config-ai-provider"),
      configModel: document.getElementById("config-ai-model"),
      prompt: document.getElementById("ollamaPrompt"),
      result: document.getElementById("ollamaResult"),
      raw: document.getElementById("ollamaRaw"),
      sendBtn: document.getElementById("ollamaSend"),
      stopBtn: document.getElementById("ollamaStop"),
      stopProposalsBtn: document.getElementById("ollamaStopProposals"),
      importBtn: document.getElementById("importGraph"),
      proposalsBtn: document.getElementById("ollamaSendProposals"),
      rejectBtn: document.getElementById("ollamaRejectProposals"),
      proposalNodes: document.getElementById("proposalNodes"),
      proposalLinks: document.getElementById("proposalLinks"),
      proposalsProvider: document.getElementById("proposals-ai-provider"),
      proposalsModel: document.getElementById("proposals-ai-model"),
      translateField: document.getElementById("translateField"),
      translateTarget: document.getElementById("translateTarget"),
      translateBtn: document.getElementById("translateBtn"),
      translateStopBtn: document.getElementById("translateStop"),
      translateProvider: document.getElementById("translate-ai-provider"),
      translateModel: document.getElementById("translate-ai-model")
      ,
      sheetRefresh: document.getElementById("sheet-refresh"),
      sheetSelectAll: document.getElementById("sheet-select-all"),
      sheetTranslate: document.getElementById("sheet-translate"),
      sheetTranslateStop: document.getElementById("sheet-translate-stop"),
      sheetApply: document.getElementById("sheet-apply"),
      sheetExportCsv: document.getElementById("sheet-export-csv"),
      sheetFind: document.getElementById("sheet-find"),
      sheetReplace: document.getElementById("sheet-replace"),
      sheetFindReplace: document.getElementById("sheet-find-replace"),
      sheetOpenConvert: document.getElementById("sheet-open-convert"),
      sheetFilter: document.getElementById("sheet-filter"),
      sheetFilterType: document.getElementById("sheet-filter-type"),
      sheetFilterField: document.getElementById("sheet-filter-field"),
      sheetFilterLang: document.getElementById("sheet-filter-lang"),
      sheetSort: document.getElementById("sheet-sort"),
      sheetColumnField: document.getElementById("sheet-column-field"),
      sheetColumnLang: document.getElementById("sheet-column-lang"),
      sheetSelectColumn: document.getElementById("sheet-select-column"),
      sheetBody: document.getElementById("multilingual-sheet-body"),
      sheetLangSource: document.getElementById("sheet-lang-source"),
      sheetLangTarget: document.getElementById("sheet-lang-target"),
      sheetFieldName: document.getElementById("sheet-field-name"),
      sheetFieldDesc: document.getElementById("sheet-field-description"),
      sheetProvider: document.getElementById("sheet-ai-provider"),
      sheetModel: document.getElementById("sheet-ai-model")
    };
    this.initAiSettingsUI();
  }

  initAiSettingsUI() {
    registerSettingsControls(this.elements.provider, this.elements.model);
    registerSettingsControls(this.elements.configProvider, this.elements.configModel);
    registerSettingsControls(this.elements.proposalsProvider, this.elements.proposalsModel);
    registerSettingsControls(this.elements.translateProvider, this.elements.translateModel);
    registerSettingsControls(this.elements.sheetProvider, this.elements.sheetModel);
  }
  
  /**
   * Updates the model dropdown.
   */
  updateModelDropdown(models) {
    const modelElement = this.elements.model;
    
    // Convert to a select if it isn't already.
    if (modelElement.tagName !== 'SELECT') {
      const select = document.createElement('select');
      select.id = modelElement.id;
      select.className = modelElement.className + ' form-control';
      select.setAttribute('title', 'Sélectionnez un modèle Ollama');
      modelElement.parentNode.replaceChild(select, modelElement);
      this.elements.model = select;
    }
    
    // Clear current options.
    while (this.elements.model.firstChild) {
      this.elements.model.removeChild(this.elements.model.firstChild);
    }
    
    // Add the default option.
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = '-- Sélectionnez un modèle --';
    this.elements.model.appendChild(defaultOption);
    
    // Add options for each model.
    models.forEach(model => {
      const option = document.createElement('option');
      option.value = model;
      option.textContent = model;
      this.elements.model.appendChild(option);
    });
    
    // Select the first model.
    if (models.length > 0) {
      this.elements.model.value = models[0];
    }
  }
  
  /**
   * Initializes event listeners.
   */
  initEventListeners() {
    if (this.elements.sendBtn) {
      this.elements.sendBtn.addEventListener("click", () => this.handleGenerateGraph());
    }

    if (this.elements.stopBtn) {
      this.elements.stopBtn.addEventListener("click", () => this.handleStopRequest());
    }
    if (this.elements.stopProposalsBtn) {
      this.elements.stopProposalsBtn.addEventListener("click", () => this.handleStopRequest());
    }
    if (this.elements.translateStopBtn) {
      this.elements.translateStopBtn.addEventListener("click", () => this.handleStopRequest());
    }
    if (this.elements.sheetTranslateStop) {
      this.elements.sheetTranslateStop.addEventListener("click", () => this.handleStopRequest());
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
    if (this.elements.translateBtn) {
      this.elements.translateBtn.addEventListener("click", () => this.handleTranslateSelected());
    }
    this.elements.sheetRefresh?.addEventListener("click", () => this.refreshTranslationSheet());
    this.elements.sheetSelectAll?.addEventListener("click", () => this.toggleAllSheetChecks(true));
    this.elements.sheetTranslate?.addEventListener("click", () => this.translateSheetSelection());
    this.elements.sheetApply?.addEventListener("click", () => this.applySheetEdits());
    this.elements.sheetFindReplace?.addEventListener("click", () => this.applySheetFindReplace());
    this.elements.sheetExportCsv?.addEventListener("click", () => this.exportSheetCsv());
    this.elements.sheetOpenConvert?.addEventListener("click", () => {
      if (window.openMultilingualConvertOverlay) {
        window.openMultilingualConvertOverlay();
      } else {
        document.getElementById('multilingual-convert-overlay')?.classList.remove('hidden');
      }
    });
    // auto refresh when switching to Tableur tab
    document.querySelector('a[href="#tab5"]')?.addEventListener('shown.bs.tab', () => {
      this.refreshTranslationSheet();
    });
    this.elements.sheetFilter?.addEventListener("input", () => this.refreshTranslationSheet());
    this.elements.sheetFilterType?.addEventListener("change", () => this.refreshTranslationSheet());
    this.elements.sheetFilterField?.addEventListener("change", () => this.refreshTranslationSheet());
    this.elements.sheetFilterLang?.addEventListener("input", () => this.refreshTranslationSheet());
    this.elements.sheetSort?.addEventListener("change", () => this.refreshTranslationSheet());
    this.elements.sheetSelectColumn?.addEventListener("click", () => this.selectColumn());
    // inline edit -> sync to graph on blur/change
    document.getElementById('multilingual-sheet-body')?.addEventListener('change', (e) => {
      const input = e.target;
      if (input && input.classList && input.classList.contains('sheet-input')) {
        this.updateFromSheetInput(input);
      }
    });

    eventBus.on('multilingual-sheet-refresh', () => this.refreshTranslationSheet());
    eventBus.on('graph-updated', () => this.refreshTranslationSheet());
    eventBus.on('graph-imported', () => this.refreshTranslationSheet());
    eventBus.on('action-performed', () => this.refreshTranslationSheet());
  }
  
  /**
   * Updates the loading state of a button.
   */
  updateLoadingState(element, isLoading, stateType) {
    if (!element) return;
    
    const states = aiConfig.ollama.ui.loadingStates[stateType];
    element.disabled = isLoading;
    element.textContent = isLoading ? states.loading : states.default;
  }
  
  /**
   * Handles graph generation requests.
   */
  handleGenerateGraph() {
    this.currentAbortController = new AbortController();
    const model = this.elements.model?.value.trim() || getModel();
    const userPrompt = this.elements.prompt?.value.trim();
    
    if (!userPrompt) {
      alert("Veuillez saisir une requête");
      return;
    }
    
    // Build the prompt using the template.
    const promptTemplate = templates.getGraphGenerationPrompt(userPrompt);
    
    // Reset output areas.
    if (this.elements.result) this.elements.result.textContent = "Attendez la réponse...";
    if (this.elements.raw) this.elements.raw.value = "";
    this.currentGraphData = null;
    
    // Update button state.
    this.updateLoadingState(this.elements.sendBtn, true, "generation");
    
    // Send the request to Ollama.
    sendAiRequest({
      prompt: promptTemplate,
      model,
      context: 'Graph generation',
      abortController: this.currentAbortController,
      onChunk: (chunk, fullText) => {
        if (this.elements.raw) this.elements.raw.value = fullText;
        try {
          // Try to parse the in-progress response.
          const testParse = JSON.parse(fullText);
          if (this.elements.result) this.elements.result.textContent = JSON.stringify(testParse, null, 2);
        } catch (e) {
          // Do not show errors; the response is incomplete.
          if (this.elements.result) this.elements.result.textContent = "Assemblage du JSON en cours...";
        }
      },
      onComplete: (result) => {
        console.log("Complete response received:", result);
        
        // Data validation.
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
        
        // Re-enable the send button.
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
   * Handles stopping the in-flight request.
   */
  handleStopRequest() {
    if (this.currentAbortController) {
      this.currentAbortController.abort();
      this.updateLoadingState(this.elements.sendBtn, false, "generation");
      this.updateLoadingState(this.elements.proposalsBtn, false, "proposals");
    }
  }
  
  /**
   * Handles importing the generated graph.
   */
  handleImportGraph() {
    if (!this.currentGraphData) {
      alert("Aucun graphe généré disponible à importer.");
      return;
    }
    
    try {
      // Normalize data.
      const normalizedGraph = this.normalizeGraphData(this.currentGraphData);
      
      // Save previous state.
      const oldState = {
        nodes: [...this.graphState.nodes],
        links: [...this.graphState.links]
      };
      
      // Perform the action with Undo/Redo.
      performAction({
        type: "import_graph",
        data: { 
          oldState,
          newState: normalizedGraph,
          label: "Import graph from Ollama" 
        }
      });
      
      // Update the graph.
      this.renderer.updateGraph();
      
      // Emit an event to notify import and force form refresh.
      eventBus.emit('graph-imported', { nodes: normalizedGraph.nodes, links: normalizedGraph.links });
      
      // Confirmation message.
      const msg = `Graphe importé avec succès ! (${normalizedGraph.nodes.length} nœuds, ${normalizedGraph.links.length} liens)`;
      alert(msg);
      
    } catch (err) {
      console.error("Error during import:", err);
      alert(`Erreur d'importation: ${err.message}\nVérifiez la console pour plus de détails.`);
    }
  }
  
  /**
   * Normalizes graph data for import.
   */
  normalizeGraphData(data) {
    console.log("Normalizing graph data from AI:", data);
    
    // Normalize nodes while preserving all fields.
    const nodes = data.nodes.map(node => {
      // Preserve all original fields via spread operator.
      const normalizedNode = {
        ...node,  // Preserve all custom fields intact!
        // Ensure only required fields are normalized.
        id: String(node.id || Math.random().toString(36).substr(2, 9)),
        x: node.x !== undefined ? Number(node.x) : Math.random() * 500,
        y: node.y !== undefined ? Number(node.y) : Math.random() * 500
      };
      
      // Add default fields only if they are missing.
      if (!node.name) normalizedNode.name = "Sans nom";
      if (!node.description) normalizedNode.description = "";
      if (!node.size && node.size !== 0) normalizedNode.size = 30;
      
      return normalizedNode;
    });
    
    console.log("Normalized nodes with preserved fields:", nodes);
    
    // Normalize links while preserving all fields.
    const links = [];
    data.links.forEach(link => {
      const sourceNode = nodes.find(n => String(n.id) === String(link.source));
      const targetNode = nodes.find(n => String(n.id) === String(link.target));
      
      if (!sourceNode || !targetNode) {
        console.warn(`Lien ignoré: source=${link.source}, target=${link.target} (nœuds non trouvés)`);
        return;
      }
      
      // Preserve all original fields via spread operator.
      const normalizedLink = {
        ...link,  // Preserve all custom fields intact!
        // Replace references only and ensure required fields.
        id: String(link.id || Math.random().toString(36).substr(2, 9)),
        source: sourceNode,
        target: targetNode
      };
      
      // Add default fields only if they are missing.
      if (!link.name) normalizedLink.name = `Lien ${sourceNode.name}-${targetNode.name}`;
      if (!link.description) normalizedLink.description = "";
      if (!link.width && link.width !== 0) normalizedLink.width = 2;
      
      links.push(normalizedLink);
    });
    
    console.log("Normalized links with preserved fields:", links);
    
    return { nodes, links };
  }
  
  /**
   * Handles proposal generation.
   */
  handleGenerateProposals() {
    // Disable the button and indicate the in-flight request.
    this.updateLoadingState(this.elements.proposalsBtn, true, "proposals");
    
    this.currentAbortController = new AbortController();
    const model = this.elements.proposalsModel?.value?.trim()
      || this.elements.model?.value?.trim()
      || getModel();
    
    // Generate the prompt for proposals.
    const proposalPrompt = proposalTemplates.getProposalPrompt(this.graphState);
    
    // Reset output areas.
    if (this.elements.proposalNodes) this.elements.proposalNodes.innerHTML = "";
    if (this.elements.proposalLinks) this.elements.proposalLinks.innerHTML = "";
    this.currentProposalResponse = null;
    if (this.elements.raw) this.elements.raw.value = "Envoi de la requête à Ollama...";
    
    // Send the request.
    sendAiRequest({
      prompt: proposalPrompt,
      model,
      context: 'Graph proposals',
      abortController: this.currentAbortController,
      onChunk: (chunk, fullText) => {
        if (this.elements.raw) this.elements.raw.value = fullText;
      },
      onComplete: (proposals) => {
        try {
          // Validate the response.
          this.validateProposal(proposals);
          
          // Render proposed nodes.
          if (this.elements.proposalNodes) {
            proposals.nodes.forEach(nodeP => {
              const nodeElement = this.createProposalNodeElement(nodeP);
              this.elements.proposalNodes.appendChild(nodeElement);
            });
          }
          
          // Render proposed links.
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
          // Re-enable the button.
          this.updateLoadingState(this.elements.proposalsBtn, false, "proposals");
        }
      },
      onError: (error) => {
        console.error("Proposal request error:", error);
        if (this.elements.raw) {
          this.elements.raw.value += "\nErreur: " + 
            ((error.name === 'AbortError') ? "Génération des propositions arrêtée." : error.message);
        }
        
        // Re-enable the button.
        this.updateLoadingState(this.elements.proposalsBtn, false, "proposals");
      }
    });
  }
  
  /**
   * Validates the proposal response structure.
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
   * Creates a proposed node element.
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
   * Creates a proposed link element.
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
   * Handles clearing proposals.
   */
  handleClearProposals() {
    this.currentProposalResponse = null;
    if (this.elements.proposalNodes) this.elements.proposalNodes.innerHTML = "";
    if (this.elements.proposalLinks) this.elements.proposalLinks.innerHTML = "";
  }

  /**
   * Translates a field for the selected node/link.
   */
  handleTranslateSelected() {
    const field = this.elements.translateField?.value?.trim();
    const targetLang = this.elements.translateTarget?.value?.trim();
    if (!field || !targetLang) {
      alert("Veuillez choisir un champ et une langue cible.");
      return;
    }

    const selectedNode = this.graphState.selectedNode;
    const selectedLink = this.graphState.selectedLink;
    const item = selectedNode || selectedLink;
    if (!item) {
      alert("Sélectionnez un noeud ou un lien.");
      return;
    }

    let value = item[field] ?? item[field.replace(/\.[a-z]+$/i, '')] ?? '';
    if (value && typeof value === 'object') {
      const lang = this.graphState.globalSettings.currentLanguage;
      if (lang && value[lang] != null) value = value[lang];
      else {
        const firstKey = Object.keys(value)[0];
        value = value[firstKey] ?? '';
      }
    }
    if (!value) {
      alert("Champ vide, rien à traduire.");
      return;
    }

    this.currentAbortController = new AbortController();
    const model = this.elements.translateModel?.value?.trim()
      || this.elements.model?.value?.trim()
      || getModel();
    const prompt = `Traduire en ${targetLang}. Répondre uniquement avec la traduction.\nTexte:\n${value}`;

    sendAiRequest({
      prompt,
      model,
      context: 'Translate selection',
      abortController: this.currentAbortController,
      onComplete: (translation) => {
        const newValue = typeof translation === 'string' ? translation : (translation?.text || "");
        if (!newValue) return;

        if (selectedNode) {
          performAction({
            type: "update_node",
            data: {
              nodeId: selectedNode.id,
              field: field,
              from: selectedNode[field] ?? "",
              to: newValue,
              label: `Translate ${field} to ${targetLang}`
            }
          });
        } else if (selectedLink) {
          performAction({
            type: "update_link",
            data: {
              linkId: selectedLink.id,
              field: field,
              from: selectedLink[field] ?? "",
              to: newValue,
              label: `Translate ${field} to ${targetLang}`
            }
          });
        }
        this.renderer.updateGraph();
      },
      onError: (error) => {
        console.error("Translate error:", error);
        alert(`Erreur de traduction: ${error.message}`);
      }
    });
  }

  refreshTranslationSheet() {
    const body = this.elements.sheetBody;
    if (!body) return;
    body.innerHTML = '';

    const defaultSource = this.graphState.globalSettings.currentLanguage || 'fr';
    if (this.elements.sheetLangSource && !this.elements.sheetLangSource.value) {
      this.elements.sheetLangSource.value = defaultSource;
    }
    const sourceLang = (this.elements.sheetLangSource?.value || defaultSource).trim();
    if (this.elements.sheetLangTarget && !this.elements.sheetLangTarget.value) {
      const langs = (this.graphState.globalSettings.multilingualLangs || 'fr,en')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
      this.elements.sheetLangTarget.value = langs.find(l => l !== sourceLang) || 'en';
    }
    const targetLang = (this.elements.sheetLangTarget?.value || '').trim();
    const scope = 'both';
    const fields = this.collectAllFields();
    this.populateSheetFieldOptions(fields);

    const langs = (this.graphState.globalSettings.multilingualLangs || 'fr,en')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    const addRow = (type, id, field, lang, value) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${type}</td>
        <td>${id}</td>
        <td>${field}</td>
        <td>${lang}</td>
        <td>
          <input class="sheet-input" type="text"
            data-type="${type}"
            data-id="${id}"
            data-field="${field}"
            data-lang="${lang}"
            value="${escapeHtml(String(value ?? ""))}">
        </td>
        <td><input type="checkbox" class="sheet-check"
          data-type="${type}"
          data-id="${id}"
          data-field="${field}"
          data-lang="${lang}"
          data-source="${escapeHtml(String(value ?? ""))}"
          data-targetlang="${targetLang}"></td>
      `;
      body.appendChild(tr);
    };

    const rows = [];
    const addItems = (items, type) => {
      items.forEach(item => {
        fields.forEach(base => {
          const hasLang = langs.some(l => item[`${base}_${l}`] != null) ||
            (item[base] && typeof item[base] === 'object');
          if (hasLang) {
            langs.forEach(lang => {
              const val = this.resolveLangField(item, base, lang);
              if (val != null && val !== '') {
                rows.push({ type, id: item.id, field: base, lang, value: val });
              }
            });
          } else {
            const val = item[base];
            if (val != null && val !== '') {
              rows.push({ type, id: item.id, field: base, lang: '', value: val });
            }
          }
        });
      });
    };

    if (scope === 'nodes' || scope === 'both') addItems(this.graphState.nodes, 'node');
    if (scope === 'links' || scope === 'both') addItems(this.graphState.links, 'link');

    const filterText = (this.elements.sheetFilter?.value || '').toLowerCase();
    const filterType = this.elements.sheetFilterType?.value || '';
    const filterField = this.elements.sheetFilterField?.value || '';
    const filterLang = (this.elements.sheetFilterLang?.value || '').toLowerCase();

    const filtered = rows.filter(r => {
      if (filterType && r.type !== filterType) return false;
      if (filterField && r.field !== filterField) return false;
      if (filterLang && String(r.lang).toLowerCase() !== filterLang) return false;
      if (filterText) {
        const hay = `${r.type} ${r.id} ${r.field} ${r.lang} ${r.value}`.toLowerCase();
        if (!hay.includes(filterText)) return false;
      }
      return true;
    });

    const sortKey = this.elements.sheetSort?.value || 'type';
    filtered.sort((a, b) => {
      const av = String(a[sortKey] ?? '');
      const bv = String(b[sortKey] ?? '');
      return av.localeCompare(bv);
    });

    filtered.forEach(r => addRow(r.type, r.id, r.field, r.lang, r.value));
  }

  resolveLangField(item, base, lang) {
    const suffix = `${base}_${lang}`;
    if (item[suffix] != null) return item[suffix];
    const obj = item[base];
    if (obj && typeof obj === 'object' && obj[lang] != null) return obj[lang];
    if (!lang) return item[base];
    // fallback: any available suffix
    const any = Object.keys(item || {}).find(k => k.startsWith(`${base}_`));
    if (any) return item[any];
    return '';
  }

  collectAllFields() {
    const exclude = new Set(['vx','vy','fx','fy','index','source','target']);
    const fields = new Set();
    const addFrom = items => {
      items.forEach(item => {
        Object.keys(item || {}).forEach(k => {
          if (exclude.has(k)) return;
          const base = k.includes('_') ? k.split('_').slice(0, -1).join('_') : k;
          fields.add(base || k);
        });
      });
    };
    addFrom(this.graphState.nodes);
    addFrom(this.graphState.links);
    return Array.from(fields);
  }

  populateSheetFieldOptions(fields) {
    if (this.elements.sheetFilterField) {
      const options = [''].concat(fields);
      this.elements.sheetFilterField.innerHTML = options
        .map(f => `<option value="${f}">${f || 'Tous'}</option>`)
        .join('');
    }
    if (this.elements.sheetColumnField) {
      this.elements.sheetColumnField.innerHTML = fields
        .map(f => `<option value="${f}">${f}</option>`)
        .join('');
    }
  }

  toggleAllSheetChecks(value) {
    document.querySelectorAll('.sheet-check').forEach(cb => {
      cb.checked = value;
    });
  }

  translateSheetSelection() {
    const selected = Array.from(document.querySelectorAll('.sheet-check'))
      .filter(cb => cb.checked)
      .map(cb => ({
        type: cb.dataset.type,
        id: cb.dataset.id,
        field: cb.dataset.field,
        source: cb.closest('tr')?.querySelector('.sheet-input')?.value ?? cb.dataset.source,
        lang: cb.dataset.lang,
        targetLang: cb.dataset.targetlang
      }));

    if (!selected.length) {
      alert("Aucune case cochée.");
      return;
    }

    const targetLang = selected[0].targetLang || '';
    if (!targetLang) {
      alert("Veuillez définir une langue cible.");
      return;
    }

    this.currentAbortController = new AbortController();
    const model = this.elements.sheetModel?.value?.trim()
      || this.elements.model?.value?.trim()
      || getModel();
    const payload = selected.map((s, idx) => ({
      index: idx,
      type: s.type,
      id: s.id,
      field: s.field,
      lang: s.lang,
      text: s.source
    }));
    const prompt = `
Tu es un traducteur. Traduis chaque élément en ${targetLang}.
Réponds uniquement avec un JSON valide au format:
[
  {"index":0,"translation":"..."},
  ...
]
Entrée:
${JSON.stringify(payload, null, 2)}
`;

    sendAiRequest({
      prompt,
      model,
      context: 'Translate sheet',
      abortController: this.currentAbortController,
      onComplete: (result) => {
        let parsed = result;
        try {
          if (typeof result === 'string') parsed = JSON.parse(result);
        } catch (e) {
          alert("Réponse IA invalide (JSON attendu).");
          return;
        }
        if (!Array.isArray(parsed)) {
          alert("Réponse IA invalide (tableau attendu).");
          return;
        }

        const actions = [];
        parsed.forEach(item => {
          const src = selected.find(s => String(s.index) === String(item.index) || Number(s.index) === Number(item.index));
          if (!src || !item.translation) return;
          const field = `${src.field}_${targetLang}`;
          if (src.type === 'node') {
            actions.push({
              type: "update_node",
              data: { nodeId: src.id, field, from: "", to: item.translation, label: `Translate ${src.field} to ${targetLang}` }
            });
          } else {
            actions.push({
              type: "update_link",
              data: { linkId: src.id, field, from: "", to: item.translation, label: `Translate ${src.field} to ${targetLang}` }
            });
          }
        });

        if (actions.length) {
          performAction({ type: "composite", actions, label: "Batch translate" });
          this.renderer.updateGraph();
          this.refreshTranslationSheet();
        }
      },
      onError: (error) => {
        console.error("Batch translate error:", error);
        alert(`Erreur de traduction: ${error.message}`);
      }
    });
  }

  applySheetEdits() {
    const inputs = Array.from(document.querySelectorAll('.sheet-input'));
    const actions = [];
    inputs.forEach(input => {
      const type = input.dataset.type;
      const id = input.dataset.id;
      const field = input.dataset.field;
      const lang = input.dataset.lang;
      const fullField = `${field}_${lang}`;
      const newValue = input.value;
      if (type === 'node') {
        const node = this.graphState.nodes.find(n => String(n.id) === String(id));
        if (!node) return;
        const oldValue = node[fullField] ?? "";
        if (newValue !== oldValue) {
          actions.push({
            type: "update_node",
            data: { nodeId: node.id, field: fullField, from: oldValue, to: newValue, label: `Edit ${fullField}` }
          });
        }
      } else {
        const link = this.graphState.links.find(l => String(l.id) === String(id));
        if (!link) return;
        const oldValue = link[fullField] ?? "";
        if (newValue !== oldValue) {
          actions.push({
            type: "update_link",
            data: { linkId: link.id, field: fullField, from: oldValue, to: newValue, label: `Edit ${fullField}` }
          });
        }
      }
    });
    if (actions.length) {
      performAction({ type: "composite", actions, label: "Spreadsheet edits" });
      this.renderer.updateGraph();
      this.refreshTranslationSheet();
    }
  }

  updateFromSheetInput(input) {
    const type = input.dataset.type;
    const id = input.dataset.id;
    const field = input.dataset.field;
    const lang = input.dataset.lang;
    const fullField = `${field}_${lang}`;
    const newValue = input.value;
    if (type === 'node') {
      const node = this.graphState.nodes.find(n => String(n.id) === String(id));
      if (!node) return;
      const oldValue = node[fullField] ?? "";
      if (newValue !== oldValue) {
        performAction({
          type: "update_node",
          data: { nodeId: node.id, field: fullField, from: oldValue, to: newValue, label: `Edit ${fullField}` }
        });
        this.renderer.updateGraph();
      }
    } else {
      const link = this.graphState.links.find(l => String(l.id) === String(id));
      if (!link) return;
      const oldValue = link[fullField] ?? "";
      if (newValue !== oldValue) {
        performAction({
          type: "update_link",
          data: { linkId: link.id, field: fullField, from: oldValue, to: newValue, label: `Edit ${fullField}` }
        });
        this.renderer.updateGraph();
      }
    }
  }

  applySheetFindReplace() {
    const find = this.elements.sheetFind?.value || '';
    const replace = this.elements.sheetReplace?.value || '';
    if (!find) return;
    const inputs = Array.from(document.querySelectorAll('.sheet-input'));
    inputs.forEach(input => {
      if (input.value.includes(find)) {
        input.value = input.value.split(find).join(replace);
      }
    });
  }

  selectColumn() {
    const field = this.elements.sheetColumnField?.value || '';
    const lang = (this.elements.sheetColumnLang?.value || '').trim();
    document.querySelectorAll('.sheet-check').forEach(cb => {
      if (cb.dataset.field === field && (!lang || cb.dataset.lang === lang)) {
        cb.checked = true;
      }
    });
  }

  exportSheetCsv() {
    const rows = Array.from(document.querySelectorAll('#multilingual-sheet-body tr')).map(tr => {
      const tds = tr.querySelectorAll('td');
      if (tds.length < 6) return null;
      return {
        type: tds[0].textContent.trim(),
        id: tds[1].textContent.trim(),
        field: tds[2].textContent.trim(),
        lang: tds[3].textContent.trim(),
        value: tr.querySelector('.sheet-input')?.value ?? ''
      };
    }).filter(Boolean);

    if (!rows.length) return;
    const header = "type,id,field,lang,value\n";
    const body = rows.map(r => {
      const vals = [r.type, r.id, r.field, r.lang, r.value].map(v => {
        const s = String(v ?? '');
        return (s.includes(',') || s.includes('"') || s.includes('\n')) ? `"${s.replace(/"/g, '""')}"` : s;
      });
      return vals.join(',');
    }).join('\n');
    const csv = header + body;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tableur.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 100);
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
