import eventBus from '../services/EventBus.js';
import {
  parseExpression,
  serializeToFunctional,
  inferExpressionType,
  evaluateExpression
} from './ExpressionEngine.js';
import { normalizeType } from '../services/FieldTypeService.js';
import { getModel, registerSettingsControls, sendAiRequest } from '../ai/AIService.js';
import { getExpressionAssistantPrompt } from '../config/templates/expressions.js';
import { graphConfig } from '../config/index.js';

export class ConditionalFieldManager {
  constructor(graphState, renderer) {
    this.graphState = graphState;
    this.renderer = renderer;
    this.current = null;
    this.aiAbortController = null;
    this.isSyncing = false;
    this.canonicalDirty = false;
    this.draggedEl = null;
    this.dropTarget = null;
    this.dropTargetEl = null;
    this.conditionOnly = false;
    this.conditionRequestId = null;
    this.aiContextLabel = '';
    this.availableGroupsByTarget = { node: [], link: [] };
    this.visualFromSchema = false;
    this.bindElements();
    this.bindEvents();
    this.initAiControls();
  }

  bindElements() {
    this.el = {
      overlay: document.getElementById('conditional-field-overlay'),
      cancel: document.getElementById('conditional-field-cancel'),
      apply: document.getElementById('conditional-apply'),
      mode: document.getElementById('conditional-mode'),
      fieldName: document.getElementById('conditional-field-name'),
      visual: document.getElementById('conditional-visual'),
      expression: document.getElementById('conditional-expression'),
      exprText: document.getElementById('conditional-expression-text'),
      exprError: document.getElementById('conditional-expression-error'),
      exprCanonical: document.getElementById('conditional-expression-canonical'),
      resultType: document.getElementById('conditional-result-type'),
      visualKind: document.getElementById('conditional-visual-kind'),
      conditionBlock: document.getElementById('conditional-condition-block'),
      conditionRoot: document.getElementById('condition-group-root'),
      thenElseBlock: document.getElementById('conditional-then-else-block'),
      elseBlock: document.getElementById('conditional-else-block'),
      thenLabel: document.getElementById('then-label'),
      elseLabel: document.getElementById('else-label'),
      thenMode: document.getElementById('then-mode'),
      thenValueBlock: document.getElementById('then-value-block'),
      thenConcatBlock: document.getElementById('then-concat-block'),
      thenCalcBlock: document.getElementById('then-calc-block'),
      thenSource: document.getElementById('then-source'),
      thenField: document.getElementById('then-field'),
      thenValue: document.getElementById('then-value'),
      thenConcatA: document.getElementById('then-concat-field-a'),
      thenConcatSep: document.getElementById('then-concat-sep'),
      thenConcatB: document.getElementById('then-concat-field-b'),
      thenCalcLeftSource: document.getElementById('then-calc-left-source'),
      thenCalcLeftField: document.getElementById('then-calc-left-field'),
      thenCalcLeftValue: document.getElementById('then-calc-left-value'),
      thenCalcOp: document.getElementById('then-calc-op'),
      thenCalcRightSource: document.getElementById('then-calc-right-source'),
      thenCalcRightField: document.getElementById('then-calc-right-field'),
      thenCalcRightValue: document.getElementById('then-calc-right-value'),
      elseMode: document.getElementById('else-mode'),
      elseValueBlock: document.getElementById('else-value-block'),
      elseConcatBlock: document.getElementById('else-concat-block'),
      elseCalcBlock: document.getElementById('else-calc-block'),
      elseSource: document.getElementById('else-source'),
      elseField: document.getElementById('else-field'),
      elseValue: document.getElementById('else-value'),
      elseConcatA: document.getElementById('else-concat-field-a'),
      elseConcatSep: document.getElementById('else-concat-sep'),
      elseConcatB: document.getElementById('else-concat-field-b'),
      elseCalcLeftSource: document.getElementById('else-calc-left-source'),
      elseCalcLeftField: document.getElementById('else-calc-left-field'),
      elseCalcLeftValue: document.getElementById('else-calc-left-value'),
      elseCalcOp: document.getElementById('else-calc-op'),
      elseCalcRightSource: document.getElementById('else-calc-right-source'),
      elseCalcRightField: document.getElementById('else-calc-right-field'),
      elseCalcRightValue: document.getElementById('else-calc-right-value'),
      aiProvider: document.getElementById('conditional-ai-provider'),
      aiModel: document.getElementById('conditional-ai-model'),
      aiSuggestion: document.getElementById('conditional-ai-suggestion'),
      aiFill: document.getElementById('conditional-ai-fill'),
      aiRequest: document.getElementById('conditional-ai-request'),
      aiGenerate: document.getElementById('conditional-ai-generate'),
      aiStop: document.getElementById('conditional-ai-stop'),
      aiStatus: document.getElementById('conditional-ai-status'),
      validateBtn: document.getElementById('conditional-validate'),
      validateOutput: document.getElementById('conditional-validate-output'),
      visualIncompat: document.getElementById('conditional-visual-incompat'),
      visualIncompatText: document.getElementById('conditional-visual-incompat-text'),
      clearCanonical: document.getElementById('conditional-clear-canonical')
    };
    this.el.title = this.el.overlay?.querySelector('h6') || null;
    this.el.description = this.el.overlay?.querySelector('p') || null;
    this.el.resultTypeWrap = this.el.resultType?.closest('.col-md-6') || null;
  }

  initAiControls() {
    registerSettingsControls(this.el.aiProvider, this.el.aiModel);
  }

  bindEvents() {
    eventBus.on('conditional-edit-requested', e => {
      const { target, field } = e.detail || {};
      if (!target || !field) return;
      this.open(target, field);
    });

    this.el.cancel?.addEventListener('click', () => this.cancelConditionEditor());
    this.el.apply?.addEventListener('click', () => this.apply());
    this.el.mode?.addEventListener('change', () => {
      if ((this.el.mode?.value || '') === 'visual' && this.isVisualIncompatActive()) {
        this.el.mode.value = 'expression';
      }
      this.toggleMode();
    });
    this.el.visualKind?.addEventListener('change', () => this.toggleVisualKind());
    this.el.thenMode?.addEventListener('change', () => this.toggleThenElse());
    this.el.elseMode?.addEventListener('change', () => this.toggleThenElse());
    this.el.thenSource?.addEventListener('change', () => this.toggleSources());
    this.el.elseSource?.addEventListener('change', () => this.toggleSources());
    this.el.thenCalcLeftSource?.addEventListener('change', () => this.toggleSources());
    this.el.thenCalcRightSource?.addEventListener('change', () => this.toggleSources());
    this.el.elseCalcLeftSource?.addEventListener('change', () => this.toggleSources());
    this.el.elseCalcRightSource?.addEventListener('change', () => this.toggleSources());
    this.el.exprText?.addEventListener('input', () => this.updateCanonicalFromExpression());
    this.el.exprCanonical?.addEventListener('input', () => this.updateExpressionFromCanonical());
    this.el.visual?.addEventListener('input', () => this.updateCanonicalFromVisual());
    this.el.visual?.addEventListener('change', () => this.updateCanonicalFromVisual());
    this.el.aiGenerate?.addEventListener('click', () => this.requestAiExpression());
    this.el.aiStop?.addEventListener('click', () => this.stopAiRequest());
    this.el.aiFill?.addEventListener('click', () => {
      const suggestion = this.el.aiSuggestion?.value || '';
      if (suggestion && this.el.aiRequest) {
        this.el.aiRequest.value = suggestion;
      }
    });
    this.el.validateBtn?.addEventListener('click', () => this.validateExpression());
    this.el.clearCanonical?.addEventListener('click', () => this.clearCanonicalAndEnableVisual());

    if (this.el.conditionRoot) {
      this.el.conditionRoot.addEventListener('change', e => {
        const target = e.target;
        if (target && (target.classList.contains('cond-source') || target.classList.contains('cond-group-target'))) {
          const row = target.closest('.condition-row');
          if (row) this.toggleConditionRow(row);
        }
        this.updateCanonicalFromVisual();
      });
      this.el.conditionRoot.addEventListener('click', e => {
        const btn = e.target.closest('button[data-action]');
        if (!btn) return;
        e.preventDefault();
        e.stopPropagation();
        const action = btn.dataset.action;
        if (action === 'add-condition') {
          const group = btn.closest('.condition-group');
          if (group) this.addConditionRow(group);
        } else if (action === 'add-group') {
          const group = btn.closest('.condition-group');
          if (group) this.addGroup(group);
        } else if (action === 'remove-condition') {
          const row = btn.closest('.condition-row');
          row?.remove();
        } else if (action === 'remove-group') {
          const group = btn.closest('.condition-group');
          if (group && !group.dataset.root) group.remove();
        }
        this.updateCanonicalFromVisual();
      });
      this.el.conditionRoot.addEventListener('dragstart', e => this.onDragStart(e));
      this.el.conditionRoot.addEventListener('dragover', e => this.onDragOver(e));
      this.el.conditionRoot.addEventListener('dragleave', e => this.onDragLeave(e));
      this.el.conditionRoot.addEventListener('drop', e => this.onDrop(e));
      this.el.conditionRoot.addEventListener('dragend', e => this.onDragEnd(e));
    }

    eventBus.on('condition-editor-requested', e => {
      const { requestId, target, expr, title } = e.detail || {};
      if (!requestId || !target) return;
      this.openConditionEditor({ requestId, target, expr: expr || '', title: title || '' });
    });
  }

