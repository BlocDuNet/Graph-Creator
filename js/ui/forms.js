/**
 * Gestion des formulaires pour éditer les nœuds et les liens
 */
import { performAction } from '../state/undo_redo.js';
import {
  FIELD_TYPES,
  normalizeType,
  formatValueForInput,
  coerceValueToType,
  isValueValid,
  getTypeLabel
} from '../services/FieldTypeService.js';
import eventBus from '../services/EventBus.js';
import { graphConfig } from '../config/index.js';

export class FormManager {
  constructor(graphState, renderer) {
    this.graphState = graphState;
    this.renderer = renderer;
    
    // Sélectionner les formulaires
    this.nodeForm = document.getElementById('node-form');
    this.linkForm = document.getElementById('link-form');
    
    // Stockage des inputs
    this.nodeInputs = {};
    this.linkInputs = {};
    this.localStyleInputs = { node: {}, link: {} };
    this.ruleMatchContainers = { node: null, link: null };
    
    // Initialiser les formulaires
    this.refreshForms();
    
    // Configurer les observateurs de sélection
    this.setupSelectionObservers();

    // Rafraîchir l'affichage des règles actives
    eventBus.on('style-rules-updated', () => this.refreshRuleMatches());
    eventBus.on('pie-rules-updated', () => this.refreshRuleMatches());
  }
  
  /**
   * Configure les observateurs pour détecter les changements de sélection
   */
  setupSelectionObservers() {
    // Observer les changements de sélection dans graphState
    const originalSelectNode = this.graphState.selectNode;
    this.graphState.selectNode = (node) => {
      originalSelectNode.call(this.graphState, node);
      console.log("Node sélectionné via observer:", node);
      this.showNodeForm(node);
    };
    
    const originalSelectLink = this.graphState.selectLink;
    this.graphState.selectLink = (link) => {
      originalSelectLink.call(this.graphState, link);
      console.log("Link sélectionné via observer:", link);
      this.showLinkForm(link);
    };
    
    const originalClearSelection = this.graphState.clearSelection;
    this.graphState.clearSelection = () => {
      originalClearSelection.call(this.graphState);
      console.log("Sélection effacée via observer");
      this.hideAllForms();
    };
  }
  
  /**
   * Rafraîchit les formulaires avec les champs actuels
   */
  refreshForms() {
    this.createFormInputs(this.graphState.nodes, this.nodeForm, this.nodeInputs, 'node');
    this.createFormInputs(this.graphState.links, this.linkForm, this.linkInputs, 'link');
  }
  
  /**
   * Crée les champs de formulaire basés sur les données
   */
  createFormInputs(data, formElement, inputObject, target) {
    if (!formElement) return;
    
    // Vider le formulaire et les références précédentes
    while (formElement.firstChild) {
      formElement.removeChild(formElement.firstChild);
    }
    Object.keys(inputObject).forEach(key => delete inputObject[key]);

    // Récupérer les noms de champs
    const fieldNames = this.getFieldOptions(target);
    
    // Créer les champs
    fieldNames.forEach(fieldName =>
      this.createField(fieldName, formElement, inputObject, data, target)
    );

    this.appendLocalStyleSection(formElement, target);
    this.appendRuleMatchesSection(formElement, target);
  }
  
  /**
   * Récupère les options de champs disponibles
   */
  getFieldOptions(target) {
    return target === 'node'
      ? this.graphState.getNodeFields()
      : this.graphState.getLinkFields();
  }
  
