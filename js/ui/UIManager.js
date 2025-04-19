/**
 * Gère l'interface utilisateur de l'application
 */
import { undo, redo, jumpToHistory } from '../state/undo_redo.js';
import { FormManager } from './forms.js';
import { uiConfig } from '../config/index.js';

export class UIManager {
  constructor(graphState, renderer) {
    this.graphState = graphState;
    this.renderer = renderer;
    
    // Création du gestionnaire de formulaires
    this.formManager = new FormManager(graphState, renderer);
    
    // Initialisation des écouteurs d'événements
    this.initEventListeners();
    this.initHistoryPanel();
    this.initTabPanel();
    this.syncGlobalSettingsUI();  // remplace initFieldSelects() + setupGlobalSettingsListeners()
    
    // Écouteurs d'événements pour les mises à jour de l'interface
    this.setupUIUpdateListeners();
  }
  
  /**
   * Initialise les écouteurs d'événements de base
   */
  initEventListeners() {
    // Undo/Redo
    document.getElementById('undoButton')?.addEventListener('click', () => undo());
    document.getElementById('redoButton')?.addEventListener('click', () => redo());
    document.getElementById('update')?.addEventListener('click', () => this.renderer.updateGraph());
    
    // Configuration globale
    this.setupGlobalSettingsListeners();
    
    // Écouteurs d'événements personnalisés
    window.addEventListener('undo-requested', () => undo());
    window.addEventListener('redo-requested', () => redo());
    window.addEventListener('node-selected', (event) => {
      console.log("Événement node-selected reçu pour:", event.detail.node?.id);
      if (event.detail.node) {
        this.formManager.showNodeForm(event.detail.node);
      }
    });
    window.addEventListener('link-selected', (event) => {
      console.log("Événement link-selected reçu pour:", event.detail.link?.id);
      if (event.detail.link) {
        this.formManager.showLinkForm(event.detail.link);
      }
    });
    
    // Ajout d'un écouteur explicite pour masquer les formulaires lors d'une désélection
    window.addEventListener('selection-cleared', () => {
      console.log("Événement selection-cleared reçu");
      this.formManager.hideAllForms();
    });
    
    window.addEventListener('node-created', (event) => {
      console.log("Événement node-created reçu pour:", event.detail.node?.id);
      if (event.detail.node) {
        this.formManager.showNodeForm(event.detail.node);
      }
    });
    
    // Initialisation des labels par défaut
    const changeLabelButton = document.getElementById("changeLabelButton");
    if (changeLabelButton) {
      changeLabelButton.addEventListener("click", () => this.initializeLabels());
    }

    // Ajouter des champs dynamiques
    const addNodeBtn = document.getElementById('addNodeFieldButton');
    if (addNodeBtn) {
      addNodeBtn.addEventListener('click', () => {
        const name = document.getElementById('addNodeFieldInput')?.value.trim();
        if (name) this.formManager.addField(name, 'node');
      });
    }
    const addLinkBtn = document.getElementById('addLinkFieldButton');
    if (addLinkBtn) {
      addLinkBtn.addEventListener('click', () => {
        const name = document.getElementById('addLinkFieldInput')?.value.trim();
        if (name) this.formManager.addField(name, 'link');
      });
    }

    document.getElementById('btn-highlight-neighbors')?.addEventListener('click', () => {
      this.renderer.highlightNeighbors(this.graphState.selectedNode);
    });
    document.getElementById('btn-clear-highlights')?.addEventListener('click', () => {
      this.renderer.clearHighlights();
      this.renderer.updateGraph();
    });
    document.getElementById('btn-high-degree')?.addEventListener('click', () => {
      this.renderer.highlightHighDegree(2);
    });
    document.getElementById('btn-color-clusters')?.addEventListener('click', () => {
      this.renderer.colorClusters();
    });
  }
  
  /**
   * Configure DRY les écouteurs sur tous les contrôles de paramètres globaux
   */
  setupGlobalSettingsListeners() {
    const mapping = [
      { id: 'node-label',         event: 'change', field: 'nodeLabelField' },
      { id: 'link-label',         event: 'change', field: 'linkLabelField' },
      { id: 'node-size-field',    event: 'change', field: 'nodeSizeField' },
      { id: 'node-id-field',      event: 'change', field: 'nodeIdField' },
      { id: 'node-x-field',       event: 'change', field: 'xField' },
      { id: 'node-y-field',       event: 'change', field: 'yField' },
      { id: 'defaultNodeSizeInput',  event: 'change', field: 'defaultNodeSize', parser: v=>+v||30 },
      { id: 'defaultLinkWidthInput', event: 'change', field: 'defaultLinkWidth', parser: parseFloat }
    ];
    mapping.forEach(({id,event,field,parser}) => {
      const elt = document.getElementById(id);
      if (!elt) return;
      elt.addEventListener(event, () => {
        const raw = elt.value;
        const val = parser ? parser(raw) : raw;
        this.graphState.updateGlobalSetting(field, val);
        this.renderer.updateGraph();
      });
    });
  }
  