  open(target, field) {
    this.setConditionOnlyMode(false);
    this.aiContextLabel = 'Champ personnalise';
    this.current = { target, field };
    this.canonicalDirty = false;
    if (!this.el.overlay) return;
    const fields = this.graphState.getFieldsByType(target).filter(f => f !== field);
    this.availableFields = fields;
    this.availableGroupsByTarget = {
      node: this.getAvailableGroups('node'),
      link: this.getAvailableGroups('link')
    };
    this.availableGroups = this.getAvailableGroups(target);
    this.fillSelect(this.el.thenField, fields);
    this.fillSelect(this.el.elseField, fields);
    this.fillSelect(this.el.thenConcatA, fields);
    this.fillSelect(this.el.thenConcatB, fields);
    this.fillSelect(this.el.elseConcatA, fields);
    this.fillSelect(this.el.elseConcatB, fields);
    this.fillSelect(this.el.thenCalcLeftField, fields);
    this.fillSelect(this.el.thenCalcRightField, fields);
    this.fillSelect(this.el.elseCalcLeftField, fields);
    this.fillSelect(this.el.elseCalcRightField, fields);

    const entry = this.graphState.getFieldSchema(target, field) || {};
    this.visualFromSchema = !!entry.visual;
    this.el.fieldName.textContent = `${target}.${field}`;
    this.el.resultType.value = entry.resultType || 'auto';
    let exprAst = null;
    if (entry.expr) {
      this.el.exprText.value = entry.expr;
      exprAst = this.updateCanonicalFromExpression();
    } else {
      this.el.exprText.value = '';
      this.el.exprCanonical.value = '';
      this.el.exprError.textContent = '';
    }
    this.setAiStatus('');
    if (this.el.validateOutput) this.el.validateOutput.textContent = '';

    const detectedKind = this.detectVisualKind(entry);
    if (entry.visual) {
      this.applyVisualConfig(entry.visual);
    } else {
      this.setDefaultVisual();
    }
    if (!entry.visual?.visualKind && detectedKind && this.el.visualKind) {
      this.el.visualKind.value = detectedKind;
    }
    if (entry.expr && !entry.visual) {
      this.showVisualIncompat(
        "La formule actuelle n'a pas de configuration visuelle retrocompatible. Efface la canonique pour reconstruire le builder."
      );
      if (this.el.mode) this.el.mode.value = 'expression';
    } else {
      this.hideVisualIncompat();
    }
    if (entry.visual && exprAst) {
      this.hideVisualIncompat();
    }

    this.toggleMode();
    this.toggleVisualKind();
    this.toggleThenElse();
    this.toggleSources();
    this.updateCanonicalFromVisual();
    this.show();
  }

  show() {
    this.el.overlay?.classList.remove('hidden');
  }

  hide() {
    this.el.overlay?.classList.add('hidden');
    this.setConditionOnlyMode(false);
    this.aiContextLabel = '';
    this.conditionRequestId = null;
    this.hideVisualIncompat();
  }

  cancelConditionEditor() {
    if (this.conditionOnly && this.conditionRequestId) {
      eventBus.emit('condition-editor-cancelled', { requestId: this.conditionRequestId });
    }
    this.hide();
  }

  setConditionOnlyMode(enabled) {
    this.conditionOnly = enabled;
    if (this.el.thenElseBlock) this.el.thenElseBlock.classList.toggle('hidden', enabled);
    if (this.el.elseBlock) this.el.elseBlock.classList.toggle('hidden', enabled);
    if (this.el.resultTypeWrap) this.el.resultTypeWrap.classList.toggle('hidden', enabled);
    if (this.el.visualKind) {
      this.el.visualKind.disabled = enabled;
      if (enabled) {
        this.el.visualKind.value = 'condition';
      }
    }
    if (enabled) {
      if (this.el.title) this.el.title.textContent = 'Condition (regle)';
      if (this.el.description) this.el.description.textContent = "Definissez une condition pour filtrer les elements.";
    } else {
      if (this.el.title) this.el.title.textContent = 'Champ personnalise';
      if (this.el.description) {
        this.el.description.textContent = 'Creez une expression simple ou avancee. Le mode visuel couvre les cas courants.';
      }
    }
  }

  openConditionEditor({ requestId, target, expr, title }) {
    this.setConditionOnlyMode(true);
    this.aiContextLabel = 'Regle';
    this.conditionRequestId = requestId;
    this.visualFromSchema = false;
    this.current = { target, field: '__condition__' };
    this.canonicalDirty = false;
    if (!this.el.overlay) return;

    const fields = this.graphState.getFieldsByType(target);
    this.availableFields = fields;
    this.availableGroupsByTarget = {
      node: this.getAvailableGroups('node'),
      link: this.getAvailableGroups('link')
    };
    this.availableGroups = this.getAvailableGroups(target);
    this.fillSelect(this.el.thenField, fields);
    this.fillSelect(this.el.elseField, fields);
    this.fillSelect(this.el.thenConcatA, fields);
    this.fillSelect(this.el.thenConcatB, fields);
    this.fillSelect(this.el.elseConcatA, fields);
    this.fillSelect(this.el.elseConcatB, fields);
    this.fillSelect(this.el.thenCalcLeftField, fields);
    this.fillSelect(this.el.thenCalcRightField, fields);
    this.fillSelect(this.el.elseCalcLeftField, fields);
    this.fillSelect(this.el.elseCalcRightField, fields);

    if (this.el.fieldName) {
      this.el.fieldName.textContent = title ? `${title} (${target})` : `Regle (${target})`;
    }

    if (this.el.mode) this.el.mode.value = 'visual';
    if (this.el.exprText) this.el.exprText.value = expr || '';
    if (this.el.exprCanonical) this.el.exprCanonical.value = '';
    if (this.el.exprError) this.el.exprError.textContent = '';
    if (this.el.resultType) this.el.resultType.value = 'boolean';
    this.setAiStatus('');
    if (this.el.validateOutput) this.el.validateOutput.textContent = '';

    if (expr) {
      const ast = this.updateCanonicalFromExpression();
      const group = this.astToConditionGroup(ast);
      if (group) {
        this.renderConditionGroup({ conditionGroup: group });
        if (this.el.mode) this.el.mode.value = 'visual';
        this.hideVisualIncompat();
      } else {
        if (this.el.mode) this.el.mode.value = 'expression';
        this.showVisualIncompat(
          "Cette formule de condition n'est pas convertible en builder visuel. Efface la canonique pour reconstruire la condition."
        );
      }
    } else {
      this.renderConditionGroup({});
      this.hideVisualIncompat();
    }

    this.toggleMode();
    this.toggleVisualKind();
    this.toggleThenElse();
    this.toggleSources();
    this.show();
  }

  detectVisualKind(entry) {
    let ast = entry?.ast || null;
    if (!ast && entry?.expr) {
      try {
        ast = parseExpression(entry.expr);
      } catch (e) {
        ast = null;
      }
    }
    if (ast && ast.type === 'call' && ast.name === 'if') return 'condition';
    if (ast) return 'expression';
    return null;
  }

  toggleMode() {
    const mode = this.el.mode?.value || 'visual';
    if (this.el.visual) this.el.visual.classList.toggle('hidden', mode !== 'visual');
    if (this.el.expression) this.el.expression.classList.toggle('hidden', mode !== 'expression');
  }

  isVisualIncompatActive() {
    return !!(this.el.visualIncompat && !this.el.visualIncompat.classList.contains('hidden'));
  }

  showVisualIncompat(message) {
    if (this.el.visualIncompatText) {
      this.el.visualIncompatText.textContent = String(message || '').trim()
        || "La formule canonique n'est pas compatible avec le builder visuel.";
    }
    this.el.visualIncompat?.classList.remove('hidden');
  }

  hideVisualIncompat() {
    this.el.visualIncompat?.classList.add('hidden');
    if (this.el.visualIncompatText) this.el.visualIncompatText.textContent = '';
  }

  clearCanonicalAndEnableVisual() {
    if (this.el.exprCanonical) this.el.exprCanonical.value = '';
    if (this.el.exprText) this.el.exprText.value = '';
    if (this.el.exprError) this.el.exprError.textContent = '';
    this.canonicalDirty = false;
    this.visualFromSchema = false;
    this.hideVisualIncompat();
    this.setDefaultVisual();
    if (this.el.mode) this.el.mode.value = 'visual';
    this.toggleMode();
    this.toggleVisualKind();
    this.toggleThenElse();
    this.toggleSources();
    this.updateCanonicalFromVisual();
  }

  toggleVisualKind() {
    const kind = this.el.visualKind?.value || 'expression';
    const isCondition = kind === 'condition';
    this.el.conditionBlock?.classList.toggle('hidden', !isCondition);
    this.el.elseBlock?.classList.toggle('hidden', !isCondition);
    if (this.el.thenLabel) this.el.thenLabel.textContent = isCondition ? 'Alors' : 'Expression';
    if (this.el.elseLabel && isCondition) this.el.elseLabel.textContent = 'Sinon';
    if (this.conditionOnly && this.el.elseBlock) {
      this.el.elseBlock.classList.add('hidden');
    }
  }

  toggleThenElse() {
    const thenMode = this.el.thenMode?.value || 'value';
    const elseMode = this.el.elseMode?.value || 'value';
    this.el.thenValueBlock?.classList.toggle('hidden', thenMode !== 'value');
    this.el.thenConcatBlock?.classList.toggle('hidden', thenMode !== 'concat');
    this.el.thenCalcBlock?.classList.toggle('hidden', thenMode !== 'calc');
    this.el.elseValueBlock?.classList.toggle('hidden', elseMode !== 'value');
    this.el.elseConcatBlock?.classList.toggle('hidden', elseMode !== 'concat');
    this.el.elseCalcBlock?.classList.toggle('hidden', elseMode !== 'calc');
    this.toggleSources();
  }

