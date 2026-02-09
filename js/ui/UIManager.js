/**
 * Manages the application's user interface.
 */
import { undo, redo, jumpToHistory } from '../state/undo_redo.js';
import { FormManager } from './forms.js';
import { WindowEventManager } from '../services/WindowEventManager.js';  // ← import added
import { syncGlobalSettingsUI as refreshFieldSelects } from './FieldSelectService.js';
import UIContext from './UIContext.js';
import { FIELD_TYPES } from '../services/FieldTypeService.js';    // ← import added

export class UIManager {
  constructor(graphState, renderer) {
    this.graphState = graphState;
    this.renderer = renderer;
    
    // 1) Fetch and store all DOM references (via UIContext).
    this.el = {
      undoBtn:               UIContext.get('#undoButton'),
      redoBtn:               UIContext.get('#redoButton'),
      updateBtn:             UIContext.get('#update'),
      changeLabelBtn:        UIContext.get('#changeLabelButton'),
      addNodeFieldBtn:       UIContext.get('#addNodeFieldButton'),
      addNodeFieldInput:     UIContext.get('#addNodeFieldInput'),
      addNodeFieldType:      UIContext.get('#addNodeFieldType'),
      addLinkFieldBtn:       UIContext.get('#addLinkFieldButton'),
      addLinkFieldInput:     UIContext.get('#addLinkFieldInput'),
      addLinkFieldType:      UIContext.get('#addLinkFieldType'),
      highlightNeighborsBtn: UIContext.get('#btn-highlight-neighbors'),
      clearHighlightsBtn:    UIContext.get('#btn-clear-highlights'),
      highlightHighDegreeBtn:UIContext.get('#btn-high-degree'),
      colorClustersBtn:      UIContext.get('#btn-color-clusters'),
      nodeLabelSelect:       UIContext.get('#node-label'),
      linkLabelSelect:       UIContext.get('#link-label'),
      nodeSizeFieldSelect:   UIContext.get('#node-size-field'),
      defaultNodeSizeInput:  UIContext.get('#defaultNodeSizeInput'),
      defaultLinkWidthInput: UIContext.get('#defaultLinkWidthInput'),
      historySelect:         UIContext.get('#historySelect'),
      multilingualEnabled:   UIContext.get('#multilingual-enabled'),
      multilingualLangs:     UIContext.get('#multilingual-langs'),
      currentLanguage:       UIContext.get('#current-language'),
      multilingualConvert:   UIContext.get('#multilingual-convert')
      // …add other references if needed…
    };
    
    // 2) Initialize.
    this.formManager = new FormManager(graphState, renderer);
    this.initEventListeners();
    this.initHistoryPanel();
    this.initTabPanel();

    // 3) Immediately sync selects/inputs.
    refreshFieldSelects(this.graphState);
    // keeps standard selects
    this.populateFieldTypeSelectors();

    // 4) Bind all centralized window listeners.
    WindowEventManager.bindAll(this);

    // 5) Clean up window listeners on page unload.
    window.addEventListener('unload', () => WindowEventManager.unbindAll());
  }
  
  /**
   * Initializes base event listeners.
   */
  populateFieldTypeSelectors() {
    const options = FIELD_TYPES.filter(t => t.id !== 'object');
    const html = options.map(t => `<option value="${t.id}">${t.label}</option>`).join('');
    if (this.el.addNodeFieldType) {
      this.el.addNodeFieldType.innerHTML = html;
      if (!this.el.addNodeFieldType.value) this.el.addNodeFieldType.value = 'text';
    }
    if (this.el.addLinkFieldType) {
      this.el.addLinkFieldType.innerHTML = html;
      if (!this.el.addLinkFieldType.value) this.el.addLinkFieldType.value = 'text';
    }
  }

  initEventListeners() {
    // Undo/Redo
    this.el.undoBtn?.addEventListener('click', () => undo());
    this.el.redoBtn?.addEventListener('click', () => redo());
    this.el.updateBtn?.addEventListener('click', () => this.renderer.updateGraph());
    
    // Label reset
    this.el.changeLabelBtn?.addEventListener('click', () => this.initializeLabels());
    
    // Dynamic fields.
    this.el.addNodeFieldBtn?.addEventListener('click', () => {
      const name = this.el.addNodeFieldInput.value.trim();
      const type = this.el.addNodeFieldType?.value || 'text';
      if (name) this.formManager.addField(name, 'node', type);
    });
    this.el.addLinkFieldBtn?.addEventListener('click', () => {
      const name = this.el.addLinkFieldInput.value.trim();
      const type = this.el.addLinkFieldType?.value || 'text';
      if (name) this.formManager.addField(name, 'link', type);
    });
    
    // Advanced actions.
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

    // Global configuration.
    this.setupGlobalSettingsListeners();
  }
  