  /**
   * Met à jour les options de tous les <select> et inputs de config
   */
  initFieldSelects() {
    const selects = [
      { id: 'node-label',      opts: this.graphState.getNodeFields(), val: this.graphState.globalSettings.nodeLabelField },
      { id: 'link-label',      opts: this.graphState.getLinkFields(), val: this.graphState.globalSettings.linkLabelField },
      { id: 'node-size-field', opts: this.graphState.getNodeFields(), val: this.graphState.globalSettings.nodeSizeField },
      { id: 'node-id-field',   opts: this.graphState.getNodeFields(), val: this.graphState.globalSettings.nodeIdField },
      { id: 'node-x-field',    opts: this.graphState.getNodeFields(), val: this.graphState.globalSettings.xField },
      { id: 'node-y-field',    opts: this.graphState.getNodeFields(), val: this.graphState.globalSettings.yField }
    ];
    selects.forEach(({id,opts,val}) => {
      const sel = document.getElementById(id);
      if (sel) this.updateSelectOptions(sel, opts, val);
    });
    document.getElementById('defaultNodeSizeInput').value = this.graphState.globalSettings.defaultNodeSize;
    document.getElementById('defaultLinkWidthInput').value = this.graphState.globalSettings.defaultLinkWidth;
  }
  
  /**
   * Exécute la synchro UI globale (listeners + valeurs initiales)
   */
  syncGlobalSettingsUI() {
    this.setupGlobalSettingsListeners();
    this.initFieldSelects();
  }
  
  /**
   * Gestionnaire pour le changement de label des nœuds
   */
  handleNodeLabelChange() {
    const nodeLabelSelect = document.getElementById('node-label');
    if (nodeLabelSelect) {
      const newValue = nodeLabelSelect.value;
      this.graphState.updateGlobalSetting('nodeLabelField', newValue);
      this.renderer.updateGraph();
    }
  }
  
  /**
   * Gestionnaire pour le changement de label des liens
   */
  handleLinkLabelChange() {
    const linkLabelSelect = document.getElementById('link-label');
    if (linkLabelSelect) {
      const newValue = linkLabelSelect.value;
      this.graphState.updateGlobalSetting('linkLabelField', newValue);
      this.renderer.updateGraph();
    }
  }
  
  /**
   * Gestionnaire pour le changement du champ de taille des nœuds
   */
  handleNodeSizeFieldChange() {
    const nodeSizeSelect = document.getElementById('node-size-field');
    if (nodeSizeSelect) {
      const newValue = nodeSizeSelect.value;
      this.graphState.updateGlobalSetting('nodeSizeField', newValue);
      this.renderer.updateGraph();
    }
  }
  
  /**
   * Gestionnaire pour le changement de la taille par défaut des nœuds
   */
  handleDefaultNodeSizeChange() {
    const defaultNodeSizeInput = document.getElementById('defaultNodeSizeInput');
    if (defaultNodeSizeInput) {
      const newValue = +defaultNodeSizeInput.value || 30;
      this.graphState.updateGlobalSetting('defaultNodeSize', newValue);
      this.renderer.updateGraph();
    }
  }
  
  /**
   * Gestionnaire pour le changement de la largeur par défaut des liens
   */
  handleDefaultLinkWidthChange() {
    const defaultLinkWidthInput = document.getElementById('defaultLinkWidthInput');
    if (defaultLinkWidthInput) {
      const newValue = parseFloat(defaultLinkWidthInput.value) || 2;
      this.graphState.updateGlobalSetting('defaultLinkWidth', newValue);
      
      // Mettre à jour tous les liens existants avec la nouvelle valeur
      this.graphState.links.forEach(link => {
        link.width = newValue;
      });
      
      this.renderer.updateGraph();
    }
  }
  
  /**
   * Initialise le panneau d'historique
   */
  initHistoryPanel() {
    const historySelect = document.getElementById('historySelect');
    if (historySelect) {
      historySelect.addEventListener('dblclick', function() {
        const index = +this.value;
        jumpToHistory(index);
      });
    }
    
    // Mise à jour de l'historique quand il change
    window.updateHistoryList = function(history) {
      const historySelect = document.getElementById('historySelect');
      if (!historySelect) return;
      
      while (historySelect.firstChild) {
        historySelect.removeChild(historySelect.firstChild);
      }
      
      history.forEach((action, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = `${index}: ${action.label || action.type}`;
        historySelect.appendChild(option);
      });
    };
  }
  