  toggleSources() {
    this.toggleSourceBlock(this.el.thenSource, this.el.thenField, this.el.thenValue);
    this.toggleSourceBlock(this.el.elseSource, this.el.elseField, this.el.elseValue);
    this.toggleSourceBlock(this.el.thenCalcLeftSource, this.el.thenCalcLeftField, this.el.thenCalcLeftValue);
    this.toggleSourceBlock(this.el.thenCalcRightSource, this.el.thenCalcRightField, this.el.thenCalcRightValue);
    this.toggleSourceBlock(this.el.elseCalcLeftSource, this.el.elseCalcLeftField, this.el.elseCalcLeftValue);
    this.toggleSourceBlock(this.el.elseCalcRightSource, this.el.elseCalcRightField, this.el.elseCalcRightValue);
  }

  toggleSourceBlock(sourceSelect, fieldSelect, valueInput) {
    if (!sourceSelect) return;
    const isField = sourceSelect.value === 'field';
    if (fieldSelect) fieldSelect.style.display = isField ? '' : 'none';
    if (valueInput) valueInput.style.display = isField ? 'none' : '';
  }

  fillSelect(select, options) {
    if (!select) return;
    select.innerHTML = [''].concat(options || []).map(o => `<option value="${o}">${o}</option>`).join('');
  }

  renderConditionGroup(visualConfig) {
    if (!this.el.conditionRoot) return;
    this.el.conditionRoot.innerHTML = '';
    const groupConfig = this.getConditionGroupConfig(visualConfig);
    const group = this.createConditionGroup(groupConfig, true);
    this.el.conditionRoot.appendChild(group);
  }

  getConditionGroupConfig(visualConfig = {}) {
    if (visualConfig.conditionGroup) return visualConfig.conditionGroup;
    if (visualConfig.condLeftSource || visualConfig.condRightSource) {
      const cond1 = {
        type: 'condition',
        left: {
          source: visualConfig.condLeftSource || 'field',
          field: visualConfig.condLeftField || '',
          value: visualConfig.condLeftValue || '',
          group: visualConfig.condLeftGroup || '',
          groupTarget: visualConfig.condLeftGroupTarget || 'same'
        },
        op: visualConfig.condOperator || 'eq',
        right: {
          source: visualConfig.condRightSource || 'field',
          field: visualConfig.condRightField || '',
          value: visualConfig.condRightValue || '',
          group: visualConfig.condRightGroup || '',
          groupTarget: visualConfig.condRightGroupTarget || 'same'
        }
      };
      const items = [cond1];
      if (visualConfig.condExtraEnabled) {
        items.push({
          type: 'condition',
          left: {
            source: visualConfig.cond2LeftSource || 'field',
            field: visualConfig.cond2LeftField || '',
            value: visualConfig.cond2LeftValue || '',
            group: visualConfig.cond2LeftGroup || '',
            groupTarget: visualConfig.cond2LeftGroupTarget || 'same'
          },
          op: visualConfig.cond2Operator || 'eq',
          right: {
            source: visualConfig.cond2RightSource || 'field',
            field: visualConfig.cond2RightField || '',
            value: visualConfig.cond2RightValue || '',
            group: visualConfig.cond2RightGroup || '',
            groupTarget: visualConfig.cond2RightGroupTarget || 'same'
          }
        });
      }
      return { type: 'group', join: visualConfig.condJoin || 'and', items };
    }
    return {
      type: 'group',
      join: 'and',
      items: [
        {
          type: 'condition',
          left: { source: 'field', field: '', value: '', group: '', groupTarget: 'same' },
          op: 'eq',
          right: { source: 'value', field: '', value: '', group: '', groupTarget: 'same' }
        }
      ]
    };
  }

  createConditionGroup(config = {}, isRoot = false) {
    const group = document.createElement('div');
    group.className = 'condition-group';
    group.dataset.type = 'group';
    if (isRoot) group.dataset.root = 'true';
    if (!isRoot) group.draggable = true;

    const header = document.createElement('div');
    header.className = 'condition-group-header';

    const joinLabel = document.createElement('span');
    joinLabel.className = 'small';
    joinLabel.textContent = 'Operateur';

    const joinSelect = document.createElement('select');
    joinSelect.className = 'form-control form-control-sm group-join';
    joinSelect.innerHTML = `
      <option value="and">ET</option>
      <option value="or">OU</option>
    `;
    joinSelect.value = config.join || 'and';

    const addCond = document.createElement('button');
    addCond.type = 'button';
    addCond.className = 'btn btn-sm btn-outline-secondary';
    addCond.dataset.action = 'add-condition';
    addCond.textContent = '+ Condition';

    const addGroup = document.createElement('button');
    addGroup.type = 'button';
    addGroup.className = 'btn btn-sm btn-outline-secondary';
    addGroup.dataset.action = 'add-group';
    addGroup.textContent = '+ Groupe';

    header.appendChild(joinLabel);
    header.appendChild(joinSelect);
    header.appendChild(addCond);
    header.appendChild(addGroup);

    if (!isRoot) {
      const removeGroup = document.createElement('button');
      removeGroup.type = 'button';
      removeGroup.className = 'btn btn-sm btn-outline-danger';
      removeGroup.dataset.action = 'remove-group';
      removeGroup.textContent = 'x';
      header.appendChild(removeGroup);
    }

    const body = document.createElement('div');
    body.className = 'condition-group-body';

    const items = Array.isArray(config.items) && config.items.length
      ? config.items
      : [
          {
            type: 'condition',
            left: { source: 'field', field: '', value: '', group: '', groupTarget: 'same' },
            op: 'eq',
            right: { source: 'value', field: '', value: '', group: '', groupTarget: 'same' }
          }
        ];

    items.forEach(item => {
      if (item && item.type === 'group') {
        body.appendChild(this.createConditionGroup(item, false));
      } else {
        body.appendChild(this.createConditionRow(item));
      }
    });

    group.appendChild(header);
    group.appendChild(body);
    return group;
  }

  createConditionRow(config = {}) {
    const row = document.createElement('div');
    row.className = 'condition-row';
    row.dataset.type = 'condition';
    row.draggable = true;

    const leftSource = document.createElement('select');
    leftSource.className = 'form-control form-control-sm cond-source';
    leftSource.dataset.role = 'left-source';
    leftSource.innerHTML = `
      <option value="field">Champ</option>
      <option value="value">Valeur</option>
      <option value="group">Groupe</option>
      <option value="group_count">Taille groupe</option>
    `;
    if (this.current?.target === 'link') {
      leftSource.innerHTML += `
      <option value="source_group">Noeud source dans groupe</option>
      <option value="target_group">Noeud cible dans groupe</option>
    `;
    }

    const leftField = document.createElement('select');
    leftField.className = 'form-control form-control-sm cond-field';
    leftField.dataset.role = 'left-field';
    leftField.innerHTML = [''].concat(this.availableFields || []).map(f => `<option value="${f}">${f}</option>`).join('');

    const leftValue = document.createElement('input');
    leftValue.className = 'form-control form-control-sm cond-value';
    leftValue.dataset.role = 'left-value';
    leftValue.placeholder = 'Valeur';

    const leftGroup = document.createElement('select');
    leftGroup.className = 'form-control form-control-sm cond-group';
    leftGroup.dataset.role = 'left-group';
    leftGroup.innerHTML = this.buildGroupOptionsHtml();

    const leftGroupTarget = document.createElement('select');
    leftGroupTarget.className = 'form-control form-control-sm cond-group-target';
    leftGroupTarget.dataset.role = 'left-group-target';
    leftGroupTarget.innerHTML = `
      <option value="same">Meme type</option>
      <option value="node">Noeuds</option>
      <option value="link">Liens</option>
    `;

    const operator = document.createElement('select');
    operator.className = 'form-control form-control-sm cond-operator';
    operator.dataset.role = 'operator';
    operator.innerHTML = `
      <option value="gt">&gt;</option>
      <option value="gte">&gt;=</option>
      <option value="lt">&lt;</option>
      <option value="lte">&lt;=</option>
      <option value="eq">==</option>
      <option value="neq">!=</option>
      <option value="eqCi">== (ignore casse)</option>
      <option value="neqCi">!= (ignore casse)</option>
      <option value="contains">contient</option>
      <option value="notContains">ne contient pas</option>
      <option value="containsCi">contient (ignore casse)</option>
      <option value="notContainsCi">ne contient pas (ignore casse)</option>
      <option value="startsWith">commence</option>
      <option value="startsWithCi">commence (ignore casse)</option>
      <option value="endsWith">termine</option>
      <option value="endsWithCi">termine (ignore casse)</option>
      <option value="regex">regex</option>
      <option value="regexCi">regex (ignore casse)</option>
    `;

    const rightSource = document.createElement('select');
    rightSource.className = 'form-control form-control-sm cond-source';
    rightSource.dataset.role = 'right-source';
    rightSource.innerHTML = `
      <option value="field">Champ</option>
      <option value="value">Valeur</option>
      <option value="group">Groupe</option>
      <option value="group_count">Taille groupe</option>
    `;
    if (this.current?.target === 'link') {
      rightSource.innerHTML += `
      <option value="source_group">Noeud source dans groupe</option>
      <option value="target_group">Noeud cible dans groupe</option>
    `;
    }

    const rightField = document.createElement('select');
    rightField.className = 'form-control form-control-sm cond-field';
    rightField.dataset.role = 'right-field';
    rightField.innerHTML = [''].concat(this.availableFields || []).map(f => `<option value="${f}">${f}</option>`).join('');

    const rightValue = document.createElement('input');
    rightValue.className = 'form-control form-control-sm cond-value';
    rightValue.dataset.role = 'right-value';
    rightValue.placeholder = 'Valeur';

    const rightGroup = document.createElement('select');
    rightGroup.className = 'form-control form-control-sm cond-group';
    rightGroup.dataset.role = 'right-group';
    rightGroup.innerHTML = this.buildGroupOptionsHtml();

    const rightGroupTarget = document.createElement('select');
    rightGroupTarget.className = 'form-control form-control-sm cond-group-target';
    rightGroupTarget.dataset.role = 'right-group-target';
    rightGroupTarget.innerHTML = `
      <option value="same">Meme type</option>
      <option value="node">Noeuds</option>
      <option value="link">Liens</option>
    `;

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn btn-sm btn-outline-danger cond-remove';
    removeBtn.dataset.action = 'remove-condition';
    removeBtn.textContent = 'x';

    row.appendChild(leftSource);
    row.appendChild(leftField);
    row.appendChild(leftValue);
    row.appendChild(leftGroup);
    row.appendChild(leftGroupTarget);
    row.appendChild(operator);
    row.appendChild(rightSource);
    row.appendChild(rightField);
    row.appendChild(rightValue);
    row.appendChild(rightGroup);
    row.appendChild(rightGroupTarget);
    row.appendChild(removeBtn);

    if (config.left) {
      leftSource.value = config.left.source || 'field';
      leftField.value = config.left.field || '';
      leftValue.value = config.left.value || '';
      const groupValue = config.left.group || '';
      this.ensureSelectHasOption(leftGroup, groupValue);
      leftGroup.value = groupValue;
      leftGroupTarget.value = config.left.groupTarget || 'same';
    }
    if (config.right) {
      rightSource.value = config.right.source || 'field';
      rightField.value = config.right.field || '';
      rightValue.value = config.right.value || '';
      const groupValue = config.right.group || '';
      this.ensureSelectHasOption(rightGroup, groupValue);
      rightGroup.value = groupValue;
      rightGroupTarget.value = config.right.groupTarget || 'same';
    }
    operator.value = config.op || 'eq';

    this.toggleConditionRow(row);
    return row;
  }