  /**
   * Crée un champ de formulaire
   */
  createField(fieldName, formElement, inputObject, data, target) {
    const fieldDiv = document.createElement('div');

    // Creer le label
    const label = document.createElement('label');
    label.setAttribute('for', `${formElement.id}-${fieldName}`);
    label.textContent = `${fieldName}:`;
    fieldDiv.appendChild(label);

    const fieldType = normalizeType(this.graphState.getFieldType(target, fieldName));
    const isBoolean = fieldType === 'boolean';
    const isNumber = fieldType === 'number';
    const isNumberComma = fieldType === 'number_comma';
    const isDate = fieldType === 'date';
    const isConditional = fieldType === 'conditional';
    const isObject = fieldType === 'object';

    // Creer le controle de saisie
    const input = isBoolean ? document.createElement('select') : document.createElement('input');
    input.setAttribute('id', `${formElement.id}-${fieldName}`);
    input.setAttribute('name', fieldName);

    if (isBoolean) {
      input.innerHTML = [
        '<option value=""></option>',
        '<option value="true">true</option>',
        '<option value="false">false</option>'
      ].join('');
    } else {
      input.setAttribute('type', isNumber ? 'number' : (isDate ? 'date' : 'text'));
      if (isNumber) input.setAttribute('step', 'any');
      if (isNumberComma) input.setAttribute('inputmode', 'decimal');
    }

    if (isObject || isConditional) {
      input.disabled = true;
      input.title = isConditional ? 'Champ calcule (edition directe desactivee)' : 'Champ systeme non modifiable';
    }

    fieldDiv.appendChild(input);

    // Selecteur de type
    const typeSelect = document.createElement('select');
    typeSelect.className = 'field-type-select';
    typeSelect.innerHTML = FIELD_TYPES
      .map(t => `<option value="${t.id}">${t.label}</option>`)
      .join('');
    typeSelect.value = fieldType;

    const typeLocked = (target === 'link' && (fieldName === 'source' || fieldName === 'target'));
    if (typeLocked) {
      typeSelect.disabled = true;
      typeSelect.title = 'Champ systeme non modifiable';
    }
    fieldDiv.appendChild(typeSelect);

    const exprBtn = document.createElement('button');
    exprBtn.setAttribute('type', 'button');
    exprBtn.className = 'field-expr-btn';
    exprBtn.textContent = 'fx';
    exprBtn.title = 'Configurer expression';
    exprBtn.style.display = isConditional ? '' : 'none';
    exprBtn.addEventListener('click', () => {
      eventBus.emit('conditional-edit-requested', { target, field: fieldName });
    });
    fieldDiv.appendChild(exprBtn);

    const warning = document.createElement('span');
    warning.className = 'type-warning';
    fieldDiv.appendChild(warning);

    const updateWarning = () => {
      const { invalidCount } = this.graphState.validateField(target, fieldName, fieldType);
      warning.textContent = invalidCount > 0 ? `${invalidCount} non conformes` : '';
      typeSelect.classList.toggle('type-invalid', invalidCount > 0);
      typeSelect.title = invalidCount > 0 ? `Type attendu: ${getTypeLabel(fieldType)}` : '';
    };

    updateWarning();

    // Ajouter un ecouteur d'evenement pour les modifications
    const commitValue = () => {
      if (input.disabled) return;
      const rawValue = input.value;
      const result = coerceValueToType(rawValue, fieldType);
      if (!result.ok) {
        input.classList.add('value-invalid');
        input.title = `Type attendu: ${getTypeLabel(fieldType)}`;
        return;
      }

      const empty = v => v === null || v === undefined || v === '';

      if (this.graphState.selectedNode && inputObject === this.nodeInputs) {
        const oldValue = this.graphState.selectedNode[fieldName] ?? "";
        if (empty(result.value) && empty(oldValue)) return;
        if (result.value !== oldValue) {
          performAction({
            type: "update_node",
            data: {
              nodeId: this.graphState.selectedNode.id,
              field: fieldName,
              from: oldValue,
              to: result.value,
              label: `Rename node ${fieldName} (${oldValue} ? ${result.value})`
            }
          });
        }
      } else if (this.graphState.selectedLink && inputObject === this.linkInputs) {
        const oldValue = this.graphState.selectedLink[fieldName] ?? "";
        if (empty(result.value) && empty(oldValue)) return;
        if (result.value !== oldValue) {
          performAction({
            type: "update_link",
            data: {
              linkId: this.graphState.selectedLink.id,
              field: fieldName,
              from: oldValue,
              to: result.value,
              label: `Rename link ${fieldName} (${oldValue} ? ${result.value})`
            }
          });
        }
      }

      input.classList.remove('value-invalid');
      updateWarning();
      input.value = formatValueForInput(result.value, fieldType);
      this.renderer.updateGraph();
    };

    if (isBoolean) {
      input.addEventListener('change', commitValue);
    } else {
      input.addEventListener('blur', commitValue);
    }

    typeSelect.addEventListener('change', () => {
      const newType = typeSelect.value;
      const isConditional = newType === 'conditional';
      this.graphState.updateFieldType(target, fieldName, newType);
      this.refreshForms();
      if (this.graphState.selectedNode) this.showNodeForm(this.graphState.selectedNode);
      if (this.graphState.selectedLink) this.showLinkForm(this.graphState.selectedLink);
      this.renderer.updateGraph();
      if (isConditional) {
        eventBus.emit('conditional-edit-requested', { target, field: fieldName });
      }
    });

    inputObject[fieldName] = { input, typeSelect, warning };

    // Ajouter un bouton de suppression pour les champs non essentiels
    if (!["id", "x", "y", "source", "target"].includes(fieldName)) {
      const button = document.createElement('button');
      button.setAttribute('type', 'button');
      button.setAttribute('tabindex', '-1');
      button.textContent = 'x';

      button.addEventListener('click', (event) => {
        event.stopPropagation();
        this.showCustomConfirm(
          `Supprimer le champ "${fieldName}" pour tous les elements ?`,
          () => {
            const isNodeField = inputObject === this.nodeInputs;
            const target = isNodeField ? "node" : "link";

            performAction({
              type: "remove_field",
              data: { field: fieldName, target, label: `Remove field ${fieldName} from ${target}s` }
            });
            this.refreshForms();
            this.renderer.updateGraph();
          }
        );
      });

      fieldDiv.appendChild(button);
    }

    formElement.appendChild(fieldDiv);
  }