  /**
   * Initialise le panneau d'onglets
   */
  initTabPanel() {
    const bottomPanel = document.querySelector("#bottom-panel");
    const cardHeader = document.querySelector("#bottom-panel-header");
    const headerToggle = document.querySelector(".header-toggle");
    const arrow = document.querySelector(".arrow");
    
    if (cardHeader && bottomPanel && headerToggle && arrow) {
      // Bascule du volet
      cardHeader.addEventListener("click", event => {
        if (event.target === cardHeader || event.target === headerToggle) {
          bottomPanel.classList.toggle("collapsed");
          arrow.classList.toggle("arrow-down");
          arrow.classList.toggle("arrow-up");
        }
      });
      
      // Ouvre le volet lors du clic sur un onglet
      const tabs = document.querySelectorAll(".nav-item");
      tabs.forEach(tab => {
        tab.addEventListener("click", () => {
          if (bottomPanel.classList.contains("collapsed")) {
            bottomPanel.classList.remove("collapsed");
            arrow.classList.add("arrow-up");
            arrow.classList.remove("arrow-down");
          }
        });
      });
    }
    
    // Configuration des contrôles de courbure
    this.setupRangeValueDisplays();
  }
  
  /**
   * Configure l'affichage des valeurs pour les contrôles de plage
   */
  setupRangeValueDisplays() {
    function setupRangeValueDisplay(rangeId, valueId) {
      const range = document.getElementById(rangeId);
      const valueDisplay = document.getElementById(valueId);
      
      if (range && valueDisplay) {
        // Initialiser avec la valeur actuelle
        valueDisplay.textContent = range.value;
        
        // Mettre à jour pendant le glissement
        range.addEventListener('input', () => {
          valueDisplay.textContent = range.value;
        });
      }
    }
    
    // Configuration des affichages de valeur pour chaque slider
    setupRangeValueDisplay('base-curvature', 'base-curvature-value');
    setupRangeValueDisplay('loop-curvature', 'loop-curvature-value');
    setupRangeValueDisplay('curvature-step', 'curvature-step-value');
    
    // Ajout de la mise à jour en temps réel pendant le glissement (input) et pas seulement au changement (change)
    d3.select('#base-curvature').on('input', function() {
      document.getElementById('base-curvature-value').textContent = this.value;
    });
    
    d3.select('#loop-curvature').on('input', function() {
      document.getElementById('loop-curvature-value').textContent = this.value;
    });
    
    d3.select('#curvature-step').on('input', function() {
      document.getElementById('curvature-step-value').textContent = this.value;
    });
  }
  
  /**
   * Initialise les sélecteurs de champs
   */
  initFieldSelects() {
    const selects = [
      { id: 'node-label',     opts: this.graphState.getNodeFields(),  val: this.graphState.globalSettings.nodeLabelField },
      { id: 'link-label',     opts: this.graphState.getLinkFields(),  val: this.graphState.globalSettings.linkLabelField },
      { id: 'node-size-field',opts: this.graphState.getNodeFields(),  val: this.graphState.globalSettings.nodeSizeField },
      { id: 'node-id-field',  opts: this.graphState.getNodeFields(),  val: this.graphState.globalSettings.nodeIdField },
      { id: 'node-x-field',   opts: this.graphState.getNodeFields(),  val: this.graphState.globalSettings.xField },
      { id: 'node-y-field',   opts: this.graphState.getNodeFields(),  val: this.graphState.globalSettings.yField }
    ];
    selects.forEach(({id,opts,val}) => {
      const sel = document.getElementById(id);
      if (sel) this.updateSelectOptions(sel, opts, val);
    });
    document.getElementById('defaultNodeSizeInput').value = this.graphState.globalSettings.defaultNodeSize;
    document.getElementById('defaultLinkWidthInput').value = this.graphState.globalSettings.defaultLinkWidth;
  }
  
  /**
   * Met à jour les options d'un sélecteur
   */
  updateSelectOptions(selectElem, optionsArr, selectedValue) {
    // Nettoyer les options existantes
    while (selectElem.firstChild) {
      selectElem.removeChild(selectElem.firstChild);
    }
    
    // Ajouter option vide
    const emptyOption = document.createElement('option');
    emptyOption.value = '';
    emptyOption.textContent = '';
    selectElem.appendChild(emptyOption);
    
    // Ajouter les nouvelles options
    optionsArr.forEach(opt => {
      const option = document.createElement('option');
      option.value = opt;
      option.textContent = opt;
      selectElem.appendChild(option);
    });
    
    // Définir la valeur sélectionnée
    selectElem.value = selectedValue;
  }
  