  addConditionRow(groupEl, config = null) {
    const body = groupEl?.querySelector('.condition-group-body');
    if (!body) return;
    body.appendChild(this.createConditionRow(config));
  }

  addGroup(groupEl, config = null) {
    const body = groupEl?.querySelector('.condition-group-body');
    if (!body) return;
    body.appendChild(this.createConditionGroup(config || { join: 'and', items: [] }, false));
  }

  toggleConditionRow(row) {
    if (!row) return;
    const leftSource = row.querySelector('[data-role="left-source"]');
    const leftField = row.querySelector('[data-role="left-field"]');
    const leftValue = row.querySelector('[data-role="left-value"]');
    const leftGroup = row.querySelector('[data-role="left-group"]');
    const leftGroupTarget = row.querySelector('[data-role="left-group-target"]');
    const operator = row.querySelector('[data-role="operator"]');
    const rightSource = row.querySelector('[data-role="right-source"]');
    const rightField = row.querySelector('[data-role="right-field"]');
    const rightValue = row.querySelector('[data-role="right-value"]');
    const rightGroup = row.querySelector('[data-role="right-group"]');
    const rightGroupTarget = row.querySelector('[data-role="right-group-target"]');
    const isMembershipGroupMode = mode => ['group', 'source_group', 'target_group'].includes(mode);
    const isGroupCountMode = mode => mode === 'group_count';
    const leftMode = leftSource?.value || 'field';
    this.syncConditionGroupOptions(row, 'left', leftMode);
    if (leftField) leftField.style.display = leftMode === 'field' ? '' : 'none';
    if (leftValue) leftValue.style.display = leftMode === 'value' ? '' : 'none';
    if (leftGroup) leftGroup.style.display = (isMembershipGroupMode(leftMode) || isGroupCountMode(leftMode)) ? '' : 'none';
    if (leftGroupTarget) leftGroupTarget.style.display = isGroupCountMode(leftMode) ? '' : 'none';

    const rightMode = rightSource?.value || 'field';
    this.syncConditionGroupOptions(row, 'right', rightMode);
    if (rightField) rightField.style.display = rightMode === 'field' ? '' : 'none';
    if (rightValue) rightValue.style.display = rightMode === 'value' ? '' : 'none';
    if (rightGroup) rightGroup.style.display = (isMembershipGroupMode(rightMode) || isGroupCountMode(rightMode)) ? '' : 'none';
    if (rightGroupTarget) rightGroupTarget.style.display = isGroupCountMode(rightMode) ? '' : 'none';

    const leftIsGroup = isMembershipGroupMode(leftMode);
    const rightIsGroup = isMembershipGroupMode(rightMode);
    const unaryGroup = (leftIsGroup && !rightIsGroup) || (!leftIsGroup && rightIsGroup);

    if (unaryGroup) {
      if (operator && !['eq', 'neq', 'eqCi', 'neqCi'].includes(operator.value)) operator.value = 'eq';
      if (leftIsGroup) {
        this.clearConditionOperand(row, 'right');
        if (rightSource) rightSource.style.display = 'none';
        if (rightField) rightField.style.display = 'none';
        if (rightValue) rightValue.style.display = 'none';
        if (rightGroup) rightGroup.style.display = 'none';
        if (rightGroupTarget) rightGroupTarget.style.display = 'none';
      } else {
        this.clearConditionOperand(row, 'left');
        if (leftSource) leftSource.style.display = 'none';
        if (leftField) leftField.style.display = 'none';
        if (leftValue) leftValue.style.display = 'none';
        if (leftGroup) leftGroup.style.display = 'none';
        if (leftGroupTarget) leftGroupTarget.style.display = 'none';
      }
    } else {
      if (leftSource) leftSource.style.display = '';
      if (rightSource) rightSource.style.display = '';
    }
  }

  syncConditionGroupOptions(row, side, sourceMode = null) {
    if (!row || !side) return;
    const groupSelect = row.querySelector(`[data-role="${side}-group"]`);
    if (!groupSelect) return;
    const sourceSelect = row.querySelector(`[data-role="${side}-source"]`);
    const groupTargetSelect = row.querySelector(`[data-role="${side}-group-target"]`);
    const source = sourceMode || sourceSelect?.value || 'field';
    const groupTarget = groupTargetSelect?.value || 'same';
    const options = this.getGroupOptionsForSource(source, groupTarget);
    const current = String(groupSelect.value || '').trim();
    groupSelect.innerHTML = this.buildGroupOptionsHtml(options);
    this.ensureSelectHasOption(groupSelect, current);
    if (current) groupSelect.value = current;
  }

  clearConditionOperand(row, side) {
    if (!row || !side) return;
    const sourceSelect = row.querySelector(`[data-role="${side}-source"]`);
    const fieldSelect = row.querySelector(`[data-role="${side}-field"]`);
    const valueInput = row.querySelector(`[data-role="${side}-value"]`);
    const groupSelect = row.querySelector(`[data-role="${side}-group"]`);
    const groupTargetSelect = row.querySelector(`[data-role="${side}-group-target"]`);
    if (sourceSelect) sourceSelect.value = 'value';
    if (fieldSelect) fieldSelect.value = '';
    if (valueInput) valueInput.value = '';
    if (groupSelect) groupSelect.value = '';
    if (groupTargetSelect) groupTargetSelect.value = 'same';
  }

  serializeConditionRow(row) {
    const getVal = role => row.querySelector(`[data-role="${role}"]`)?.value || '';
    return {
      type: 'condition',
      left: {
        source: getVal('left-source') || 'field',
        field: getVal('left-field') || '',
        value: row.querySelector('[data-role="left-value"]')?.value || '',
        group: getVal('left-group') || '',
        groupTarget: getVal('left-group-target') || 'same'
      },
      op: getVal('operator') || 'eq',
      right: {
        source: getVal('right-source') || 'field',
        field: getVal('right-field') || '',
        value: row.querySelector('[data-role="right-value"]')?.value || '',
        group: getVal('right-group') || '',
        groupTarget: getVal('right-group-target') || 'same'
      }
    };
  }

  serializeConditionGroup(groupEl) {
    if (!groupEl) return null;
    const join = groupEl.querySelector('.group-join')?.value || 'and';
    const body = groupEl.querySelector('.condition-group-body');
    const items = [];
    Array.from(body?.children || []).forEach(child => {
      if (child.classList.contains('condition-group')) {
        const sub = this.serializeConditionGroup(child);
        if (sub) items.push(sub);
      } else if (child.classList.contains('condition-row')) {
        items.push(this.serializeConditionRow(child));
      }
    });
    return { type: 'group', join, items };
  }

  buildConditionAstFromGroup(groupConfig) {
    if (!groupConfig || !Array.isArray(groupConfig.items)) {
      return { type: 'literal', value: true, valueType: 'boolean' };
    }
    const join = groupConfig.join === 'or' ? 'or' : 'and';
    const parts = groupConfig.items.map(item => {
      if (!item) return null;
      if (item.type === 'group') return this.buildConditionAstFromGroup(item);
      return this.buildConditionAstFromCondition(item);
    }).filter(Boolean);
    if (!parts.length) return { type: 'literal', value: true, valueType: 'boolean' };
    return parts.reduce((acc, cur) => acc ? { type: 'binary', op: join, left: acc, right: cur } : cur, null);
  }