  /**
   * Affiche une confirmation personnalisée
   * @param {string} message
   * @param {Function} onConfirm
   */
  showCustomConfirm(message, onConfirm) {
    // Créer overlay
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    // Boîte de dialogue
    const box = document.createElement('div');
    box.className = 'confirm-modal';
    box.innerHTML = `
      <p>${message}</p>
      <button class="btn-yes">Oui</button>
      <button class="btn-no">Non</button>
    `;
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    // Handlers pour les boutons
    box.querySelector('.btn-yes').onclick = () => {
      onConfirm();
      cleanup();
    };
    box.querySelector('.btn-no').onclick = () => {
      cleanup();
    };

    // Écouteurs de touche pour valider sur Entrée
    const keyHandler = e => {
      if (e.key === 'Enter') {
        onConfirm();
        cleanup();
      }
    };
    document.addEventListener('keydown', keyHandler);

    // Fonction de nettoyage des handlers et suppression de l'overlay
    function cleanup() {
      document.body.removeChild(overlay);
      document.removeEventListener('keydown', keyHandler);
    }
  }
  
  /**
   * Affiche le formulaire d'édition de nœud
   */
  showNodeForm(node) {
    if (!this.nodeForm || !node) {
      console.warn("Impossible d'afficher le formulaire de nœud:", 
                   !this.nodeForm ? "formulaire manquant" : "nœud manquant");
      return;
    }
    
    console.log("Affichage du formulaire pour le nœud:", node.id);
    
    // Masquer tous les formulaires d'abord
    this.hideAllForms();
    
    // Mettre à jour les valeurs du formulaire avec les données du nœud
    this.updateForm(this.nodeInputs, node);
    this.updateLocalStyleForm('node', node);
    this.updateRuleMatches('node', node);
    
    // Rendre le formulaire visible
    this.nodeForm.classList.remove('hidden');
    this.nodeForm.style.display = 'flex'; // Forcer l'affichage flex
    
    // Déterminer le champ à focus
    const fieldToFocus = this.graphState.globalSettings.nodeLabelField;
    
    // IMPORTANT: Vérifier explicitement si le champ de label est une chaîne vide
    // Utiliser === "" pour vérifier une chaîne vide exacte (et non undefined ou null)
    if (fieldToFocus === "") {
      console.log("Champ de label explicitement vide, pas de changement d'onglet ni de focus");
      return; // Terminer la fonction ici, ne rien faire de plus
    }
    
    // DRY : bascule et focus
    this.activateValuesTab(this.nodeInputs, fieldToFocus);
  }
  