  /**
   * DRY setup for listeners on all global-parameter controls.
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
      { id:'defaultLinkWidthInput', event:'change', field:'defaultLinkWidth', parser: parseFloat },
      { id:'multilingual-enabled', event:'change', field:'multilingualEnabled', parser: v=> !!document.getElementById('multilingual-enabled')?.checked },
      { id:'multilingual-langs', event:'change', field:'multilingualLangs', parser: v=>v }
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
        // Update selects/inputs if needed.
        refreshFieldSelects(this.graphState);
      });
    });

    // Active language.
    const langSelect = document.getElementById('current-language');
    if (langSelect) {
      langSelect.addEventListener('change', () => {
        const val = langSelect.value;
        this.graphState.updateGlobalSetting('currentLanguage', val);
        // If label fields are suffix-based, switch to selected language
        if ((this.graphState.globalSettings.nodeLabelField || '').startsWith('name_')) {
          this.graphState.updateGlobalSetting('nodeLabelField', `name_${val}`);
        }
        if ((this.graphState.globalSettings.linkLabelField || '').startsWith('name_')) {
          this.graphState.updateGlobalSetting('linkLabelField', `name_${val}`);
        }
        refreshFieldSelects(this.graphState);
        this.renderer.updateGraph();
      });
    }

    // Explicit multilingual conversion (modal).
    this.el.multilingualConvert?.addEventListener('click', () => {
      this.openMultilingualConvertOverlay();
    });
    document.getElementById('multilingual-convert-cancel')?.addEventListener('click', () => {
      document.getElementById('multilingual-convert-overlay')?.classList.add('hidden');
    });
    document.getElementById('multilingual-convert-apply')?.addEventListener('click', () => {
      const mode = document.getElementById('multilingual-convert-mode')?.value || 'to-multi';
      const lang = document.getElementById('multilingual-convert-lang')?.value || '';
      const langs = document.getElementById('multilingual-convert-langs')?.value || this.graphState.globalSettings.multilingualLangs;
      this.graphState.updateGlobalSetting('multilingualLangs', langs);

      const fieldsToConvert = new Set([
        'name',
        'description',
        this.graphState.globalSettings.nodeLabelField,
        this.graphState.globalSettings.linkLabelField
      ]);

      if (mode === 'to-multi') {
        if (!lang) {
          alert("Veuillez choisir la langue source (ex: fr) pour la conversion.");
          return;
        }
        const keepBase = !!document.getElementById('multilingual-convert-keep')?.checked;
        const removeBase = !keepBase;
        this.graphState.convertFieldsToMultilingual(
          Array.from(fieldsToConvert).filter(Boolean),
          'node',
          lang
        );
        this.graphState.convertFieldsToMultilingual(
          Array.from(fieldsToConvert).filter(Boolean),
          'link',
          lang
        );
        if (removeBase) {
          Array.from(fieldsToConvert).filter(Boolean).forEach(field => {
            this.graphState.removeField(field, 'node');
            this.graphState.removeField(field, 'link');
          });
          alert("Conversion appliquée. Les champs d'origine ont été supprimés.");
        }
        // Update label fields to default language if needed.
        const firstLang = (langs || '').split(',')[0]?.trim();
        if (firstLang) {
          if (this.graphState.globalSettings.nodeLabelField === 'name') {
            this.graphState.updateGlobalSetting('nodeLabelField', `name_${firstLang}`);
          }
          if (this.graphState.globalSettings.linkLabelField === 'name') {
            this.graphState.updateGlobalSetting('linkLabelField', `name_${firstLang}`);
          }
        }
      } else {
        const keepMulti = !!document.getElementById('multilingual-convert-keep')?.checked;
        this.graphState.convertFieldsToUnilingual(
          Array.from(fieldsToConvert).filter(Boolean),
          'node',
          lang
        );
        this.graphState.convertFieldsToUnilingual(
          Array.from(fieldsToConvert).filter(Boolean),
          'link',
          lang
        );
        if (!keepMulti) {
          const langsList = (langs || '').split(',').map(s => s.trim()).filter(Boolean);
          Array.from(fieldsToConvert).filter(Boolean).forEach(base => {
            langsList.forEach(l => {
              this.graphState.removeField(`${base}_${l}`, 'node');
              this.graphState.removeField(`${base}_${l}`, 'link');
            });
          });
          alert("Conversion appliquée. Les champs multilingues ont été supprimés.");
        }
        // Revert label fields to base name if they were suffixed.
        if ((this.graphState.globalSettings.nodeLabelField || '').startsWith('name_')) {
          this.graphState.updateGlobalSetting('nodeLabelField', 'name');
        }
        if ((this.graphState.globalSettings.linkLabelField || '').startsWith('name_')) {
          this.graphState.updateGlobalSetting('linkLabelField', 'name');
        }
      }

      refreshFieldSelects(this.graphState);
      this.renderer.updateGraph();
      document.getElementById('multilingual-convert-overlay')?.classList.add('hidden');
    });

    // Show/hide conversion language input depending on mode.
    const modeSelect = document.getElementById('multilingual-convert-mode');
    if (modeSelect) {
      const updateModeUI = () => {
        const langInput = document.getElementById('multilingual-convert-lang');
        const langCol = langInput?.closest('.col-md-6');
        if (langCol) {
          langCol.style.display = modeSelect.value === 'to-multi' ? '' : 'none';
        }
      };
      modeSelect.addEventListener('change', updateModeUI);
      updateModeUI();
    }
  }
  
  /**
   * Handler for node label changes.
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
   * Handler for link label changes.
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
   * Handler for node size field changes.
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
   * Handler for default node size changes.
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
   * Handler for default link width changes.
   */
  handleDefaultLinkWidthChange() {
    const defaultLinkWidthInput = document.getElementById('defaultLinkWidthInput');
    if (defaultLinkWidthInput) {
      const newValue = parseFloat(defaultLinkWidthInput.value) || 2;
      this.graphState.updateGlobalSetting('defaultLinkWidth', newValue);
      
      // Update all existing links with the new value.
      this.graphState.links.forEach(link => {
        link.width = newValue;
      });
      
      this.renderer.updateGraph();
    }
  }
  