  buildConditionAstFromCondition(cond) {
    const op = cond?.op || 'eq';
    const isGroupSource = source => ['group', 'source_group', 'target_group'].includes(source);
    const negativeContainsOps = {
      notContains: 'contains',
      notContainsCi: 'containsCi'
    };
    const callOps = [
      'contains', 'containsCi',
      'startsWith', 'startsWithCi',
      'endsWith', 'endsWithCi',
      'regex', 'regexCi',
      'eqCi', 'neqCi'
    ];
    const leftIsGroup = isGroupSource(cond?.left?.source);
    const rightIsGroup = isGroupSource(cond?.right?.source);
    const left = this.buildConditionOperand(cond?.left);
    const right = this.buildConditionOperand(cond?.right);

    // Coherent shortcut for membership checks:
    // - if one side is a group and the other side is empty => `inGroup(...)` or `not(inGroup(...))`.
    if (leftIsGroup !== rightIsGroup) {
      const groupAst = leftIsGroup ? left : right;
      const otherOperand = leftIsGroup ? cond?.right : cond?.left;
      const otherAst = leftIsGroup ? right : left;
      const otherEmpty = this.isConditionOperandEmpty(otherOperand);
      if (otherEmpty) {
        return ['neq', 'neqCi'].includes(op)
          ? { type: 'unary', op: 'not', expr: groupAst }
          : groupAst;
      }
      if (negativeContainsOps[op]) {
        const innerName = negativeContainsOps[op];
        const inner = leftIsGroup
          ? { type: 'call', name: innerName, args: [groupAst, otherAst] }
          : { type: 'call', name: innerName, args: [otherAst, groupAst] };
        return { type: 'call', name: 'not', args: [inner] };
      }
      if (callOps.includes(op)) {
        return leftIsGroup
          ? { type: 'call', name: op, args: [groupAst, otherAst] }
          : { type: 'call', name: op, args: [otherAst, groupAst] };
      }
      return leftIsGroup
        ? { type: 'binary', op, left: groupAst, right: otherAst }
        : { type: 'binary', op, left: otherAst, right: groupAst };
    }

    if (negativeContainsOps[op]) {
      return {
        type: 'call',
        name: 'not',
        args: [{ type: 'call', name: negativeContainsOps[op], args: [left, right] }]
      };
    }
    if (callOps.includes(op)) {
      return { type: 'call', name: op, args: [left, right] };
    }
    return { type: 'binary', op, left, right };
  }

  astToConditionGroup(ast) {
    if (!ast) return null;
    if (ast.type === 'binary' && (ast.op === 'and' || ast.op === 'or')) {
      const join = ast.op;
      const items = [];
      const collect = node => {
        if (node?.type === 'binary' && node.op === join) {
          return collect(node.left) && collect(node.right);
        }
        const item = this.astToConditionItem(node);
        if (!item) return false;
        items.push(item);
        return true;
      };
      if (!collect(ast)) return null;
      return { type: 'group', join, items };
    }
    if (ast.type === 'call' && (ast.name === 'and' || ast.name === 'or')) {
      const join = ast.name;
      const items = [];
      const collect = node => {
        if (!node) return false;
        if (node.type === 'call' && node.name === join) {
          return (node.args || []).every(arg => collect(arg));
        }
        if (node.type === 'binary' && node.op === join) {
          return collect(node.left) && collect(node.right);
        }
        const item = this.astToConditionItem(node);
        if (!item) return false;
        items.push(item);
        return true;
      };
      if (!(ast.args || []).length) return null;
      if (!(ast.args || []).every(arg => collect(arg))) return null;
      return { type: 'group', join, items };
    }
    const single = this.astToConditionItem(ast);
    if (!single) return null;
    return { type: 'group', join: 'and', items: [single] };
  }

  astToConditionItem(ast) {
    if (!ast || typeof ast !== 'object') return null;
    if (ast.type === 'call' && ['inGroup', 'inNodeGroup', 'inLinkGroup'].includes(ast.name)) {
      const left = this.astToOperand(ast);
      if (!left) return null;
      return {
        type: 'condition',
        left,
        op: 'eq',
        right: { source: 'value', field: '', value: 'true', group: '' }
      };
    }
    if (ast.type === 'unary' && ast.op === 'not' && ast.expr?.type === 'call' && ['inGroup', 'inNodeGroup', 'inLinkGroup'].includes(ast.expr?.name)) {
      const left = this.astToOperand(ast.expr);
      if (!left) return null;
      return {
        type: 'condition',
        left,
        op: 'neq',
        right: { source: 'value', field: '', value: 'true', group: '' }
      };
    }
    if (ast.type === 'call' && ast.name === 'not' && ast.args?.[0]?.type === 'call' && ['inGroup', 'inNodeGroup', 'inLinkGroup'].includes(ast.args?.[0]?.name)) {
      const left = this.astToOperand(ast.args?.[0]);
      if (!left) return null;
      return {
        type: 'condition',
        left,
        op: 'neq',
        right: { source: 'value', field: '', value: 'true', group: '' }
      };
    }
    if (ast.type === 'unary' && ast.op === 'not' && ast.expr?.type === 'call' && ['contains', 'containsCi'].includes(ast.expr?.name)) {
      const left = this.astToOperand(ast.expr.args?.[0]);
      const right = this.astToOperand(ast.expr.args?.[1]);
      if (!left || !right) return null;
      return { type: 'condition', left, op: ast.expr?.name === 'containsCi' ? 'notContainsCi' : 'notContains', right };
    }
    if (ast.type === 'call' && ast.name === 'not' && ast.args?.[0]?.type === 'call' && ['contains', 'containsCi'].includes(ast.args?.[0]?.name)) {
      const left = this.astToOperand(ast.args?.[0]?.args?.[0]);
      const right = this.astToOperand(ast.args?.[0]?.args?.[1]);
      if (!left || !right) return null;
      return { type: 'condition', left, op: ast.args?.[0]?.name === 'containsCi' ? 'notContainsCi' : 'notContains', right };
    }
    if (ast.type === 'binary' && ['gt', 'gte', 'lt', 'lte', 'eq', 'neq'].includes(ast.op)) {
      const left = this.astToOperand(ast.left);
      const right = this.astToOperand(ast.right);
      if (!left || !right) return null;
      return { type: 'condition', left, op: ast.op, right };
    }
    if (ast.type === 'call' && ['contains', 'containsCi', 'startsWith', 'startsWithCi', 'endsWith', 'endsWithCi', 'regex', 'regexCi'].includes(ast.name)) {
      const left = this.astToOperand(ast.args?.[0]);
      const right = this.astToOperand(ast.args?.[1]);
      if (!left || !right) return null;
      return { type: 'condition', left, op: ast.name, right };
    }
    if (ast.type === 'call' && ['gt', 'gte', 'lt', 'lte', 'eq', 'neq', 'eqCi', 'neqCi'].includes(ast.name)) {
      const left = this.astToOperand(ast.args?.[0]);
      const right = this.astToOperand(ast.args?.[1]);
      if (!left || !right) return null;
      return { type: 'condition', left, op: ast.name, right };
    }
    return null;
  }

  astToOperand(ast) {
    if (!ast || typeof ast !== 'object') return null;
    if (ast.type === 'field') {
      return { source: 'field', field: ast.name || '', value: '' };
    }
    if (ast.type === 'literal') {
      return { source: 'value', field: '', value: this.literalToString(ast) };
    }
    if (ast.type === 'call' && ast.name === 'inGroup' && ast.args?.[0]?.type === 'literal') {
      return { source: 'group', field: '', value: '', group: String(ast.args[0].value || '') };
    }
    if (ast.type === 'call' && ast.name === 'inNodeGroup' && ast.args?.[0]?.type === 'literal') {
      const which = String(ast.args?.[1]?.value || 'source').toLowerCase();
      const source = which === 'target' ? 'target_group' : 'source_group';
      return { source, field: '', value: '', group: String(ast.args[0].value || '') };
    }
    if (ast.type === 'call' && ast.name === 'inLinkGroup' && ast.args?.[0]?.type === 'literal') {
      return { source: 'group', field: '', value: '', group: String(ast.args[0].value || '') };
    }
    if (ast.type === 'call' && ast.name === 'groupCount' && ast.args?.[0]?.type === 'literal') {
      const rawTarget = String(ast.args?.[1]?.value || 'same').toLowerCase();
      const groupTarget = rawTarget.startsWith('n')
        ? 'node'
        : (rawTarget.startsWith('l') ? 'link' : 'same');
      return {
        source: 'group_count',
        field: '',
        value: '',
        group: String(ast.args[0].value || ''),
        groupTarget
      };
    }
    return null;
  }

  buildConditionOperand(operand) {
    if (operand?.source === 'field') {
      return { type: 'field', name: operand.field || '' };
    }
    if (operand?.source === 'group') {
      return {
        type: 'call',
        name: 'inGroup',
        args: [{ type: 'literal', value: operand.group || '', valueType: 'text' }]
      };
    }
    if (operand?.source === 'source_group') {
      return {
        type: 'call',
        name: 'inNodeGroup',
        args: [
          { type: 'literal', value: operand.group || '', valueType: 'text' },
          { type: 'literal', value: 'source', valueType: 'text' }
        ]
      };
    }
    if (operand?.source === 'target_group') {
      return {
        type: 'call',
        name: 'inNodeGroup',
        args: [
          { type: 'literal', value: operand.group || '', valueType: 'text' },
          { type: 'literal', value: 'target', valueType: 'text' }
        ]
      };
    }
    if (operand?.source === 'group_count') {
      const args = [{ type: 'literal', value: operand.group || '', valueType: 'text' }];
      const target = String(operand.groupTarget || 'same').toLowerCase();
      if (target === 'node' || target === 'link') {
        args.push({ type: 'literal', value: target, valueType: 'text' });
      }
      return { type: 'call', name: 'groupCount', args };
    }
    return this.parseLiteral(operand?.value || '');
  }