  /**
   * Affiche le formulaire d'édition de lien
   */
  showLinkForm(link) {
    if (!this.linkForm || !link) {
      console.warn("Impossible d'afficher le formulaire de lien:", 
                   !this.linkForm ? "formulaire manquant" : "lien manquant");
      return;
    }
    
    console.log("Affichage du formulaire pour le lien:", link.id);
    
    // Masquer tous les formulaires d'abord
    this.hideAllForms();
    
    // Mettre à jour les valeurs du formulaire avec les données du lien
    this.updateForm(this.linkInputs, link);
    this.updateLocalStyleForm('link', link);
    this.updateRuleMatches('link', link);
    
    // Rendre le formulaire visible
    this.linkForm.classList.remove('hidden');
    this.linkForm.style.display = 'flex'; // Forcer l'affichage flex
    
    // Déterminer le champ à focus
    const fieldToFocus = this.graphState.globalSettings.linkLabelField;
    
    // IMPORTANT: Vérifier explicitement si le champ de label est une chaîne vide
    // Utiliser === "" pour vérifier une chaîne vide exacte (et non undefined ou null)
    if (fieldToFocus === "") {
      console.log("Champ de label explicitement vide, pas de changement d'onglet ni de focus");
      return; // Terminer la fonction ici, ne rien faire de plus
    }
    
    // DRY : bascule et focus
    this.activateValuesTab(this.linkInputs, fieldToFocus);
  }
  
  /**
   * Met à jour les valeurs du formulaire avec les données de l'élément
   */
  updateForm(inputObject, dataItem) {
    if (!dataItem) return;
    const idField = this.graphState.globalSettings.nodeIdField;
    const target = inputObject === this.nodeInputs ? 'node' : 'link';

    Object.keys(inputObject).forEach(key => {
      const entry = inputObject[key];
      const control = entry?.input;
      if (!control) return;

      const fieldType = normalizeType(this.graphState.getFieldType(target, key));
      let value;
      if (fieldType === 'conditional') {
        value = this.graphState.resolveFieldValue(target, dataItem, key);
      } else if ((key === "source" || key === "target") && dataItem[key]) {
        value = dataItem[key][idField] ?? dataItem[key].id;
      } else {
        value = dataItem[key] != null ? dataItem[key] : "";
      }

      const displayValue = formatValueForInput(value, fieldType);
      control.value = displayValue;
      const valid = isValueValid(value, fieldType);
      control.classList.toggle('value-invalid', !valid);
      control.title = `Type attendu: ${getTypeLabel(fieldType)}`;

      if (entry.typeSelect) {
        entry.typeSelect.value = fieldType;
      }
      if (entry.warning) {
        const { invalidCount } = this.graphState.validateField(target, key, fieldType);
        entry.warning.textContent = invalidCount > 0 ? `${invalidCount} non conformes` : '';
        entry.typeSelect?.classList.toggle('type-invalid', invalidCount > 0);
        entry.typeSelect && (entry.typeSelect.title = invalidCount > 0 ? `Type attendu: ${getTypeLabel(fieldType)}` : '');
      }
    });
  }

