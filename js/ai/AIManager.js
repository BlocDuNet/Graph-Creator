/**
 * Gestion centralisée des fonctionnalités IA
 */
import { performAction } from '../state/undo_redo.js';
import { aiConfig } from '../config/index.js';
import eventBus from '../services/EventBus.js';
import * as templates from '../config/templates/graphGeneration.js';
import * as proposalTemplates from '../config/templates/proposals.js';
import {
  getProvider,
  getModel,
  setProvider,
  setModel,
  fetchModels,
  listProviders,
  applyToUI
} from './AIService.js';

export class AIManager {
  constructor(graphState, renderer) {
    this.graphState = graphState;
    this.renderer = renderer;
    
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
      provider: document.getElementById("aiProvider"),
      model: document.getElementById("aiModel"),
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
      translateField: document.getElementById("translateField"),
      translateTarget: document.getElementById("translateTarget"),
      translateBtn: document.getElementById("translateBtn")
      ,
      sheetRefresh: document.getElementById("sheet-refresh"),
      sheetSelectAll: document.getElementById("sheet-select-all"),
      sheetTranslate: document.getElementById("sheet-translate"),
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
      sheetFieldDesc: document.getElementById("sheet-field-description")
    };
    // Initialiser la liste des fournisseurs et des modeles
    if (this.elements.provider) {
      const providers = listProviders();
      this.elements.provider.innerHTML = providers
        .map(p => `<option value="${p}">${p}</option>`)
        .join('');
    }
    applyToUI(this.elements.provider, this.elements.model);
    fetchModels().then(models => {
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
      setModel(models[0]);
    }
  }
  
  /**
   * Initialise les écouteurs d'événements
   */
  initEventListeners() {
    if (this.elements.sendBtn) {
      this.elements.sendBtn.addEventListener("click", () => this.handleGenerateGraph());
    }

    if (this.elements.provider) {
      this.elements.provider.addEventListener('change', () => {
        setProvider(this.elements.provider.value);
        fetchModels().then(models => this.updateModelDropdown(models));
      });
    }

    if (this.elements.model) {
      this.elements.model.addEventListener('change', () => {
        setModel(this.elements.model.value.trim());
      });
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
    const model = this.elements.model?.value.trim() || getModel();
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
    getProvider().sendRequest({
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
      eventBus.emit('graph-imported', { nodes: normalizedGraph.nodes, links: normalizedGraph.links });
      
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
    const model = this.elements.model?.value.trim() || getModel();
    
    // Générer le prompt pour les propositions
    const proposalPrompt = proposalTemplates.getProposalPrompt(this.graphState);
    
    // Réinitialiser les zones d'affichage
    if (this.elements.proposalNodes) this.elements.proposalNodes.innerHTML = "";
    if (this.elements.proposalLinks) this.elements.proposalLinks.innerHTML = "";
    this.currentProposalResponse = null;
    if (this.elements.raw) this.elements.raw.value = "Envoi de la requête à Ollama...";
    
    // Envoyer la requête
    getProvider().sendRequest({
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

  /**
   * Traduire un champ pour le noeud/lien sélectionné
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
    const model = this.elements.model?.value.trim() || getModel();
    const prompt = `Traduire en ${targetLang}. Répondre uniquement avec la traduction.\nTexte:\n${value}`;

    getProvider().sendRequest({
      prompt,
      model,
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
    const model = this.elements.model?.value.trim() || getModel();
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

    getProvider().sendRequest({
      prompt,
      model,
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
