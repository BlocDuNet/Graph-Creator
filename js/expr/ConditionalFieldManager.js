import eventBus from '../services/EventBus.js';
import {
  parseExpression,
  serializeToFunctional,
  inferExpressionType
} from './ExpressionEngine.js';
import { normalizeType } from '../services/FieldTypeService.js';
import { OllamaProvider } from '../ai/OllamaProvider.js';
import { aiConfig } from '../config/index.js';
import { getExpressionAssistantPrompt } from '../config/templates/expressions.js';

export class ConditionalFieldManager {
  constructor(graphState, renderer) {
    this.graphState = graphState;
    this.renderer = renderer;
    this.current = null;
    this.aiProvider = new OllamaProvider();
    this.aiAbortController = null;
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
      visualKind: document.getElementById('conditional-visual-kind'),
      conditionBlock: document.getElementById('conditional-condition-block'),
      thenElseBlock: document.getElementById('conditional-then-else-block'),
      elseBlock: document.getElementById('conditional-else-block'),
      thenLabel: document.getElementById('then-label'),
      elseLabel: document.getElementById('else-label'),
      condLeftSource: document.getElementById('cond-left-source'),
      condLeftField: document.getElementById('cond-left-field'),
      condLeftValue: document.getElementById('cond-left-value'),
      condOperator: document.getElementById('cond-operator'),
      condRightSource: document.getElementById('cond-right-source'),
      condRightField: document.getElementById('cond-right-field'),
      condRightValue: document.getElementById('cond-right-value'),
      condExtraEnabled: document.getElementById('cond-extra-enabled'),
      condJoin: document.getElementById('cond-join'),
      condExtraBlock: document.getElementById('cond-extra-block'),
      cond2LeftSource: document.getElementById('cond2-left-source'),
      cond2LeftField: document.getElementById('cond2-left-field'),
      cond2LeftValue: document.getElementById('cond2-left-value'),
      cond2Operator: document.getElementById('cond2-operator'),
      cond2RightSource: document.getElementById('cond2-right-source'),
      cond2RightField: document.getElementById('cond2-right-field'),
      cond2RightValue: document.getElementById('cond2-right-value'),
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
      aiRequest: document.getElementById('conditional-ai-request'),
      aiGenerate: document.getElementById('conditional-ai-generate'),
      aiStatus: document.getElementById('conditional-ai-status')
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
    this.el.visualKind?.addEventListener('change', () => this.toggleVisualKind());
    this.el.thenMode?.addEventListener('change', () => this.toggleThenElse());
    this.el.elseMode?.addEventListener('change', () => this.toggleThenElse());
    this.el.condLeftSource?.addEventListener('change', () => this.toggleSources());
    this.el.condRightSource?.addEventListener('change', () => this.toggleSources());
    this.el.condExtraEnabled?.addEventListener('change', () => this.toggleExtraCondition());
    this.el.cond2LeftSource?.addEventListener('change', () => this.toggleSources());
    this.el.cond2RightSource?.addEventListener('change', () => this.toggleSources());
    this.el.thenSource?.addEventListener('change', () => this.toggleSources());
    this.el.elseSource?.addEventListener('change', () => this.toggleSources());
    this.el.thenCalcLeftSource?.addEventListener('change', () => this.toggleSources());
    this.el.thenCalcRightSource?.addEventListener('change', () => this.toggleSources());
    this.el.elseCalcLeftSource?.addEventListener('change', () => this.toggleSources());
    this.el.elseCalcRightSource?.addEventListener('change', () => this.toggleSources());
    this.el.exprText?.addEventListener('input', () => this.updateCanonicalFromExpression());
    this.el.aiGenerate?.addEventListener('click', () => this.requestAiExpression());
  }