  /**
   * Ajoute la section d'override local
   */
  appendLocalStyleSection(formElement, target) {
    const inputs = {};
    this.localStyleInputs[target] = inputs;

    const wrapper = document.createElement('div');
    wrapper.className = 'local-style-block';

    const title = document.createElement('div');
    title.className = 'section-title';
    title.textContent = 'Style local';
    wrapper.appendChild(title);

    const toggleRow = document.createElement('div');
    const toggleLabel = document.createElement('label');
    toggleLabel.className = 'small';
    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.className = 'mr-1';
    toggle.checked = true;
    toggleLabel.appendChild(toggle);
    toggleLabel.appendChild(document.createTextNode(' Activer override local'));
    toggleRow.appendChild(toggleLabel);
    wrapper.appendChild(toggleRow);
    inputs.__enabled = { input: toggle };
    toggle.addEventListener('change', () => this.commitLocalStyleEnabled(target, toggle.checked));

    const grid = document.createElement('div');
    grid.className = 'rule-grid';

    const addColor = (key, label, placeholder) => {
      const field = document.createElement('div');
      const lab = document.createElement('label');
      lab.className = 'small';
      lab.textContent = label;
      const wrap = document.createElement('div');
      wrap.className = 'color-input';

      const color = document.createElement('input');
      color.type = 'color';
      color.className = 'form-control form-control-sm color-picker';

      const text = document.createElement('input');
      text.type = 'text';
      text.className = 'form-control form-control-sm';
      text.placeholder = placeholder || '';

      wrap.appendChild(color);
      wrap.appendChild(text);
      field.appendChild(lab);
      field.appendChild(wrap);
      grid.appendChild(field);

      inputs[key] = { input: text, color };

      color.addEventListener('input', () => {
        text.value = color.value;
        this.commitLocalStyle(target, key, color.value);
      });
      text.addEventListener('change', () => {
        const hex = this.normalizeHexColor(text.value);
        if (hex) color.value = hex;
        this.commitLocalStyle(target, key, text.value);
      });
    };

    const addText = (key, label, placeholder) => {
      const field = document.createElement('div');
      const lab = document.createElement('label');
      lab.className = 'small';
      lab.textContent = label;
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'form-control form-control-sm';
      input.placeholder = placeholder || '';
      field.appendChild(lab);
      field.appendChild(input);
      grid.appendChild(field);
      inputs[key] = { input };
      input.addEventListener('change', () => this.commitLocalStyle(target, key, input.value));
    };

    const addNumber = (key, label, placeholder) => {
      const field = document.createElement('div');
      const lab = document.createElement('label');
      lab.className = 'small';
      lab.textContent = label;
      const input = document.createElement('input');
      input.type = 'number';
      input.step = 'any';
      input.className = 'form-control form-control-sm';
      input.placeholder = placeholder || '';
      field.appendChild(lab);
      field.appendChild(input);
      grid.appendChild(field);
      inputs[key] = { input };
      input.addEventListener('change', () => this.commitLocalStyle(target, key, input.value));
    };

    const addSelect = (key, label, options) => {
      const field = document.createElement('div');
      const lab = document.createElement('label');
      lab.className = 'small';
      lab.textContent = label;
      const select = document.createElement('select');
      select.className = 'form-control form-control-sm';
      select.innerHTML = [''].concat(options || []).map(o => `<option value="${o}">${o}</option>`).join('');
      field.appendChild(lab);
      field.appendChild(select);
      grid.appendChild(field);
      inputs[key] = { input: select };
      select.addEventListener('change', () => this.commitLocalStyle(target, key, select.value));
    };

    if (target === 'node') {
      addColor('fill', 'Couleur', '#ffcc00');
      addColor('stroke', 'Contour', '#333');
      addNumber('strokeWidth', 'Epaisseur', '1');
      addNumber('opacity', 'Opacite', '1');
      addNumber('size', 'Taille', '30');
      addSelect('shape', 'Forme', ['circle', 'rect']);
      addColor('labelColor', 'Couleur label', '#000');
    } else {
      addColor('linkColor', 'Couleur lien', '#000');
      addNumber('linkWidth', 'Largeur', '2');
      addNumber('linkOpacity', 'Opacite', '1');
      addText('linkDash', 'Dasharray', '5,3');
      addColor('labelColor', 'Couleur label', '#000');
    }

    wrapper.appendChild(grid);

    const clearRow = document.createElement('div');
    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'btn btn-sm btn-outline-secondary';
    clearBtn.textContent = 'Effacer overrides';
    clearBtn.addEventListener('click', () => this.clearLocalStyle(target));
    clearRow.appendChild(clearBtn);
    wrapper.appendChild(clearRow);

    formElement.appendChild(wrapper);
  }

