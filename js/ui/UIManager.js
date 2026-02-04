/**
 * Gère l'interface utilisateur de l'application
 */
import { undo, redo, jumpToHistory } from '../state/undo_redo.js';
import { FormManager } from './forms.js';
import { WindowEventManager } from '../services/WindowEventManager.js';  // ← import ajouté
import { syncGlobalSettingsUI as refreshFieldSelects } from './FieldSelectService.js';
import UIContext from './UIContext.js';    // ← import ajouté

export class UIManager {
  constructor(graphState, renderer) {
    this.graphState = graphState;
    this.renderer = renderer;
    
    // 1) Récupérer et stocker toutes les références DOM (via UIContext)
    this.el = {
      undoBtn:               UIContext.get('#undoButton'),
      redoBtn:               UIContext.get('#redoButton'),
      updateBtn:             UIContext.get('#update'),
      changeLabelBtn:        UIContext.get('#changeLabelButton'),
      addNodeFieldBtn:       UIContext.get('#addNodeFieldButton'),
      addNodeFieldInput:     UIContext.get('#addNodeFieldInput'),
      addLinkFieldBtn:       UIContext.get('#addLinkFieldButton'),
      addLinkFieldInput:     UIContext.get('#addLinkFieldInput'),
      highlightNeighborsBtn: UIContext.get('#btn-highlight-neighbors'),
      clearHighlightsBtn:    UIContext.get('#btn-clear-highlights'),
      highlightHighDegreeBtn:UIContext.get('#btn-high-degree'),
      colorClustersBtn:      UIContext.get('#btn-color-clusters'),
      nodeLabelSelect:       UIContext.get('#node-label'),
      linkLabelSelect:       UIContext.get('#link-label'),
      nodeSizeFieldSelect:   UIContext.get('#node-size-field'),
      defaultNodeSizeInput:  UIContext.get('#defaultNodeSizeInput'),
      defaultLinkWidthInput: UIContext.get('#defaultLinkWidthInput'),
      historySelect:         UIContext.get('#historySelect')
      // …ajouter d’autres références si nécessaire…
    };
    
    // 2) Initialiser
    this.formManager = new FormManager(graphState, renderer);
    this.initEventListeners();
    this.initHistoryPanel();
    this.initTabPanel();

    // 3) Synchroniser immédiatement les selects/inputs
    refreshFieldSelects(this.graphState);

    // 4) Lier tous les écouteurs window centralisés
    WindowEventManager.bindAll(this);

    // 5) Nettoyer les écouteurs sur window à la fermeture de la page
    window.addEventListener('unload', () => WindowEventManager.unbindAll());
  }
  
  /**
   * Initialise les écouteurs d'événements de base
   */
  initEventListeners() {
    // Undo/Redo
    this.el.undoBtn?.addEventListener('click', () => undo());
    this.el.redoBtn?.addEventListener('click', () => redo());
    this.el.updateBtn?.addEventListener('click', () => this.renderer.updateGraph());
    
    // Label reset
    this.el.changeLabelBtn?.addEventListener('click', () => this.initializeLabels());
    
    // Champs dynamiques
    this.el.addNodeFieldBtn?.addEventListener('click', () => {
      const name = this.el.addNodeFieldInput.value.trim();
      if (name) this.formManager.addField(name, 'node');
    });
    this.el.addLinkFieldBtn?.addEventListener('click', () => {
      const name = this.el.addLinkFieldInput.value.trim();
      if (name) this.formManager.addField(name, 'link');
    });
    
    // Actions avancées
    this.el.highlightNeighborsBtn?.addEventListener('click', () =>
      this.renderer.highlightNeighbors(this.graphState.selectedNode)
    );
    this.el.clearHighlightsBtn?.addEventListener('click', () => {
      this.renderer.clearHighlights();
      this.renderer.updateGraph();
    });
    this.el.highlightHighDegreeBtn?.addEventListener('click', () =>
      this.renderer.highlightHighDegree(2)
    );
    this.el.colorClustersBtn?.addEventListener('click', () =>
      this.renderer.colorClusters()
    );

    // Configuration globale
    this.setupGlobalSettingsListeners();
  }
  
  /**
   * Configure DRY les écouteurs sur tous les contrôles de paramètres globaux
   */
  setupGlobalSettingsListeners() {
    const mapping = [
      { id:'node-label',      event:'change', field:'nodeLabelField',  parser: v=>v },
      { id:'link-label',      event:'change', field:'linkLabelField',  parser: v=>v },
      { id:'node-id-field',   event:'change', field:'nodeIdField',     parser: v=>v },
      { id:'node-x-field',    event:'change', field:'xField',          parser: v=>v },
      { id:'node-y-field',    event:'change', field:'yField',          parser: v=>v },
      { id:'node-size-field', event:'change', field:'nodeSizeField',   parser: v=>v },
      { id:'defaultNodeSizeInput', event:'change', field:'defaultNodeSize', parser: v=>+v||30 },
      { id:'defaultLinkWidthInput', event:'change', field:'defaultLinkWidth', parser: parseFloat }
    ];
    mapping.forEach(({id,event,field,parser}) => {
      const elt = document.getElementById(id);
      if (!elt) return;
      elt.addEventListener(event, () => {
        const val = parser(elt.value);
        // Validate nodeIdField: must exist on all nodes and be unique
        if (field === 'nodeIdField' && val) {
          const ids = this.graphState.nodes.map(n => n[val]);
          const hasMissing = ids.some(v => v === undefined || v === null || v === '');
          const uniq = new Set(ids.map(v => String(v)));
          if (hasMissing || uniq.size !== ids.length) {
            alert("Le champ ID sélectionné doit être présent et unique pour tous les noeuds.");
            // revert to previous value
            elt.value = this.graphState.globalSettings.nodeIdField;
            return;
          }
        }
        this.graphState.updateGlobalSetting(field, val);
        this.renderer.updateGraph();
        // mettre à jour les selects/inputs si besoin
        refreshFieldSelects(this.graphState);
      });
    });
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
  refreshFieldSelects(state);
}