  open(target, field) {
    this.current = { target, field };
    if (!this.el.overlay) return;
    const fields = this.graphState.getFieldsByType(target).filter(f => f !== field);
    this.fillSelect(this.el.condLeftField, fields);
    this.fillSelect(this.el.condRightField, fields);
    this.fillSelect(this.el.cond2LeftField, fields);
    this.fillSelect(this.el.cond2RightField, fields);
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
    this.setAiStatus('');

    const detectedKind = this.detectVisualKind(entry);
    if (entry.visual) {
      this.applyVisualConfig(entry.visual);
    } else {
      this.setDefaultVisual();
    }
    if (!entry.visual?.visualKind && detectedKind && this.el.visualKind) {
      this.el.visualKind.value = detectedKind;
    }

    this.toggleMode();
    this.toggleVisualKind();
    this.toggleExtraCondition();
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

  toggleVisualKind() {
    const kind = this.el.visualKind?.value || 'expression';
    const isCondition = kind === 'condition';
    this.el.conditionBlock?.classList.toggle('hidden', !isCondition);
    this.el.elseBlock?.classList.toggle('hidden', !isCondition);
    if (this.el.thenLabel) this.el.thenLabel.textContent = isCondition ? 'Alors' : 'Expression';
    if (this.el.elseLabel && isCondition) this.el.elseLabel.textContent = 'Sinon';
  }

  toggleExtraCondition() {
    const enabled = !!this.el.condExtraEnabled?.checked;
    this.el.condExtraBlock?.classList.toggle('hidden', !enabled);
    if (this.el.condJoin) this.el.condJoin.disabled = !enabled;
    this.toggleSources();
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
    this.toggleSourceBlock(this.el.condLeftSource, this.el.condLeftField, this.el.condLeftValue);
    this.toggleSourceBlock(this.el.condRightSource, this.el.condRightField, this.el.condRightValue);
    this.toggleSourceBlock(this.el.cond2LeftSource, this.el.cond2LeftField, this.el.cond2LeftValue);
    this.toggleSourceBlock(this.el.cond2RightSource, this.el.cond2RightField, this.el.cond2RightValue);
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
    const left = this.buildOperand(this.el.condLeftSource, this.el.condLeftField, this.el.condLeftValue);
    const right = this.buildOperand(this.el.condRightSource, this.el.condRightField, this.el.condRightValue);
    const op = this.el.condOperator?.value || 'eq';
    let condition = { type: 'binary', op, left, right };
    const extraEnabled = !!this.el.condExtraEnabled?.checked;
    if (extraEnabled) {
      const left2 = this.buildOperand(this.el.cond2LeftSource, this.el.cond2LeftField, this.el.cond2LeftValue);
      const right2 = this.buildOperand(this.el.cond2RightSource, this.el.cond2RightField, this.el.cond2RightValue);
      const op2 = this.el.cond2Operator?.value || 'eq';
      const cond2 = { type: 'binary', op: op2, left: left2, right: right2 };
      const join = this.el.condJoin?.value === 'or' ? 'or' : 'and';
      condition = { type: 'binary', op: join, left: condition, right: cond2 };
    }

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

  setAiStatus(message) {
    if (this.el.aiStatus) this.el.aiStatus.textContent = message || '';
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
    const desiredType = this.el.resultType?.value || 'auto';
    const prompt = getExpressionAssistantPrompt({
      request,
      target,
      field,
      fields,
      desiredType
    });
    const model = document.getElementById('ollamaModel')?.value?.trim() || aiConfig.ollama.api.defaultModel;
    this.setAiStatus('Generation en cours...');
    this.aiAbortController = new AbortController();
    this.aiProvider.sendRequest({
      prompt,
      model,
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
        this.updateCanonicalFromExpression();
        if (result?.resultType && result.resultType !== 'auto' && this.el.resultType) {
          this.el.resultType.value = normalizeType(result.resultType);
        }
        this.setAiStatus('Expression proposee.');
      },
      onError: (error) => {
        this.setAiStatus(`Erreur IA: ${error.message}`);
      }
    });
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
      visualKind: this.el.visualKind?.value || 'expression',
      condLeftSource: this.el.condLeftSource?.value || 'field',
      condLeftField: this.el.condLeftField?.value || '',
      condLeftValue: this.el.condLeftValue?.value || '',
      condOperator: this.el.condOperator?.value || 'eq',
      condRightSource: this.el.condRightSource?.value || 'field',
      condRightField: this.el.condRightField?.value || '',
      condRightValue: this.el.condRightValue?.value || '',
      condExtraEnabled: !!this.el.condExtraEnabled?.checked,
      condJoin: this.el.condJoin?.value || 'and',
      cond2LeftSource: this.el.cond2LeftSource?.value || 'field',
      cond2LeftField: this.el.cond2LeftField?.value || '',
      cond2LeftValue: this.el.cond2LeftValue?.value || '',
      cond2Operator: this.el.cond2Operator?.value || 'eq',
      cond2RightSource: this.el.cond2RightSource?.value || 'field',
      cond2RightField: this.el.cond2RightField?.value || '',
      cond2RightValue: this.el.cond2RightValue?.value || '',
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
    this.el.condLeftSource.value = cfg.condLeftSource || 'field';
    this.el.condLeftField.value = cfg.condLeftField || '';
    this.el.condLeftValue.value = cfg.condLeftValue || '';
    this.el.condOperator.value = cfg.condOperator || 'eq';
    this.el.condRightSource.value = cfg.condRightSource || 'field';
    this.el.condRightField.value = cfg.condRightField || '';
    this.el.condRightValue.value = cfg.condRightValue || '';
    if (this.el.condExtraEnabled) this.el.condExtraEnabled.checked = !!cfg.condExtraEnabled;
    if (this.el.condJoin) this.el.condJoin.value = cfg.condJoin || 'and';
    if (this.el.cond2LeftSource) this.el.cond2LeftSource.value = cfg.cond2LeftSource || 'field';
    if (this.el.cond2LeftField) this.el.cond2LeftField.value = cfg.cond2LeftField || '';
    if (this.el.cond2LeftValue) this.el.cond2LeftValue.value = cfg.cond2LeftValue || '';
    if (this.el.cond2Operator) this.el.cond2Operator.value = cfg.cond2Operator || 'eq';
    if (this.el.cond2RightSource) this.el.cond2RightSource.value = cfg.cond2RightSource || 'field';
    if (this.el.cond2RightField) this.el.cond2RightField.value = cfg.cond2RightField || '';
    if (this.el.cond2RightValue) this.el.cond2RightValue.value = cfg.cond2RightValue || '';

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
    this.el.condLeftSource.value = 'field';
    this.el.condRightSource.value = 'value';
    this.el.condOperator.value = 'gt';
    if (this.el.condExtraEnabled) this.el.condExtraEnabled.checked = false;
    if (this.el.condJoin) this.el.condJoin.value = 'and';
    if (this.el.cond2LeftSource) this.el.cond2LeftSource.value = 'field';
    if (this.el.cond2RightSource) this.el.cond2RightSource.value = 'value';
    if (this.el.cond2Operator) this.el.cond2Operator.value = 'eq';
    this.el.thenMode.value = 'value';
    this.el.thenSource.value = 'field';
    this.el.elseMode.value = 'value';
    this.el.elseSource.value = 'value';
    this.el.condLeftValue.value = '';
    this.el.condRightValue.value = '';
    if (this.el.cond2LeftValue) this.el.cond2LeftValue.value = '';
    if (this.el.cond2RightValue) this.el.cond2RightValue.value = '';
    if (this.el.cond2LeftField) this.el.cond2LeftField.value = '';
    if (this.el.cond2RightField) this.el.cond2RightField.value = '';
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
}