  appendRuleMatchesSection(formElement, target) {
    const wrapper = document.createElement('div');
    wrapper.className = 'rule-match-block';

    const title = document.createElement('div');
    title.className = 'section-title';
    title.textContent = 'Regles actives';
    wrapper.appendChild(title);

    const list = document.createElement('div');
    list.className = 'rule-match-list';
    wrapper.appendChild(list);
    formElement.appendChild(wrapper);

    this.ruleMatchContainers[target] = list;

    list.addEventListener('click', event => {
      const btn = event.target.closest('button[data-rule-jump]');
      if (!btn) return;
      event.preventDefault();
      event.stopPropagation();
      this.jumpToRule(btn.dataset.ruleJump, btn.dataset.ruleType);
    });
  }

  updateRuleMatches(target, item) {
    const list = this.ruleMatchContainers[target];
    if (!list) return;
    if (!item) {
      list.innerHTML = '';
      return;
    }
    if (!this.renderer || typeof this.renderer.ruleMatches !== 'function') {
      list.innerHTML = '';
      return;
    }

    const styleRules = target === 'node'
      ? (graphConfig.styleRules?.nodes || [])
      : (graphConfig.styleRules?.links || []);
    const pieRules = target === 'node'
      ? (graphConfig.pieRules?.nodes || [])
      : [];

    const styleMatches = (Array.isArray(styleRules) ? styleRules : [])
      .filter(r => r && r.enabled !== false)
      .filter(r => this.renderer.ruleMatches(r, target, item))
      .slice()
      .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));

    const pieMatches = (Array.isArray(pieRules) ? pieRules : [])
      .filter(r => r && r.enabled !== false)
      .filter(r => this.renderer.ruleMatches(r, 'node', item))
      .slice()
      .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));

    const lines = [];
    const pushLine = (typeLabel, rule) => {
      const name = this.escapeHtml(rule?.name || '(sans nom)');
      const prio = rule?.priority ?? 0;
      const ruleId = rule?.id || '';
      lines.push(`
        <div class="rule-match-item">
          <span class="badge badge-light">${typeLabel}</span>
          <span class="rule-match-name">${name}</span>
          <span class="rule-match-priority">P${prio}</span>
          <button type="button" class="btn btn-sm btn-outline-secondary" data-rule-jump="${ruleId}" data-rule-type="${typeLabel === 'Pie' ? 'pie' : 'style'}" ${ruleId ? '' : 'disabled'}>Modifier</button>
        </div>
      `);
    };

    styleMatches.forEach(rule => pushLine('Style', rule));
    pieMatches.forEach(rule => pushLine('Pie', rule));

    if (!lines.length) {
      list.innerHTML = '<div class="small text-muted">Aucune regle active pour cet element.</div>';
    } else {
      list.innerHTML = lines.join('');
    }
  }

  refreshRuleMatches() {
    if (this.graphState.selectedNode) {
      this.updateRuleMatches('node', this.graphState.selectedNode);
    }
    if (this.graphState.selectedLink) {
      this.updateRuleMatches('link', this.graphState.selectedLink);
    }
  }

  jumpToRule(ruleId, type) {
    if (!ruleId) return;
    const containerId = type === 'pie' ? 'pie-rules-list' : 'style-rules-list';
    const container = document.getElementById(containerId);
    if (!container) return;
    const esc = (typeof CSS !== 'undefined' && CSS.escape) ? CSS.escape(ruleId) : String(ruleId).replace(/"/g, '\\"');
    const card = container.querySelector(`[data-rule-id="${esc}"]`);
    if (!card) return;
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.add('rule-card-highlight');
    setTimeout(() => card.classList.remove('rule-card-highlight'), 1200);
  }

  escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  updateLocalStyleForm(target, item) {
    const inputs = this.localStyleInputs[target] || {};
    const local = item?.__localStyle || item?.localStyle || {};
    const enabled = item?.__localStyleEnabled !== false;
    const enabledEntry = inputs.__enabled;
    if (enabledEntry?.input) enabledEntry.input.checked = enabled;
    Object.keys(inputs).forEach(key => {
      if (key === '__enabled') return;
      const entry = inputs[key];
      const raw = local && typeof local === 'object' ? local[key] : '';
      const value = raw != null ? String(raw) : '';
      if (entry.input) entry.input.value = value;
      if (entry.color) {
        const hex = this.normalizeHexColor(value);
        entry.color.value = hex || '#000000';
      }
      if (entry.input) entry.input.disabled = !enabled;
      if (entry.color) entry.color.disabled = !enabled;
    });
  }

  commitLocalStyleEnabled(target, enabled) {
    const item = target === 'node' ? this.graphState.selectedNode : this.graphState.selectedLink;
    if (!item) return;
    const next = !!enabled;
    const current = item.__localStyleEnabled !== false;
    if (next === current) return;
    const payload = {
      field: '__localStyleEnabled',
      from: current,
      to: next,
      label: `Toggle local style (${target})`
    };
    if (target === 'node') {
      payload.nodeId = item.id;
      performAction({ type: "update_node", data: payload });
    } else {
      payload.linkId = item.id;
      performAction({ type: "update_link", data: payload });
    }
    this.updateLocalStyleForm(target, item);
    this.renderer.updateGraph();
  }

  commitLocalStyle(target, key, value) {
    const item = target === 'node' ? this.graphState.selectedNode : this.graphState.selectedLink;
    if (!item) return;
    const current = item.__localStyle && typeof item.__localStyle === 'object'
      ? { ...item.__localStyle }
      : {};
    const next = { ...current };
    const cleaned = value == null ? '' : String(value).trim();
    if (cleaned === '') {
      delete next[key];
    } else {
      next[key] = value;
    }

    const same = JSON.stringify(current) === JSON.stringify(next);
    if (same) return;

    const payload = {
      field: '__localStyle',
      from: current,
      to: next,
      label: `Update local style (${target})`
    };
    if (target === 'node') {
      payload.nodeId = item.id;
      performAction({ type: "update_node", data: payload });
    } else {
      payload.linkId = item.id;
      performAction({ type: "update_link", data: payload });
    }
    this.renderer.updateGraph();
  }

  clearLocalStyle(target) {
    const item = target === 'node' ? this.graphState.selectedNode : this.graphState.selectedLink;
    if (!item) return;
    const current = item.__localStyle && typeof item.__localStyle === 'object'
      ? { ...item.__localStyle }
      : {};
    if (!Object.keys(current).length) return;
    const payload = {
      field: '__localStyle',
      from: current,
      to: {},
      label: `Clear local style (${target})`
    };
    if (target === 'node') {
      payload.nodeId = item.id;
      performAction({ type: "update_node", data: payload });
    } else {
      payload.linkId = item.id;
      performAction({ type: "update_link", data: payload });
    }
    this.updateLocalStyleForm(target, item);
    this.renderer.updateGraph();
  }

  normalizeHexColor(value) {
    if (!value) return null;
    const v = String(value).trim();
    const short = v.match(/^#([0-9a-f]{3})$/i);
    if (short) {
      const expanded = short[1].split('').map(ch => ch + ch).join('');
      return `#${expanded.toLowerCase()}`;
    }
    const long = v.match(/^#([0-9a-f]{6})$/i);
    if (long) return `#${long[1].toLowerCase()}`;
    const rgb = v.match(/^rgb\s*\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i);
    if (rgb) {
      const toHex = (n) => Math.max(0, Math.min(255, Number(n)))
        .toString(16)
        .padStart(2, '0');
      return `#${toHex(rgb[1])}${toHex(rgb[2])}${toHex(rgb[3])}`;
    }
    return null;
  }

  focusAndSelectField(inputElement) {
    if (!inputElement) return;

    console.log("Tentative de focus et selection sur:", inputElement.id);

    try {
      // S'assurer que l'input est visible
      inputElement.scrollIntoView({ block: 'center' });

      // Utiliser les methodes DOM de base
      inputElement.focus();
      if (typeof inputElement.select === 'function') inputElement.select();

      // Utiliser setTimeout pour une double assurance
      setTimeout(() => {
        // Double tentative
        inputElement.focus();
        if (typeof inputElement.select === 'function') inputElement.select();

        // Tenter egalement la methode setSelectionRange
        try {
          if (typeof inputElement.setSelectionRange === 'function') {
            inputElement.setSelectionRange(0, inputElement.value.length);
          }
        } catch (e) {
          // Ignorer les erreurs (peut ne pas etre supporte par tous les navigateurs)
        }

        console.log("Second focus/select applique");
      }, 50);
    } catch (error) {
      console.error("Erreur de focus/select:", error);
    }
  }

  /**
   * Cache tous les formulaires
   */
  hideAllForms() {
    if (this.nodeForm) {
      this.nodeForm.classList.add('hidden');
      this.nodeForm.style.display = 'none'; // Forcer à masquer
    }
    
    if (this.linkForm) {
      this.linkForm.classList.add('hidden');
      this.linkForm.style.display = 'none'; // Forcer à masquer
    }
    
    console.log("Tous les formulaires sont maintenant cachés");
  }
  
  /**
   * Ajoute un nouveau champ aux éléments
   */
  addField(fieldName, target, fieldType = 'text') {
    if (fieldName.trim() === '') return;
    const isNodeField = target === 'node';
    const inputObject = isNodeField ? this.nodeInputs : this.linkInputs;

    // Verifier si le champ existe deja
    if (Object.keys(inputObject).includes(fieldName)) return;

    // Dispatch action via undo/redo, GraphState.addField emettra 'action-applied'
    this.graphState.addFieldWithType(fieldName, target, fieldType);

    // Rafraichir formulaires et mise a jour du graphe
    this.refreshForms();
    this.renderer.updateGraph();
  }

  /**
   * Bascule vers l'onglet Valeurs et focus sur le champ donné
   */
  activateValuesTab(inputObject, fieldToFocus) {
    try {
      const tabValeurs = document.querySelector('a[href="#tab2"]');
      if (!tabValeurs) throw new Error("Onglet Valeurs non trouvé");
      tabValeurs.click();
      $(tabValeurs).tab('show');
      console.log("Onglet Valeurs activé");
      setTimeout(() => {
        if (fieldToFocus && inputObject[fieldToFocus]) {
          const entry = inputObject[fieldToFocus];
          const control = entry?.input || entry;
          this.focusAndSelectField(control);
        }
      }, 150);
    } catch (e) {
      console.error("Erreur lors de l'activation de l'onglet Valeurs:", e);
    }
  }
}