  /**
   * Mettre à jour tous les sélecteurs de champs
   */
  updateAllFieldSelects() {
    const nodeLabelSelect = document.getElementById('node-label');
    const linkLabelSelect = document.getElementById('link-label');
    const nodeSizeSelect = document.getElementById('node-size-field');
    const nodeIdSelect = document.getElementById('node-id-field');
    const nodeXSelect = document.getElementById('node-x-field');
    const nodeYSelect = document.getElementById('node-y-field');
    
    if (nodeLabelSelect) {
      this.updateSelectOptions(nodeLabelSelect, this.graphState.getNodeFields(), this.graphState.globalSettings.nodeLabelField);
    }
    
    if (linkLabelSelect) {
      this.updateSelectOptions(linkLabelSelect, this.graphState.getLinkFields(), this.graphState.globalSettings.linkLabelField);
    }
    
    if (nodeSizeSelect) {
      this.updateSelectOptions(nodeSizeSelect, this.graphState.getNodeFields(), this.graphState.globalSettings.nodeSizeField);
    }

    if (nodeIdSelect) {
      this.updateSelectOptions(nodeIdSelect, this.graphState.getNodeFields(), this.graphState.globalSettings.nodeIdField);
    }

    if (nodeXSelect) {
      this.updateSelectOptions(nodeXSelect, this.graphState.getNodeFields(), this.graphState.globalSettings.xField);
    }

    if (nodeYSelect) {
      this.updateSelectOptions(nodeYSelect, this.graphState.getNodeFields(), this.graphState.globalSettings.yField);
    }
  }
  
  /**
   * Configure les écouteurs pour les mises à jour de l'interface
   */
  setupUIUpdateListeners() {
    // Mise à jour après une action d'historique
    const updateHistoryUI = () => {
      this.formManager.refreshForms();
      this.updateAllFieldSelects();
    };
    
    window.addEventListener('undo-performed', updateHistoryUI);
    window.addEventListener('redo-performed', updateHistoryUI);
    
    // Mise à jour après un import
    window.addEventListener('graph-imported', (event) => {
      console.log("Event 'graph-imported' reçu, rafraîchissement des formulaires...");
      // Forcer le rafraîchissement des formulaires avec les nouveaux champs
      this.formManager.refreshForms();
      this.updateAllFieldSelects();
      this.renderer.updateGraph();
    });
    
    // Mettre à jour les formulaires après application d'une action
    window.addEventListener('action-applied', (event) => {
      const type = event.detail?.action?.type;

      if (type === "import_graph") {
        console.log("Action import_graph détectée, rafraîchissement des formulaires...");
        this.formManager.refreshForms();
        this.updateAllFieldSelects();
      }

      // Nouveau : masquer les formulaires après suppression
      if (type === "delete_node" || type === "delete_link") {
        this.formManager.hideAllForms();
      }

      // ← Nouveau : après add_field ou remove_field, rafraîchir les dropdowns
      if (type === "add_field" || type === "remove_field") {
        this.formManager.refreshForms();
        this.updateAllFieldSelects();
      }
    });
  }
  
  /**
   * Initialise les valeurs des champs de label
   */
  initializeLabels() {
    this.graphState.updateGlobalSetting('nodeLabelField', 'name');
    this.graphState.updateGlobalSetting('linkLabelField', '');
    
    const nodeLabelSelect = document.getElementById('node-label');
    if (nodeLabelSelect) {
      nodeLabelSelect.value = 'name';
    }
    
    const linkLabelSelect = document.getElementById('link-label');
    if (linkLabelSelect) {
      linkLabelSelect.value = '';
    }
    
    this.renderer.updateGraph();
  }
}

/**
 * Helper testable: met à jour l’UI des paramètres globaux à partir d’un GraphState donné
 */
export function syncGlobalSettingsUI(state) {
  const entries = [
    { id:'node-label',            value: state.globalSettings.nodeLabelField,  opts: state.getNodeFields() },
    { id:'link-label',            value: state.globalSettings.linkLabelField,  opts: state.getLinkFields() },
    { id:'node-size-field',       value: state.globalSettings.nodeSizeField,  opts: state.getNodeFields() },
    { id:'node-id-field',         value: state.globalSettings.nodeIdField,    opts: state.getNodeFields() },
    { id:'node-x-field',          value: state.globalSettings.xField,          opts: state.getNodeFields() },
    { id:'node-y-field',          value: state.globalSettings.yField,          opts: state.getNodeFields() },
    { id:'defaultNodeSizeInput',  value: state.globalSettings.defaultNodeSize },
    { id:'defaultLinkWidthInput', value: state.globalSettings.defaultLinkWidth }
  ];
  entries.forEach(({id,value,opts}) => {
    const elt = document.getElementById(id);
    if (!elt) return;
    if (elt.tagName === 'SELECT') {
      // reset et remplir
      elt.innerHTML = '<option value=""></option>' +
        opts.map(o=>`<option value="${o}">${o}</option>`).join('');
      elt.value = value;
    } else {
      elt.value = value;
    }
  });
}