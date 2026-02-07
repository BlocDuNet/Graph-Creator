import eventBus from '../services/EventBus.js';
import { graphConfig } from '../config/index.js';

function uid(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function ensureStyleRule(rule, target) {
  return {
    id: rule?.id || uid('style'),
    name: rule?.name || (target === 'link' ? 'Lien' : 'Noeud'),
    enabled: rule?.enabled !== false,
    target,
    priority: Number(rule?.priority ?? 0),
    when: rule?.when || '',
    style: {
      fill: rule?.style?.fill || '',
      stroke: rule?.style?.stroke || '',
      strokeWidth: rule?.style?.strokeWidth || '',
      opacity: rule?.style?.opacity || '',
      size: rule?.style?.size || '',
      shape: rule?.style?.shape || 'circle',
      labelColor: rule?.style?.labelColor || '',
      linkColor: rule?.style?.linkColor || '',
      linkWidth: rule?.style?.linkWidth || '',
      linkOpacity: rule?.style?.linkOpacity || '',
      linkDash: rule?.style?.linkDash || ''
    }
  };
}

function ensurePieRule(rule) {
  return {
    id: rule?.id || uid('pie'),
    name: rule?.name || 'Pie chart',
    enabled: rule?.enabled !== false,
    priority: Number(rule?.priority ?? 0),
    when: rule?.when || '',
    fields: Array.isArray(rule?.fields) ? rule.fields.join(', ') : (rule?.fields || ''),
    colors: Array.isArray(rule?.colors) ? rule.colors.join(', ') : (rule?.colors || ''),
    segmentsJson: rule?.segmentsJson || '',
    mode: rule?.mode || 'inside',
    ringWidth: rule?.ringWidth || '6',
    offset: rule?.offset || '2',
    minSize: rule?.minSize || '0'
  };
}

export class StyleRuleManager {
  constructor(graphState, renderer) {
    this.graphState = graphState;
    this.renderer = renderer;
    this.rules = graphConfig.styleRules || { nodes: [], links: [] };
    this.rules.nodes = this.rules.nodes || [];
    this.rules.links = this.rules.links || [];
    this.pieRules = graphConfig.pieRules || { nodes: [] };
    this.pieRules.nodes = this.pieRules.nodes || [];
    this.bindElements();
    this.bindEvents();
    this.render();
  }

  bindElements() {
    this.el = {
      styleList: document.getElementById('style-rules-list'),
      pieList: document.getElementById('pie-rules-list'),
      addNodeRule: document.getElementById('style-rule-add-node'),
      addLinkRule: document.getElementById('style-rule-add-link'),
      addPieRule: document.getElementById('pie-rule-add')
    };
  }

  bindEvents() {
    this.el.addNodeRule?.addEventListener('click', () => {
      const rule = ensureStyleRule({}, 'node');
      this.rules.nodes.push(rule);
      this.commitStyleRules();
    });
    this.el.addLinkRule?.addEventListener('click', () => {
      const rule = ensureStyleRule({}, 'link');
      this.rules.links.push(rule);
      this.commitStyleRules();
    });
    this.el.addPieRule?.addEventListener('click', () => {
      const rule = ensurePieRule({});
      this.pieRules.nodes.push(rule);
      this.commitPieRules();
    });

    this.el.styleList?.addEventListener('input', e => this.onStyleRuleInput(e));
    this.el.styleList?.addEventListener('change', e => this.onStyleRuleInput(e));
    this.el.styleList?.addEventListener('click', e => this.onStyleRuleClick(e));

    this.el.pieList?.addEventListener('input', e => this.onPieRuleInput(e));
    this.el.pieList?.addEventListener('change', e => this.onPieRuleInput(e));
    this.el.pieList?.addEventListener('click', e => this.onPieRuleClick(e));

    eventBus.on('style-rules-updated', event => {
      // éviter de rerender pendant la saisie (perte de focus)
      if (event?.detail?.source === 'style-ui-input') return;
      this.rules = graphConfig.styleRules;
      this.renderStyleRules();
    });
    eventBus.on('pie-rules-updated', event => {
      // éviter de rerender pendant la saisie (perte de focus)
      if (event?.detail?.source === 'pie-ui-input') return;
      this.pieRules = graphConfig.pieRules;
      this.renderPieRules();
    });
  }

  render() {
    this.renderStyleRules();
    this.renderPieRules();
  }

  renderStyleRules() {
    if (!this.el.styleList) return;
    const items = [];
    const addCard = (rule, target) => {
      const normalized = ensureStyleRule(rule, target);
      items.push(this.buildStyleRuleCard(normalized));
    };
    (this.rules.nodes || []).forEach(rule => addCard(rule, 'node'));
    (this.rules.links || []).forEach(rule => addCard(rule, 'link'));
    this.el.styleList.innerHTML = items.join('');
  }

  renderPieRules() {
    if (!this.el.pieList) return;
    const items = (this.pieRules.nodes || []).map(rule => {
      const normalized = ensurePieRule(rule);
      return this.buildPieRuleCard(normalized);
    });
    this.el.pieList.innerHTML = items.join('');
  }

  buildStyleRuleCard(rule) {
    const targetLabel = rule.target === 'link' ? 'Lien' : 'Noeud';
    const style = rule.style || {};
    return `
      <div class="rule-card" data-rule-id="${rule.id}" data-target="${rule.target}">
        <div class="rule-header">
          <label class="small">
            <input type="checkbox" data-field="enabled" ${rule.enabled ? 'checked' : ''}> Actif
          </label>
          <span class="badge badge-light">${targetLabel}</span>
          <input class="form-control form-control-sm rule-name" data-field="name" value="${rule.name || ''}" placeholder="Nom regle">
          <input class="form-control form-control-sm rule-priority" data-field="priority" type="number" value="${rule.priority ?? 0}" title="Priorite">
          <button class="btn btn-sm btn-outline-danger" data-action="remove">Supprimer</button>
        </div>
        <div class="rule-row">
          <label class="small">Condition (expression)</label>
          <input class="form-control form-control-sm" data-field="when" value="${rule.when || ''}" placeholder='ex: contains(status,"ok")'>
        </div>
        ${rule.target === 'node' ? `
        <div class="rule-grid">
          <div>
            <label class="small">Couleur</label>
            <div class="color-input">
              <input type="color" class="form-control form-control-sm color-picker" data-color-for="style.fill" value="${this.getColorInputValue(style.fill)}">
              <input class="form-control form-control-sm" data-field="style.fill" value="${style.fill || ''}" placeholder="#ffcc00">
            </div>
          </div>
          <div>
            <label class="small">Contour</label>
            <div class="color-input">
              <input type="color" class="form-control form-control-sm color-picker" data-color-for="style.stroke" value="${this.getColorInputValue(style.stroke)}">
              <input class="form-control form-control-sm" data-field="style.stroke" value="${style.stroke || ''}" placeholder="#333">
            </div>
          </div>
          <div>
            <label class="small">Epaisseur</label>
            <input class="form-control form-control-sm" data-field="style.strokeWidth" value="${style.strokeWidth || ''}" placeholder="1">
          </div>
          <div>
            <label class="small">Opacite</label>
            <input class="form-control form-control-sm" data-field="style.opacity" value="${style.opacity || ''}" placeholder="1">
          </div>
          <div>
            <label class="small">Taille</label>
            <input class="form-control form-control-sm" data-field="style.size" value="${style.size || ''}" placeholder="30">
          </div>
          <div>
            <label class="small">Forme</label>
            <select class="form-control form-control-sm" data-field="style.shape">
              <option value="circle" ${style.shape === 'circle' ? 'selected' : ''}>Cercle</option>
              <option value="rect" ${style.shape === 'rect' ? 'selected' : ''}>Rectangle</option>
            </select>
          </div>
          <div>
            <label class="small">Couleur label</label>
            <div class="color-input">
              <input type="color" class="form-control form-control-sm color-picker" data-color-for="style.labelColor" value="${this.getColorInputValue(style.labelColor)}">
              <input class="form-control form-control-sm" data-field="style.labelColor" value="${style.labelColor || ''}" placeholder="#000">
            </div>
          </div>
        </div>` : `
        <div class="rule-grid">
          <div>
            <label class="small">Couleur lien</label>
            <div class="color-input">
              <input type="color" class="form-control form-control-sm color-picker" data-color-for="style.linkColor" value="${this.getColorInputValue(style.linkColor)}">
              <input class="form-control form-control-sm" data-field="style.linkColor" value="${style.linkColor || ''}" placeholder="#000">
            </div>
          </div>
          <div>
            <label class="small">Largeur</label>
            <input class="form-control form-control-sm" data-field="style.linkWidth" value="${style.linkWidth || ''}" placeholder="2">
          </div>
          <div>
            <label class="small">Opacite</label>
            <input class="form-control form-control-sm" data-field="style.linkOpacity" value="${style.linkOpacity || ''}" placeholder="1">
          </div>
          <div>
            <label class="small">Dasharray</label>
            <input class="form-control form-control-sm" data-field="style.linkDash" value="${style.linkDash || ''}" placeholder="5,3">
          </div>
          <div>
            <label class="small">Couleur label</label>
            <div class="color-input">
              <input type="color" class="form-control form-control-sm color-picker" data-color-for="style.labelColor" value="${this.getColorInputValue(style.labelColor)}">
              <input class="form-control form-control-sm" data-field="style.labelColor" value="${style.labelColor || ''}" placeholder="#000">
            </div>
          </div>
        </div>`}
      </div>
    `;
  }

  buildPieRuleCard(rule) {
    return `
      <div class="rule-card" data-rule-id="${rule.id}" data-target="pie">
        <div class="rule-header">
          <label class="small">
            <input type="checkbox" data-field="enabled" ${rule.enabled ? 'checked' : ''}> Actif
          </label>
          <span class="badge badge-light">Pie chart</span>
          <input class="form-control form-control-sm rule-name" data-field="name" value="${rule.name || ''}" placeholder="Nom regle">
          <input class="form-control form-control-sm rule-priority" data-field="priority" type="number" value="${rule.priority ?? 0}" title="Priorite">
          <button class="btn btn-sm btn-outline-danger" data-action="remove">Supprimer</button>
        </div>
        <div class="rule-row">
          <label class="small">Condition (expression)</label>
          <input class="form-control form-control-sm" data-field="when" value="${rule.when || ''}" placeholder='ex: gt(score,50)'>
        </div>
        <div class="rule-grid">
          <div>
            <label class="small">Champs (option B)</label>
            <input class="form-control form-control-sm" data-field="fields" value="${rule.fields || ''}" placeholder="ex: a,b,c">
          </div>
          <div>
            <label class="small">Couleurs</label>
            <div class="color-input">
              <input type="color" class="form-control form-control-sm color-picker" data-color-append="colors" value="${this.getColorInputValue(this.getFirstColor(rule.colors))}">
              <input class="form-control form-control-sm" data-field="colors" value="${rule.colors || ''}" placeholder="#f00,#0f0,#00f">
            </div>
          </div>
          <div>
            <label class="small">Mode</label>
            <select class="form-control form-control-sm" data-field="mode">
              <option value="inside" ${rule.mode === 'inside' ? 'selected' : ''}>Interieur</option>
              <option value="ring" ${rule.mode === 'ring' ? 'selected' : ''}>Anneau externe</option>
            </select>
          </div>
          <div>
            <label class="small">Epaisseur anneau</label>
            <input class="form-control form-control-sm" data-field="ringWidth" value="${rule.ringWidth || ''}" placeholder="6">
          </div>
          <div>
            <label class="small">Offset anneau</label>
            <input class="form-control form-control-sm" data-field="offset" value="${rule.offset || ''}" placeholder="2">
          </div>
          <div>
            <label class="small">Taille min</label>
            <input class="form-control form-control-sm" data-field="minSize" value="${rule.minSize || ''}" placeholder="0">
          </div>
        </div>
        <div class="rule-row">
          <label class="small">Segments JSON (option A)</label>
          <textarea class="form-control form-control-sm" data-field="segmentsJson" rows="2" placeholder='[{"label":"A","value":10,"color":"#f00"}]'>${rule.segmentsJson || ''}</textarea>
        </div>
      </div>
    `;
  }

  onStyleRuleInput(event) {
    const target = event.target;
    const card = target?.closest('[data-rule-id]');
    const ruleId = card?.dataset?.ruleId;
    const colorFor = target?.dataset?.colorFor;
    const field = target?.dataset?.field || colorFor;
    if (!ruleId || !field) return;
    const rule = this.findStyleRule(ruleId);
    if (!rule) return;

    const value = target.type === 'checkbox' ? target.checked : target.value;
    if (colorFor) {
      const textInput = card?.querySelector(`[data-field="${colorFor}"]`);
      if (textInput && textInput.value !== value) textInput.value = value;
    } else {
      const colorInput = card?.querySelector(`[data-color-for="${field}"]`);
      const hex = this.normalizeHexColor(value);
      if (colorInput && hex) colorInput.value = hex;
    }
    this.setRuleValue(rule, field, value);
    this.commitStyleRules({ source: 'style-ui-input' });
  }

  onStyleRuleClick(event) {
    const btn = event.target.closest('button[data-action]');
    if (!btn) return;
    const ruleId = btn.closest('[data-rule-id]')?.dataset?.ruleId;
    if (!ruleId) return;
    if (btn.dataset.action === 'remove') {
      this.removeStyleRule(ruleId);
    }
  }

  onPieRuleInput(event) {
    const target = event.target;
    const card = target?.closest('[data-rule-id]');
    const ruleId = card?.dataset?.ruleId;
    const colorAppend = target?.dataset?.colorAppend;
    let field = target?.dataset?.field;
    if (!ruleId || (!field && !colorAppend)) return;
    const rule = this.findPieRule(ruleId);
    if (!rule) return;

    if (colorAppend) {
      const textInput = card?.querySelector(`[data-field="${colorAppend}"]`);
      if (textInput) {
        const list = this.parseColorList(textInput.value);
        if (!list.includes(target.value)) list.push(target.value);
        textInput.value = list.join(', ');
        field = colorAppend;
        const value = textInput.value;
        this.setRuleValue(rule, field, value);
        this.commitPieRules({ source: 'pie-ui-input' });
        return;
      }
    }

    const value = target.type === 'checkbox' ? target.checked : target.value;
    if (field === 'colors' && !colorAppend) {
      const colorInput = card?.querySelector('[data-color-append="colors"]');
      const first = this.getFirstColor(value);
      const hex = this.normalizeHexColor(first);
      if (colorInput && hex) colorInput.value = hex;
    }
    this.setRuleValue(rule, field, value);
    this.commitPieRules({ source: 'pie-ui-input' });
  }

  onPieRuleClick(event) {
    const btn = event.target.closest('button[data-action]');
    if (!btn) return;
    const ruleId = btn.closest('[data-rule-id]')?.dataset?.ruleId;
    if (!ruleId) return;
    if (btn.dataset.action === 'remove') {
      this.removePieRule(ruleId);
    }
  }

  setRuleValue(rule, path, value) {
    const parts = path.split('.');
    let obj = rule;
    for (let i = 0; i < parts.length - 1; i++) {
      const key = parts[i];
      if (!obj[key]) obj[key] = {};
      obj = obj[key];
    }
    obj[parts[parts.length - 1]] = value;
  }

  findStyleRule(id) {
    return (this.rules.nodes || []).find(r => r.id === id)
      || (this.rules.links || []).find(r => r.id === id);
  }

  findPieRule(id) {
    return (this.pieRules.nodes || []).find(r => r.id === id);
  }

  removeStyleRule(id) {
    this.rules.nodes = (this.rules.nodes || []).filter(r => r.id !== id);
    this.rules.links = (this.rules.links || []).filter(r => r.id !== id);
    graphConfig.styleRules = this.rules;
    this.commitStyleRules();
  }

  removePieRule(id) {
    this.pieRules.nodes = (this.pieRules.nodes || []).filter(r => r.id !== id);
    graphConfig.pieRules = this.pieRules;
    this.commitPieRules();
  }

  commitStyleRules(opts = {}) {
    graphConfig.styleRules = this.rules;
    eventBus.emit('style-rules-updated', { rules: this.rules, source: opts.source });
    this.renderer.updateGraph();
  }

  commitPieRules(opts = {}) {
    graphConfig.pieRules = this.pieRules;
    eventBus.emit('pie-rules-updated', { rules: this.pieRules, source: opts.source });
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

  getColorInputValue(value) {
    return this.normalizeHexColor(value) || '#000000';
  }

  parseColorList(value) {
    return String(value || '')
      .split(/[,;\n]/)
      .map(s => s.trim())
      .filter(Boolean);
  }

  getFirstColor(value) {
    const list = this.parseColorList(value);
    return list[0] || '';
  }
}
