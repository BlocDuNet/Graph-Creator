import eventBus from '../services/EventBus.js';
import {
  parseExpression,
  serializeToFunctional,
  inferExpressionType
} from './ExpressionEngine.js';
import { normalizeType } from '../services/FieldTypeService.js';

export class ConditionalFieldManager {
  constructor(graphState, renderer) {
    this.graphState = graphState;
    this.renderer = renderer;
    this.current = null;
    this.bindElements();
    this.bindEvents();
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
      condLeftSource: document.getElementById('cond-left-source'),
      condLeftField: document.getElementById('cond-left-field'),
      condLeftValue: document.getElementById('cond-left-value'),
      condOperator: document.getElementById('cond-operator'),
      condRightSource: document.getElementById('cond-right-source'),
      condRightField: document.getElementById('cond-right-field'),
      condRightValue: document.getElementById('cond-right-value'),
      thenMode: document.getElementById('then-mode'),
      thenValueBlock: document.getElementById('then-value-block'),
      thenConcatBlock: document.getElementById('then-concat-block'),
      thenSource: document.getElementById('then-source'),
      thenField: document.getElementById('then-field'),
      thenValue: document.getElementById('then-value'),
      thenConcatA: document.getElementById('then-concat-field-a'),
      thenConcatSep: document.getElementById('then-concat-sep'),
      thenConcatB: document.getElementById('then-concat-field-b'),
      elseMode: document.getElementById('else-mode'),
      elseValueBlock: document.getElementById('else-value-block'),
      elseConcatBlock: document.getElementById('else-concat-block'),
      elseSource: document.getElementById('else-source'),
      elseField: document.getElementById('else-field'),
      elseValue: document.getElementById('else-value'),
      elseConcatA: document.getElementById('else-concat-field-a'),
      elseConcatSep: document.getElementById('else-concat-sep'),
      elseConcatB: document.getElementById('else-concat-field-b')
    };
  }

  bindEvents() {
    eventBus.on('conditional-edit-requested', e => {
      const { target, field } = e.detail || {};
      if (!target || !field) return;
      this.open(target, field);
    });

    this.el.cancel?.addEventListener('click', () => this.hide());
    this.el.apply?.addEventListener('click', () => this.apply());
    this.el.mode?.addEventListener('change', () => this.toggleMode());
    this.el.thenMode?.addEventListener('change', () => this.toggleThenElse());
    this.el.elseMode?.addEventListener('change', () => this.toggleThenElse());
    this.el.condLeftSource?.addEventListener('change', () => this.toggleSources());
    this.el.condRightSource?.addEventListener('change', () => this.toggleSources());
    this.el.thenSource?.addEventListener('change', () => this.toggleSources());
    this.el.elseSource?.addEventListener('change', () => this.toggleSources());
    this.el.exprText?.addEventListener('input', () => this.updateCanonicalFromExpression());
  }

  open(target, field) {
    this.current = { target, field };
    if (!this.el.overlay) return;
    const fields = this.graphState.getFieldsByType(target).filter(f => f !== field);
    this.fillSelect(this.el.condLeftField, fields);
    this.fillSelect(this.el.condRightField, fields);
    this.fillSelect(this.el.thenField, fields);
    this.fillSelect(this.el.elseField, fields);
    this.fillSelect(this.el.thenConcatA, fields);
    this.fillSelect(this.el.thenConcatB, fields);
    this.fillSelect(this.el.elseConcatA, fields);
    this.fillSelect(this.el.elseConcatB, fields);

    const entry = this.graphState.getFieldSchema(target, field) || {};
    this.el.fieldName.textContent = `${target}.${field}`;
    this.el.resultType.value = entry.resultType || 'auto';
    if (entry.expr) {
      this.el.exprText.value = entry.expr;
      this.updateCanonicalFromExpression();
    } else {
      this.el.exprText.value = '';
      this.el.exprCanonical.value = '';
      this.el.exprError.textContent = '';
    }

    if (entry.visual) {
      this.applyVisualConfig(entry.visual);
    } else {
      this.setDefaultVisual();
    }

    this.toggleMode();
    this.toggleThenElse();
    this.toggleSources();
    this.show();
  }

  show() {
    this.el.overlay?.classList.remove('hidden');
  }

  hide() {
    this.el.overlay?.classList.add('hidden');
  }

  toggleMode() {
    const mode = this.el.mode?.value || 'visual';
    if (this.el.visual) this.el.visual.classList.toggle('hidden', mode !== 'visual');
    if (this.el.expression) this.el.expression.classList.toggle('hidden', mode !== 'expression');
  }

  toggleThenElse() {
    const thenMode = this.el.thenMode?.value || 'value';
    const elseMode = this.el.elseMode?.value || 'value';
    this.el.thenValueBlock?.classList.toggle('hidden', thenMode !== 'value');
    this.el.thenConcatBlock?.classList.toggle('hidden', thenMode !== 'concat');
    this.el.elseValueBlock?.classList.toggle('hidden', elseMode !== 'value');
    this.el.elseConcatBlock?.classList.toggle('hidden', elseMode !== 'concat');
  }

  toggleSources() {
    this.toggleSourceBlock(this.el.condLeftSource, this.el.condLeftField, this.el.condLeftValue);
    this.toggleSourceBlock(this.el.condRightSource, this.el.condRightField, this.el.condRightValue);
    this.toggleSourceBlock(this.el.thenSource, this.el.thenField, this.el.thenValue);
    this.toggleSourceBlock(this.el.elseSource, this.el.elseField, this.el.elseValue);
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

  buildResultNode(mode, sourceSelect, fieldSelect, valueInput, concatA, concatSep, concatB) {
    if (mode === 'concat') {
      return {
        type: 'call',
        name: 'concat',
        args: [
          { type: 'field', name: concatA?.value || '' },
          { type: 'literal', value: concatSep?.value || '', valueType: 'text' },
          { type: 'field', name: concatB?.value || '' }
        ]
      };
    }
    return this.buildOperand(sourceSelect, fieldSelect, valueInput);
  }

  buildAstFromVisual() {
    const left = this.buildOperand(this.el.condLeftSource, this.el.condLeftField, this.el.condLeftValue);
    const right = this.buildOperand(this.el.condRightSource, this.el.condRightField, this.el.condRightValue);
    const op = this.el.condOperator?.value || 'eq';
    const condition = { type: 'binary', op, left, right };

    const thenNode = this.buildResultNode(
      this.el.thenMode?.value || 'value',
      this.el.thenSource,
      this.el.thenField,
      this.el.thenValue,
      this.el.thenConcatA,
      this.el.thenConcatSep,
      this.el.thenConcatB
    );

    const elseNode = this.buildResultNode(
      this.el.elseMode?.value || 'value',
      this.el.elseSource,
      this.el.elseField,
      this.el.elseValue,
      this.el.elseConcatA,
      this.el.elseConcatSep,
      this.el.elseConcatB
    );

    return { type: 'call', name: 'if', args: [condition, thenNode, elseNode] };
  }

  updateCanonicalFromExpression() {
    if (!this.el.exprText) return;
    try {
      const ast = parseExpression(this.el.exprText.value || '');
      const canonical = serializeToFunctional(ast);
      this.el.exprCanonical.value = canonical;
      this.el.exprError.textContent = '';
      return ast;
    } catch (e) {
      this.el.exprError.textContent = e.message || 'Expression invalide';
      this.el.exprCanonical.value = '';
      return null;
    }
  }

  apply() {
    if (!this.current) return;
    const { target, field } = this.current;
    const mode = this.el.mode?.value || 'visual';
    let ast = null;
    let expr = '';
    let visual = null;

    if (mode === 'visual') {
      ast = this.buildAstFromVisual();
      expr = serializeToFunctional(ast);
      visual = this.captureVisualConfig();
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
      condLeftSource: this.el.condLeftSource?.value || 'field',
      condLeftField: this.el.condLeftField?.value || '',
      condLeftValue: this.el.condLeftValue?.value || '',
      condOperator: this.el.condOperator?.value || 'eq',
      condRightSource: this.el.condRightSource?.value || 'field',
      condRightField: this.el.condRightField?.value || '',
      condRightValue: this.el.condRightValue?.value || '',
      thenMode: this.el.thenMode?.value || 'value',
      thenSource: this.el.thenSource?.value || 'field',
      thenField: this.el.thenField?.value || '',
      thenValue: this.el.thenValue?.value || '',
      thenConcatA: this.el.thenConcatA?.value || '',
      thenConcatSep: this.el.thenConcatSep?.value || '',
      thenConcatB: this.el.thenConcatB?.value || '',
      elseMode: this.el.elseMode?.value || 'value',
      elseSource: this.el.elseSource?.value || 'field',
      elseField: this.el.elseField?.value || '',
      elseValue: this.el.elseValue?.value || '',
      elseConcatA: this.el.elseConcatA?.value || '',
      elseConcatSep: this.el.elseConcatSep?.value || '',
      elseConcatB: this.el.elseConcatB?.value || ''
    };
  }

  applyVisualConfig(cfg) {
    if (!cfg) return;
    this.el.condLeftSource.value = cfg.condLeftSource || 'field';
    this.el.condLeftField.value = cfg.condLeftField || '';
    this.el.condLeftValue.value = cfg.condLeftValue || '';
    this.el.condOperator.value = cfg.condOperator || 'eq';
    this.el.condRightSource.value = cfg.condRightSource || 'field';
    this.el.condRightField.value = cfg.condRightField || '';
    this.el.condRightValue.value = cfg.condRightValue || '';

    this.el.thenMode.value = cfg.thenMode || 'value';
    this.el.thenSource.value = cfg.thenSource || 'field';
    this.el.thenField.value = cfg.thenField || '';
    this.el.thenValue.value = cfg.thenValue || '';
    this.el.thenConcatA.value = cfg.thenConcatA || '';
    this.el.thenConcatSep.value = cfg.thenConcatSep || '';
    this.el.thenConcatB.value = cfg.thenConcatB || '';

    this.el.elseMode.value = cfg.elseMode || 'value';
    this.el.elseSource.value = cfg.elseSource || 'field';
    this.el.elseField.value = cfg.elseField || '';
    this.el.elseValue.value = cfg.elseValue || '';
    this.el.elseConcatA.value = cfg.elseConcatA || '';
    this.el.elseConcatSep.value = cfg.elseConcatSep || '';
    this.el.elseConcatB.value = cfg.elseConcatB || '';
  }

  setDefaultVisual() {
    if (!this.el) return;
    this.el.condLeftSource.value = 'field';
    this.el.condRightSource.value = 'value';
    this.el.condOperator.value = 'gt';
    this.el.thenMode.value = 'value';
    this.el.thenSource.value = 'field';
    this.el.elseMode.value = 'value';
    this.el.elseSource.value = 'value';
    this.el.condLeftValue.value = '';
    this.el.condRightValue.value = '';
    this.el.thenValue.value = '';
    this.el.elseValue.value = '';
  }
}