  getAvailableGroups(target) {
    const groups = graphConfig?.groups || { nodes: [], links: [] };
    const list = target === 'link' ? (groups.links || []) : (groups.nodes || []);
    return (list || [])
      .filter(group => group && group.enabled !== false)
      .map(group => {
        const id = String(group.id || '').trim();
        const name = String(group.name || '').trim();
        const value = id || name;
        if (!value) return null;
        const label = name && id && name.toLowerCase() !== id.toLowerCase()
          ? `${name} (${id})`
          : (name || id);
        return { value, label };
      })
      .filter(Boolean);
  }

  resolveGroupCountTarget(groupTarget) {
    const raw = String(groupTarget || 'same').toLowerCase();
    if (raw === 'node' || raw === 'link') return raw;
    return this.current?.target === 'link' ? 'link' : 'node';
  }

  getGroupOptionsForSource(source, groupTarget = 'same') {
    if (source === 'source_group' || source === 'target_group') {
      return this.availableGroupsByTarget?.node || [];
    }
    if (source === 'group') {
      const target = this.current?.target === 'link' ? 'link' : 'node';
      return this.availableGroupsByTarget?.[target] || [];
    }
    if (source === 'group_count') {
      const target = this.resolveGroupCountTarget(groupTarget);
      return this.availableGroupsByTarget?.[target] || [];
    }
    return [];
  }

  buildGroupOptionsHtml(groups = null) {
    const list = Array.isArray(groups)
      ? groups
      : this.getGroupOptionsForSource('group');
    const options = ['<option value=""></option>'];
    list.forEach(group => {
      options.push(`<option value="${group.value}">${group.label}</option>`);
    });
    return options.join('');
  }

  ensureSelectHasOption(select, value) {
    const val = String(value || '').trim();
    if (!select || !val) return;
    const has = Array.from(select.options || []).some(opt => String(opt.value) === val);
    if (has) return;
    const opt = document.createElement('option');
    opt.value = val;
    opt.textContent = val;
    select.appendChild(opt);
  }

  isConditionOperandEmpty(operand) {
    if (!operand || typeof operand !== 'object') return true;
    const source = operand.source || 'value';
    if (source === 'field') return !String(operand.field || '').trim();
    if (['group', 'source_group', 'target_group'].includes(source)) return !String(operand.group || '').trim();
    if (source === 'group_count') return !String(operand.group || '').trim();
    return !String(operand.value || '').trim();
  }

  literalToString(ast) {
    if (!ast) return '';
    if (ast.valueType === 'boolean') return ast.value ? 'true' : 'false';
    if (ast.valueType === 'number') return String(ast.value);
    return String(ast.value ?? '');
  }

  parseLiteral(value) {
    const raw = String(value ?? '').trim();
    if (raw === '') return { type: 'literal', value: '', valueType: 'text' };
    const lower = raw.toLowerCase();
    if (lower === 'true' || lower === 'false') {
      return { type: 'literal', value: lower === 'true', valueType: 'boolean' };
    }
    let normalized = raw;
    if (normalized.includes(',') && normalized.includes('.')) {
      normalized = normalized.replace(/\./g, '');
    }
    normalized = normalized.replace(',', '.');
    if (!Number.isNaN(Number(normalized))) {
      return { type: 'literal', value: Number(normalized), valueType: 'number' };
    }
    return { type: 'literal', value: raw, valueType: 'text' };
  }

  buildOperand(sourceSelect, fieldSelect, valueInput) {
    if (!sourceSelect) return { type: 'literal', value: '', valueType: 'text' };
    if (sourceSelect.value === 'field') {
      return { type: 'field', name: fieldSelect?.value || '' };
    }
    return this.parseLiteral(valueInput?.value || '');
  }

  buildCalcNode(leftSource, leftField, leftValue, opSelect, rightSource, rightField, rightValue) {
    const left = this.buildOperand(leftSource, leftField, leftValue);
    const right = this.buildOperand(rightSource, rightField, rightValue);
    const op = opSelect?.value || 'add';
    const allowed = new Set(['add', 'sub', 'mul', 'div']);
    return { type: 'binary', op: allowed.has(op) ? op : 'add', left, right };
  }

  buildResultNode(mode, cfg) {
    if (mode === 'concat') {
      return {
        type: 'call',
        name: 'concat',
        args: [
          { type: 'field', name: cfg.concatA?.value || '' },
          { type: 'literal', value: cfg.concatSep?.value || '', valueType: 'text' },
          { type: 'field', name: cfg.concatB?.value || '' }
        ]
      };
    }
    if (mode === 'calc') {
      return this.buildCalcNode(
        cfg.calcLeftSource,
        cfg.calcLeftField,
        cfg.calcLeftValue,
        cfg.calcOp,
        cfg.calcRightSource,
        cfg.calcRightField,
        cfg.calcRightValue
      );
    }
    return this.buildOperand(cfg.sourceSelect, cfg.fieldSelect, cfg.valueInput);
  }

  buildAstFromVisual() {
    const groupEl = this.el.conditionRoot?.querySelector('.condition-group');
    const groupConfig = this.serializeConditionGroup(groupEl);
    const condition = this.buildConditionAstFromGroup(groupConfig);

    const thenNode = this.buildResultNode(
      this.el.thenMode?.value || 'value',
      {
        sourceSelect: this.el.thenSource,
        fieldSelect: this.el.thenField,
        valueInput: this.el.thenValue,
        concatA: this.el.thenConcatA,
        concatSep: this.el.thenConcatSep,
        concatB: this.el.thenConcatB,
        calcLeftSource: this.el.thenCalcLeftSource,
        calcLeftField: this.el.thenCalcLeftField,
        calcLeftValue: this.el.thenCalcLeftValue,
        calcOp: this.el.thenCalcOp,
        calcRightSource: this.el.thenCalcRightSource,
        calcRightField: this.el.thenCalcRightField,
        calcRightValue: this.el.thenCalcRightValue
      }
    );

    const kind = this.el.visualKind?.value || 'expression';
    if (kind !== 'condition') {
      return thenNode;
    }

    const elseNode = this.buildResultNode(
      this.el.elseMode?.value || 'value',
      {
        sourceSelect: this.el.elseSource,
        fieldSelect: this.el.elseField,
        valueInput: this.el.elseValue,
        concatA: this.el.elseConcatA,
        concatSep: this.el.elseConcatSep,
        concatB: this.el.elseConcatB,
        calcLeftSource: this.el.elseCalcLeftSource,
        calcLeftField: this.el.elseCalcLeftField,
        calcLeftValue: this.el.elseCalcLeftValue,
        calcOp: this.el.elseCalcOp,
        calcRightSource: this.el.elseCalcRightSource,
        calcRightField: this.el.elseCalcRightField,
        calcRightValue: this.el.elseCalcRightValue
      }
    );

    return { type: 'call', name: 'if', args: [condition, thenNode, elseNode] };
  }

  updateCanonicalFromExpression() {
    if (!this.el.exprText || !this.el.exprCanonical) return;
    if (this.isSyncing) return;
    this.isSyncing = true;
    this.canonicalDirty = false;
    try {
      const ast = parseExpression(this.el.exprText.value || '');
      const canonical = serializeToFunctional(ast);
      this.el.exprCanonical.value = canonical;
      this.el.exprError.textContent = '';
      if (this.conditionOnly) {
        const group = this.astToConditionGroup(ast);
        if (group) this.hideVisualIncompat();
        else this.showVisualIncompat(
          "Cette formule de condition n'est pas convertible en builder visuel. Efface la canonique pour reconstruire la condition."
        );
      } else if (!this.visualFromSchema && canonical) {
        this.showVisualIncompat(
          "La formule actuelle n'a pas de configuration visuelle retrocompatible. Efface la canonique pour reconstruire le builder."
        );
      } else if (!canonical) {
        this.hideVisualIncompat();
      }
      this.isSyncing = false;
      return ast;
    } catch (e) {
      this.el.exprError.textContent = e.message || 'Expression invalide';
      this.el.exprCanonical.value = '';
      if (!this.el.exprText?.value?.trim()) this.hideVisualIncompat();
      this.isSyncing = false;
      return null;
    }
  }

  updateExpressionFromCanonical() {
    if (!this.el.exprCanonical || !this.el.exprText) return;
    if (this.isSyncing) return;
    this.isSyncing = true;
    const canonical = (this.el.exprCanonical.value || '').trim();
    if (!canonical) {
      this.el.exprError.textContent = '';
      this.isSyncing = false;
      return;
    }
    this.canonicalDirty = true;
    try {
      const ast = parseExpression(canonical);
      this.el.exprText.value = canonical;
      this.el.exprError.textContent = '';
      if (this.conditionOnly) {
        const group = this.astToConditionGroup(ast);
        if (group) this.hideVisualIncompat();
        else this.showVisualIncompat(
          "Cette formule de condition n'est pas convertible en builder visuel. Efface la canonique pour reconstruire la condition."
        );
      } else if (!this.visualFromSchema) {
        this.showVisualIncompat(
          "La formule actuelle n'a pas de configuration visuelle retrocompatible. Efface la canonique pour reconstruire le builder."
        );
      }
      this.isSyncing = false;
      return ast;
    } catch (e) {
      this.el.exprError.textContent = e.message || 'Expression invalide';
      if (!canonical) this.hideVisualIncompat();
      this.isSyncing = false;
      return null;
    }
  }