  /**
   * Initializes the history panel.
   */
  initHistoryPanel() {
    const historySelect = document.getElementById('historySelect');
    if (historySelect) {
      historySelect.addEventListener('dblclick', function() {
        const index = +this.value;
        jumpToHistory(index);
      });
    }
    
    // Update history when it changes.
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
   * Initializes the tab panel.
   */
  initTabPanel() {
    const bottomPanel = document.querySelector("#bottom-panel");
    const cardHeader = document.querySelector("#bottom-panel-header");
    const headerToggle = document.querySelector(".header-toggle");
    const arrow = document.querySelector(".arrow");
    
    if (cardHeader && bottomPanel && headerToggle && arrow) {
      // Toggle the panel.
      cardHeader.addEventListener("click", event => {
        if (event.target === cardHeader || event.target === headerToggle) {
          bottomPanel.classList.toggle("collapsed");
          arrow.classList.toggle("arrow-down");
          arrow.classList.toggle("arrow-up");
        }
      });
      
      // Open the panel when clicking a tab.
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
    
    // Configure curvature controls.
    this.setupRangeValueDisplays();
  }
  
  /**
   * Configures value display for range controls.
   */
  setupRangeValueDisplays() {
    function setupRangeValueDisplay(rangeId, valueId) {
      const range = document.getElementById(rangeId);
      const valueDisplay = document.getElementById(valueId);
      
      if (range && valueDisplay) {
        // Initialize with the current value.
        valueDisplay.textContent = range.value;
        
        // Update while dragging.
        range.addEventListener('input', () => {
          valueDisplay.textContent = range.value;
        });
      }
    }
    
    // Configure value displays for each slider.
    setupRangeValueDisplay('base-curvature', 'base-curvature-value');
    setupRangeValueDisplay('loop-curvature', 'loop-curvature-value');
    setupRangeValueDisplay('curvature-step', 'curvature-step-value');
    
    // Real-time update while dragging (input), not only on change.
    d3.select('#base-curvature').on('input', function() {
      document.getElementById('base-curvature-value').textContent = this.value;
    });
    
    d3.select('#loop-curvature').on('input', function() {
      document.getElementById('loop-curvature-value').textContent = this.value;
    });
    
    d3.select('#curvature-step').on('input', function() {
      document.getElementById('curvature-step-value').textContent = this.value;
    });

    // Allow other modules to open the conversion overlay.
    window.openMultilingualConvertOverlay = this.openMultilingualConvertOverlay.bind(this);
  }

  openMultilingualConvertOverlay() {
    const overlay = document.getElementById('multilingual-convert-overlay');
    if (!overlay) return;
    const langsInput = document.getElementById('multilingual-convert-langs');
    const langInput = document.getElementById('multilingual-convert-lang');
    if (langsInput) langsInput.value = this.graphState.globalSettings.multilingualLangs || 'fr,en';
    if (langInput) langInput.value = this.graphState.globalSettings.currentLanguage || 'fr';
    overlay.classList.remove('hidden');
  }

  /**
   * Exposes a global refresh for dropdown lists.
   */
  updateAllFieldSelects() {
    refreshFieldSelects(this.graphState);
  }
  
  /**
   * Updates the options of a selector.
   */
  updateSelectOptions(selectElem, optionsArr, selectedValue) {
    while (selectElem.firstChild) {
      selectElem.removeChild(selectElem.firstChild);
    }
    const emptyOption = document.createElement('option');
    emptyOption.value = '';
    emptyOption.textContent = '';
    selectElem.appendChild(emptyOption);
    optionsArr.forEach(opt => {
      const option = document.createElement('option');
      option.value = opt;
      option.textContent = opt;
      selectElem.appendChild(option);
    });
    selectElem.value = selectedValue;
  }
  
  /**
   * Initializes label field values.
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
 * Testable helper: updates global-settings UI from a given GraphState.
 */
export function syncGlobalSettingsUI(state) {
  refreshFieldSelects(state);
}
