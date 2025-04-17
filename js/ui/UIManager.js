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
    this.initFieldSelects();
    
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
  }
  
  /**
   * Configure les écouteurs pour les paramètres globaux
   */
  setupGlobalSettingsListeners() {
    // Changement du champ de label pour les nœuds
    const nodeLabelSelect = document.getElementById('node-label');
    if (nodeLabelSelect) {
      nodeLabelSelect.addEventListener('change', () => this.handleNodeLabelChange());
    }
    
    // Changement du champ de label pour les liens
    const linkLabelSelect = document.getElementById('link-label');
    if (linkLabelSelect) {
      linkLabelSelect.addEventListener('change', () => this.handleLinkLabelChange());
    }
    
    // Changement du champ de taille pour les nœuds
    const nodeSizeSelect = document.getElementById('node-size-field');
    if (nodeSizeSelect) {
      nodeSizeSelect.addEventListener('change', () => this.handleNodeSizeFieldChange());
    }
    
    // Changement de la taille par défaut des nœuds
    const defaultNodeSizeInput = document.getElementById('defaultNodeSizeInput');
    if (defaultNodeSizeInput) {
      defaultNodeSizeInput.addEventListener('change', () => this.handleDefaultNodeSizeChange());
    }
    
    // Changement de la largeur par défaut des liens
    const defaultLinkWidthInput = document.getElementById('defaultLinkWidthInput');
    if (defaultLinkWidthInput) {
      defaultLinkWidthInput.addEventListener('change', () => this.handleDefaultLinkWidthChange());
    }
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
    // Node label field
    const nodeLabelSelect = document.getElementById('node-label');
    if (nodeLabelSelect) {
      this.updateSelectOptions(nodeLabelSelect, this.graphState.getNodeFields(), this.graphState.globalSettings.nodeLabelField);
    }
    
    // Link label field
    const linkLabelSelect = document.getElementById('link-label');
    if (linkLabelSelect) {
      this.updateSelectOptions(linkLabelSelect, this.graphState.getLinkFields(), this.graphState.globalSettings.linkLabelField);
    }
    
    // Node size field
    const nodeSizeSelect = document.getElementById('node-size-field');
    if (nodeSizeSelect) {
      this.updateSelectOptions(nodeSizeSelect, this.graphState.getNodeFields(), this.graphState.globalSettings.nodeSizeField);
    }
    
    // Default node size
    const defaultNodeSizeInput = document.getElementById('defaultNodeSizeInput');
    if (defaultNodeSizeInput) {
      defaultNodeSizeInput.value = this.graphState.globalSettings.defaultNodeSize;
    }
    
    // Default link width
    const defaultLinkWidthInput = document.getElementById('defaultLinkWidthInput');
    if (defaultLinkWidthInput) {
      defaultLinkWidthInput.value = this.graphState.globalSettings.defaultLinkWidth;
    }
    
    // Add field buttons
    const addNodeFieldButton = document.getElementById('addNodeFieldButton');
    const addNodeFieldInput = document.getElementById('addNodeFieldInput');
    if (addNodeFieldButton && addNodeFieldInput) {
      addNodeFieldButton.addEventListener('click', () => {
        const fieldName = addNodeFieldInput.value.trim();
        if (fieldName) {
          this.graphState.addField(fieldName, 'node');
          addNodeFieldInput.value = '';
          this.formManager.refreshForms();
          this.updateAllFieldSelects();
          this.renderer.updateGraph();
        }
      });
    }
    
    const addLinkFieldButton = document.getElementById('addLinkFieldButton');
    const addLinkFieldInput = document.getElementById('addLinkFieldInput');
    if (addLinkFieldButton && addLinkFieldInput) {
      addLinkFieldButton.addEventListener('click', () => {
        const fieldName = addLinkFieldInput.value.trim();
        if (fieldName) {
          this.graphState.addField(fieldName, 'link');
          addLinkFieldInput.value = '';
          this.formManager.refreshForms();
          this.updateAllFieldSelects();
          this.renderer.updateGraph();
        }
      });
    }
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
    
    if (nodeLabelSelect) {
      this.updateSelectOptions(nodeLabelSelect, this.graphState.getNodeFields(), this.graphState.globalSettings.nodeLabelField);
    }
    
    if (linkLabelSelect) {
      this.updateSelectOptions(linkLabelSelect, this.graphState.getLinkFields(), this.graphState.globalSettings.linkLabelField);
    }
    
    if (nodeSizeSelect) {
      this.updateSelectOptions(nodeSizeSelect, this.graphState.getNodeFields(), this.graphState.globalSettings.nodeSizeField);
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
      if (event.detail?.action?.type === "import_graph") {
        console.log("Action import_graph détectée, rafraîchissement des formulaires...");
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