  updateCanonicalFromVisual() {
    if (!this.el.exprCanonical) return;
    if (this.canonicalDirty || this.isSyncing) return;
    if ((this.el.mode?.value || 'visual') !== 'visual') return;
    this.isSyncing = true;
    try {
      let canonical = '';
      if (this.conditionOnly) {
        const groupEl = this.el.conditionRoot?.querySelector('.condition-group');
        const groupConfig = this.serializeConditionGroup(groupEl);
        const hasItems = Array.isArray(groupConfig?.items) && groupConfig.items.length > 0;
        if (hasItems) {
          const conditionAst = this.buildConditionAstFromGroup(groupConfig);
          canonical = serializeToFunctional(conditionAst);
        }
      } else {
        const ast = this.buildAstFromVisual();
        canonical = serializeToFunctional(ast);
      }
      this.el.exprCanonical.value = canonical;
      this.el.exprError.textContent = '';
    } catch (e) {
      this.el.exprError.textContent = e.message || 'Expression invalide';
    } finally {
      this.isSyncing = false;
    }
  }

  setAiStatus(message) {
    if (this.el.aiStatus) this.el.aiStatus.textContent = message || '';
  }

  stopAiRequest() {
    if (this.aiAbortController) {
      this.aiAbortController.abort();
      this.setAiStatus('Generation arretee.');
    }
  }

  requestAiExpression() {
    if (!this.current) return;
    const request = (this.el.aiRequest?.value || '').trim();
    if (!request) {
      this.setAiStatus('Decris la formule avant de lancer.');
      return;
    }
    const { target, field } = this.current;
    const fields = this.graphState.getFieldsByType(target).filter(f => f !== field);
    const desiredType = this.conditionOnly ? 'boolean' : (this.el.resultType?.value || 'auto');
    const prompt = getExpressionAssistantPrompt({
      request,
      target,
      field,
      fields,
      desiredType
    });
    const model = getModel();
    this.setAiStatus('Generation en cours...');
    this.aiAbortController = new AbortController();
    sendAiRequest({
      prompt,
      model,
      context: this.aiContextLabel || 'Champ personnalise',
      abortController: this.aiAbortController,
      onComplete: (result) => {
        const expression = result?.expression || result?.expr || '';
        if (!expression) {
          this.setAiStatus('Reponse IA invalide (expression manquante).');
          return;
        }
        if (this.el.mode) {
          this.el.mode.value = 'expression';
          this.toggleMode();
        }
        this.el.exprText.value = expression;
        const ast = this.updateCanonicalFromExpression();
        if (!ast) {
          this.setAiStatus('Expression IA invalide (parse echoue).');
          return;
        }
        if (result?.resultType && result.resultType !== 'auto' && this.el.resultType) {
          this.el.resultType.value = normalizeType(result.resultType);
        }
        this.setAiStatus('Expression proposee.');
        this.validateExpression();
      },
      onError: (error) => {
        this.setAiStatus(`Erreur IA: ${error.message}`);
      }
    });
  }

  apply() {
    if (!this.current) return;
    if (this.conditionOnly) {
      const mode = this.el.mode?.value || 'visual';
      let expr = '';
      if (mode === 'expression') {
        const raw = (this.el.exprText?.value || '').trim();
        if (raw) {
          try {
            const ast = parseExpression(raw);
            expr = serializeToFunctional(ast);
          } catch (e) {
            if (this.el.exprError) this.el.exprError.textContent = e.message || 'Expression invalide';
            return;
          }
        }
      } else {
        const groupEl = this.el.conditionRoot?.querySelector('.condition-group');
        const groupConfig = this.serializeConditionGroup(groupEl);
        const hasItems = Array.isArray(groupConfig?.items) && groupConfig.items.length > 0;
        if (hasItems) {
          const conditionAst = this.buildConditionAstFromGroup(groupConfig);
          expr = serializeToFunctional(conditionAst);
        }
      }

      if (this.conditionRequestId) {
        eventBus.emit('condition-editor-applied', { requestId: this.conditionRequestId, expr });
      }
      this.hide();
      return;
    }
    const { target, field } = this.current;
    const mode = this.el.mode?.value || 'visual';
    let ast = null;
    let expr = '';
    let visual = null;
    const canonicalText = (this.el.exprCanonical?.value || '').trim();

    if (canonicalText) {
      try {
        ast = parseExpression(canonicalText);
      } catch (e) {
        if (this.el.exprError) this.el.exprError.textContent = e.message || 'Expression invalide';
        return;
      }
      expr = serializeToFunctional(ast);
      if (mode === 'visual' && !this.canonicalDirty) {
        visual = this.captureVisualConfig();
      }
    } else if (mode === 'visual') {
      ast = this.buildAstFromVisual();
      expr = serializeToFunctional(ast);
      visual = this.captureVisualConfig();
      if (this.el.exprCanonical) this.el.exprCanonical.value = expr;
    } else {
      ast = this.updateCanonicalFromExpression();
      if (!ast) return;
      expr = serializeToFunctional(ast);
    }

    const resultTypeSelection = this.el.resultType?.value || 'auto';
    const inferred = inferExpressionType(ast, name => this.graphState.getFieldResolvedType(target, name)).type;
    const resultType = resultTypeSelection === 'auto' ? inferred : normalizeType(resultTypeSelection);

    const schema = this.graphState.buildConditionalSchema(target, field, expr, ast, resultType, visual);
    this.graphState.updateFieldSchema(target, field, schema);
    this.renderer.updateGraph();
    this.hide();
  }

  captureVisualConfig() {
    return {
      visualKind: this.el.visualKind?.value || 'expression',
      conditionGroup: this.serializeConditionGroup(
        this.el.conditionRoot?.querySelector('.condition-group')
      ),
      thenMode: this.el.thenMode?.value || 'value',
      thenSource: this.el.thenSource?.value || 'field',
      thenField: this.el.thenField?.value || '',
      thenValue: this.el.thenValue?.value || '',
      thenConcatA: this.el.thenConcatA?.value || '',
      thenConcatSep: this.el.thenConcatSep?.value || '',
      thenConcatB: this.el.thenConcatB?.value || '',
      thenCalcLeftSource: this.el.thenCalcLeftSource?.value || 'field',
      thenCalcLeftField: this.el.thenCalcLeftField?.value || '',
      thenCalcLeftValue: this.el.thenCalcLeftValue?.value || '',
      thenCalcOp: this.el.thenCalcOp?.value || 'add',
      thenCalcRightSource: this.el.thenCalcRightSource?.value || 'field',
      thenCalcRightField: this.el.thenCalcRightField?.value || '',
      thenCalcRightValue: this.el.thenCalcRightValue?.value || '',
      elseMode: this.el.elseMode?.value || 'value',
      elseSource: this.el.elseSource?.value || 'field',
      elseField: this.el.elseField?.value || '',
      elseValue: this.el.elseValue?.value || '',
      elseConcatA: this.el.elseConcatA?.value || '',
      elseConcatSep: this.el.elseConcatSep?.value || '',
      elseConcatB: this.el.elseConcatB?.value || '',
      elseCalcLeftSource: this.el.elseCalcLeftSource?.value || 'field',
      elseCalcLeftField: this.el.elseCalcLeftField?.value || '',
      elseCalcLeftValue: this.el.elseCalcLeftValue?.value || '',
      elseCalcOp: this.el.elseCalcOp?.value || 'add',
      elseCalcRightSource: this.el.elseCalcRightSource?.value || 'field',
      elseCalcRightField: this.el.elseCalcRightField?.value || '',
      elseCalcRightValue: this.el.elseCalcRightValue?.value || ''
    };
  }

  applyVisualConfig(cfg) {
    if (!cfg) return;
    if (this.el.visualKind) this.el.visualKind.value = cfg.visualKind || this.el.visualKind.value || 'expression';
    this.renderConditionGroup(cfg);

    this.el.thenMode.value = cfg.thenMode || 'value';
    this.el.thenSource.value = cfg.thenSource || 'field';
    this.el.thenField.value = cfg.thenField || '';
    this.el.thenValue.value = cfg.thenValue || '';
    this.el.thenConcatA.value = cfg.thenConcatA || '';
    this.el.thenConcatSep.value = cfg.thenConcatSep || '';
    this.el.thenConcatB.value = cfg.thenConcatB || '';
    if (this.el.thenCalcLeftSource) this.el.thenCalcLeftSource.value = cfg.thenCalcLeftSource || 'field';
    if (this.el.thenCalcLeftField) this.el.thenCalcLeftField.value = cfg.thenCalcLeftField || '';
    if (this.el.thenCalcLeftValue) this.el.thenCalcLeftValue.value = cfg.thenCalcLeftValue || '';
    if (this.el.thenCalcOp) this.el.thenCalcOp.value = cfg.thenCalcOp || 'add';
    if (this.el.thenCalcRightSource) this.el.thenCalcRightSource.value = cfg.thenCalcRightSource || 'field';
    if (this.el.thenCalcRightField) this.el.thenCalcRightField.value = cfg.thenCalcRightField || '';
    if (this.el.thenCalcRightValue) this.el.thenCalcRightValue.value = cfg.thenCalcRightValue || '';

    this.el.elseMode.value = cfg.elseMode || 'value';
    this.el.elseSource.value = cfg.elseSource || 'field';
    this.el.elseField.value = cfg.elseField || '';
    this.el.elseValue.value = cfg.elseValue || '';
    this.el.elseConcatA.value = cfg.elseConcatA || '';
    this.el.elseConcatSep.value = cfg.elseConcatSep || '';
    this.el.elseConcatB.value = cfg.elseConcatB || '';
    if (this.el.elseCalcLeftSource) this.el.elseCalcLeftSource.value = cfg.elseCalcLeftSource || 'field';
    if (this.el.elseCalcLeftField) this.el.elseCalcLeftField.value = cfg.elseCalcLeftField || '';
    if (this.el.elseCalcLeftValue) this.el.elseCalcLeftValue.value = cfg.elseCalcLeftValue || '';
    if (this.el.elseCalcOp) this.el.elseCalcOp.value = cfg.elseCalcOp || 'add';
    if (this.el.elseCalcRightSource) this.el.elseCalcRightSource.value = cfg.elseCalcRightSource || 'field';
    if (this.el.elseCalcRightField) this.el.elseCalcRightField.value = cfg.elseCalcRightField || '';
    if (this.el.elseCalcRightValue) this.el.elseCalcRightValue.value = cfg.elseCalcRightValue || '';
  }

  setDefaultVisual() {
    if (!this.el) return;
    if (this.el.visualKind) this.el.visualKind.value = 'expression';
    this.renderConditionGroup({});
    this.el.thenMode.value = 'value';
    this.el.thenSource.value = 'field';
    this.el.elseMode.value = 'value';
    this.el.elseSource.value = 'value';
    this.el.thenValue.value = '';
    this.el.elseValue.value = '';
    if (this.el.thenCalcLeftSource) this.el.thenCalcLeftSource.value = 'field';
    if (this.el.thenCalcRightSource) this.el.thenCalcRightSource.value = 'value';
    if (this.el.thenCalcOp) this.el.thenCalcOp.value = 'add';
    if (this.el.thenCalcLeftValue) this.el.thenCalcLeftValue.value = '';
    if (this.el.thenCalcRightValue) this.el.thenCalcRightValue.value = '';
    if (this.el.thenCalcLeftField) this.el.thenCalcLeftField.value = '';
    if (this.el.thenCalcRightField) this.el.thenCalcRightField.value = '';
    if (this.el.elseCalcLeftSource) this.el.elseCalcLeftSource.value = 'field';
    if (this.el.elseCalcRightSource) this.el.elseCalcRightSource.value = 'value';
    if (this.el.elseCalcOp) this.el.elseCalcOp.value = 'add';
    if (this.el.elseCalcLeftValue) this.el.elseCalcLeftValue.value = '';
    if (this.el.elseCalcRightValue) this.el.elseCalcRightValue.value = '';
    if (this.el.elseCalcLeftField) this.el.elseCalcLeftField.value = '';
    if (this.el.elseCalcRightField) this.el.elseCalcRightField.value = '';
  }

  validateExpression() {
    const output = this.el.validateOutput;
    if (!output) return;
    if (!this.current) {
      output.textContent = 'Aucun champ selectionne.';
      return;
    }
    const { target, field } = this.current;
    const mode = this.el.mode?.value || 'visual';
    const canonicalText = (this.el.exprCanonical?.value || '').trim();
    let ast = null;
    let source = 'expression';

    try {
      if (canonicalText) {
        ast = parseExpression(canonicalText);
        source = 'canonique';
      } else if (mode === 'visual') {
        ast = this.buildAstFromVisual();
        source = 'visuel';
      } else {
        ast = parseExpression(this.el.exprText?.value || '');
        source = 'expression';
      }
    } catch (e) {
      output.textContent = `Expression invalide (${source}): ${e.message || 'invalide'}`;
      return;
    }

    const canonical = serializeToFunctional(ast);
    if (!canonicalText && this.el.exprCanonical) this.el.exprCanonical.value = canonical;

    const usedFields = Array.from(this.collectFieldRefs(ast)).filter(Boolean);
    const available = new Set(this.graphState.getFieldsByType(target));
    const missing = usedFields.filter(f => !available.has(f));
    const cyclePath = this.detectCycle(target, field, ast);

    const items = target === 'node' ? this.graphState.nodes : this.graphState.links;
    const conditionAst = this.extractConditionAst(ast);
    const matchedIds = [];
    const evalErrors = [];

    items.forEach(item => {
      try {
        const ctx = {
          graph: this.graphState,
          target,
          item,
          getField: name => this.graphState.resolveFieldValue(target, item, name)
        };
        if (conditionAst) {
          const ok = !!evaluateExpression(conditionAst, ctx);
          if (ok) matchedIds.push(item.id);
        } else {
          matchedIds.push(item.id);
        }
      } catch (e) {
        evalErrors.push({ id: item.id, error: e.message || 'erreur' });
      }
    });

    const lines = [];
    lines.push(`Source: ${source}`);
    lines.push(`Expression canonique: ${canonical}`);
    if (missing.length) lines.push(`Champs manquants: ${missing.join(', ')}`);
    if (cyclePath) lines.push(`Cycle detecte: ${cyclePath.join(' -> ')}`);
    if (evalErrors.length) {
      const sample = evalErrors.slice(0, 5).map(e => `${e.id}: ${e.error}`).join(' | ');
      lines.push(`Erreurs d'evaluation: ${evalErrors.length}`);
      if (sample) lines.push(`Exemples: ${sample}${evalErrors.length > 5 ? ' ...' : ''}`);
    }
    lines.push(`Elements concernes: ${matchedIds.length}/${items.length}`);
    if (matchedIds.length) {
      const preview = matchedIds.slice(0, 30).join(', ');
      lines.push(`IDs: ${preview}${matchedIds.length > 30 ? ' ...' : ''}`);
    }

    output.textContent = lines.join('\n');
  }

  collectFieldRefs(ast, acc = new Set()) {
    if (!ast || typeof ast !== 'object') return acc;
    if (ast.type === 'field') {
      if (ast.name) acc.add(ast.name);
      return acc;
    }
    if (ast.type === 'binary') {
      this.collectFieldRefs(ast.left, acc);
      this.collectFieldRefs(ast.right, acc);
      return acc;
    }
    if (ast.type === 'unary') {
      this.collectFieldRefs(ast.expr, acc);
      return acc;
    }
    if (ast.type === 'call') {
      (ast.args || []).forEach(arg => this.collectFieldRefs(arg, acc));
      return acc;
    }
    if (Array.isArray(ast.args)) {
      ast.args.forEach(arg => this.collectFieldRefs(arg, acc));
    }
    return acc;
  }

  extractConditionAst(ast) {
    if (!ast || ast.type !== 'call') return null;
    if (ast.name !== 'if') return null;
    return ast.args?.[0] || null;
  }

  detectCycle(target, field, astOverride) {
    const path = [];

    const getAst = name => {
      if (name === field) return astOverride;
      const entry = this.graphState.getFieldSchema(target, name);
      if (!entry) return null;
      if (entry.ast) return entry.ast;
      if (entry.expr) {
        try {
          return parseExpression(entry.expr);
        } catch (e) {
          return null;
        }
      }
      return null;
    };

    const visit = (name, chain) => {
      if (chain.includes(name)) {
        path.push(...chain, name);
        return true;
      }
      const ast = getAst(name);
      if (!ast) return false;
      const deps = Array.from(this.collectFieldRefs(ast));
      for (const dep of deps) {
        const entry = this.graphState.getFieldSchema(target, dep);
        const depType = normalizeType(entry?.type || this.graphState.getFieldType(target, dep));
        if (depType !== 'conditional') continue;
        if (visit(dep, chain.concat([name]))) return true;
      }
      return false;
    };

    if (visit(field, [])) return path;
    return null;
  }

  onDragStart(e) {
    const tag = e.target?.tagName;
    if (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(tag)) return;
    const item = e.target.closest('.condition-row, .condition-group');
    if (!item || item.dataset.root) return;
    this.draggedEl = item;
    item.classList.add('condition-dragging');
    try {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', 'condition');
    } catch (err) {
      // ignore
    }
  }

  onDragOver(e) {
    if (!this.draggedEl) return;
    e.preventDefault();
    const row = e.target.closest('.condition-row');
    const body = e.target.closest('.condition-group-body');
    const group = e.target.closest('.condition-group');

    let targetEl = null;
    let position = 'inside';
    if (row && row !== this.draggedEl && !this.draggedEl.contains(row)) {
      targetEl = row;
      const rect = row.getBoundingClientRect();
      position = (e.clientY - rect.top) < rect.height / 2 ? 'before' : 'after';
    } else if (body && !this.draggedEl.contains(body)) {
      targetEl = body;
      position = 'inside';
    } else if (group && !this.draggedEl.contains(group)) {
      targetEl = group.querySelector('.condition-group-body') || group;
      position = 'inside';
    }

    this.dropTarget = { el: targetEl, position };
    this.setDropTarget(targetEl);
  }

  onDragLeave(e) {
    if (!this.draggedEl) return;
    const leaving = e.target;
    if (leaving && leaving.classList?.contains('condition-drop-target')) {
      leaving.classList.remove('condition-drop-target');
    }
  }

  onDrop(e) {
    if (!this.draggedEl) return;
    e.preventDefault();
    const drop = this.dropTarget;
    const dragged = this.draggedEl;

    if (drop?.el && dragged && drop.el !== dragged) {
      if (drop.position === 'inside') {
        drop.el.appendChild(dragged);
      } else if (drop.el.parentElement) {
        const parent = drop.el.parentElement;
        if (drop.position === 'before') {
          parent.insertBefore(dragged, drop.el);
        } else {
          parent.insertBefore(dragged, drop.el.nextSibling);
        }
      }
    }

    this.clearDragState();
    this.updateCanonicalFromVisual();
  }

  onDragEnd() {
    this.clearDragState();
  }

  setDropTarget(el) {
    if (this.dropTargetEl && this.dropTargetEl !== el) {
      this.dropTargetEl.classList.remove('condition-drop-target');
    }
    this.dropTargetEl = el;
    if (el) el.classList.add('condition-drop-target');
  }

  clearDragState() {
    if (this.draggedEl) {
      this.draggedEl.classList.remove('condition-dragging');
    }
    if (this.dropTargetEl) {
      this.dropTargetEl.classList.remove('condition-drop-target');
    }
    this.draggedEl = null;
    this.dropTarget = null;
    this.dropTargetEl = null;
  }
}
