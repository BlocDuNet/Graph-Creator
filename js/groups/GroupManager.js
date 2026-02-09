import eventBus from '../services/EventBus.js';
import { graphConfig } from '../config/index.js';
import { parseExpression } from '../expr/ExpressionEngine.js';

function uid(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function parseIdList(value) {
  return String(value || '')
    .split(/[,;\n]/)
    .map(s => s.trim())
    .filter(Boolean);
}

function toFiniteNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function sameId(a, b) {
  return String(a ?? '') === String(b ?? '');
}

function normalizeGroupStore(groups) {
  const safe = groups || { nodes: [], links: [] };
  safe.nodes = Array.isArray(safe.nodes) ? safe.nodes : [];
  safe.links = Array.isArray(safe.links) ? safe.links : [];
  return safe;
}

function ensureGroup(group, target) {
  return {
    id: group?.id || uid('group'),
    name: group?.name || (target === 'link' ? 'Groupe lien' : 'Groupe noeud'),
    enabled: group?.enabled !== false,
    target,
    priority: toFiniteNumber(group?.priority, 0),
    when: group?.when || '',
    manualIds: Array.isArray(group?.manualIds) ? group.manualIds.map(v => String(v)) : []
  };
}

function nextOrdinalName(prefix, items) {
  const re = new RegExp(`^${prefix}\\s+(\\d+)$`, 'i');
  let max = 0;
  (items || []).forEach(item => {
    const name = String(item?.name || '').trim();
    const match = name.match(re);
    if (!match) return;
    const n = Number(match[1]);
    if (Number.isFinite(n) && n > max) max = n;
  });
  return `${prefix} ${max + 1}`;
}

function normalizeRef(value) {
  return String(value || '').trim().toLowerCase();
}

function getLiteralText(node) {
  if (!node || node.type !== 'literal') return '';
  return String(node.value ?? '').trim();
}

function walkAst(node, visitor) {
  if (!node || typeof node !== 'object') return;
  visitor(node);
  if (node.type === 'binary') {
    walkAst(node.left, visitor);
    walkAst(node.right, visitor);
    return;
  }
  if (node.type === 'unary') {
    walkAst(node.expr, visitor);
    return;
  }
  if (node.type === 'call') {
    (node.args || []).forEach(arg => walkAst(arg, visitor));
  }
}

export class GroupManager {
  constructor(graphState, renderer) {
    this.graphState = graphState;
    this.renderer = renderer;
    this.groups = normalizeGroupStore(graphConfig.groups);
    this.ensureIds();
    this.conditionRequests = new Map();
    this.expandedCards = new Set();
    this.bindElements();
    this.bindEvents();
    this.render();
  }

  bindElements() {
    const listPrimary = document.getElementById('element-groups-list');
    const listAll = document.getElementById('element-groups-list-all');
    const addNodePrimary = document.getElementById('group-add-node');
    const addNodeAll = document.getElementById('group-add-node-all');
    const addLinkPrimary = document.getElementById('group-add-link');
    const addLinkAll = document.getElementById('group-add-link-all');
    this.el = {
      lists: [listPrimary, listAll].filter(Boolean),
      addNodes: [addNodePrimary, addNodeAll].filter(Boolean),
      addLinks: [addLinkPrimary, addLinkAll].filter(Boolean)
    };
  }

  bindEvents() {
    this.el.addNodes.forEach(btn => {
      btn.addEventListener('click', () => {
        const group = ensureGroup({}, 'node');
        group.name = nextOrdinalName('Groupe noeud', this.groups.nodes);
        this.groups.nodes.push(group);
        this.commitGroups();
      });
    });

    this.el.addLinks.forEach(btn => {
      btn.addEventListener('click', () => {
        const group = ensureGroup({}, 'link');
        group.name = nextOrdinalName('Groupe lien', this.groups.links);
        this.groups.links.push(group);
        this.commitGroups();
      });
    });

    this.el.lists.forEach(list => {
      list.addEventListener('input', e => this.onInput(e));
      list.addEventListener('change', e => this.onInput(e));
      list.addEventListener('click', e => this.onClick(e));
    });

    eventBus.on('group-rules-updated', event => {
      if (event?.detail?.source === 'groups-ui-input') return;
      this.groups = normalizeGroupStore(graphConfig.groups);
      this.ensureIds();
      this.render();
    });

    eventBus.on('style-rules-updated', () => this.render());
    eventBus.on('pie-rules-updated', () => this.render());
    eventBus.on('graph-imported', () => this.render());
    eventBus.on('action-performed', event => {
      const type = event?.detail?.action?.type;
      if (type === 'update_field_schema' || type === 'import_graph') {
        this.render();
      }
    });

    eventBus.on('condition-editor-applied', event => {
      const detail = event?.detail || {};
      const requestId = detail.requestId;
      if (!requestId) return;
      const req = this.conditionRequests.get(requestId);
      if (!req) return;
      this.conditionRequests.delete(requestId);
      const group = this.findGroupById(req.groupId);
      if (!group) return;
      group.when = (detail.expr || '').trim();
      this.commitGroups();
    });

    eventBus.on('condition-editor-cancelled', event => {
      const detail = event?.detail || {};
      if (detail.requestId) this.conditionRequests.delete(detail.requestId);
    });
  }

  ensureIds() {
    const ensure = (list) => {
      (list || []).forEach(group => {
        if (!group || group.id) return;
        group.id = uid('group');
      });
    };
    ensure(this.groups.nodes);
    ensure(this.groups.links);
  }

  render() {
    if (!this.el.lists.length) return;
    this.ensureIds();
    const cards = [];
    (this.groups.nodes || []).forEach(group => cards.push(this.buildCard(ensureGroup(group, 'node'))));
    (this.groups.links || []).forEach(group => cards.push(this.buildCard(ensureGroup(group, 'link'))));
    const html = cards.join('');
    this.el.lists.forEach(list => {
      list.innerHTML = html;
    });
  }

  buildCard(group) {
    const esc = value => this.escapeAttr(value);
    const escText = value => this.escapeText(value);
    const targetLabel = group.target === 'link' ? 'Lien' : 'Noeud';
    const manualText = (group.manualIds || []).join(', ');
    const expanded = this.expandedCards.has(String(group.id || ''));
    const compactWhen = String(group.when || '').trim() || '-';
    const compactManual = (group.manualIds || []).slice(0, 3).join(', ') || '-';
    const references = this.getGroupReferences(group);
    const referencesHtml = references.length
      ? references.map(ref => `
        <div class="group-ref-item">
          <span class="small">${escText(ref.label)}</span>
          <button
            type="button"
            class="btn btn-sm btn-outline-secondary"
            data-ref-edit="1"
            data-ref-kind="${esc(ref.kind)}"
            data-ref-rule-id="${esc(ref.ruleId || '')}"
            data-ref-rule-type="${esc(ref.ruleType || '')}"
            data-ref-group-id="${esc(ref.groupId || '')}"
            data-ref-group-name="${esc(ref.groupName || '')}"
            data-ref-group-target="${esc(ref.groupTarget || '')}"
            data-ref-target="${esc(ref.target || '')}"
            data-ref-field="${esc(ref.field || '')}"
          >Modifier</button>
        </div>
      `).join('')
      : '<div class="small text-muted">Aucune reference</div>';
    return `
      <div class="rule-card${expanded ? ' rule-expanded' : ''}" data-group-id="${esc(group.id)}" data-target="${esc(group.target)}">
        <div class="rule-header">
          <label class="small">
            <input type="checkbox" data-field="enabled" ${group.enabled ? 'checked' : ''}> Actif
          </label>
          <span class="badge badge-light">${targetLabel}</span>
          <input class="form-control form-control-sm rule-name" data-field="name" value="${esc(group.name || '')}" placeholder="Nom groupe">
          <input class="form-control form-control-sm rule-priority" data-field="priority" type="number" value="${esc(group.priority ?? 0)}" title="Priorite">
          <button class="btn btn-sm btn-outline-secondary" data-action="toggle-expand" title="Developper/Reduire">+</button>
          <button class="btn btn-sm btn-outline-danger" data-action="remove">Supprimer</button>
        </div>
        <div class="rule-compact-preview">
          <span><b>Regle:</b> ${escText(compactWhen)}</span>
          <span><b>Priorite:</b> ${escText(group.priority ?? 0)}</span>
          <span><b>IDs:</b> ${escText(compactManual)}</span>
        </div>
        <div class="rule-details">
          <div class="rule-row">
            <label class="small">Regle logique (expression)</label>
            <div class="rule-when">
              <input class="form-control form-control-sm" data-field="when" value="${esc(group.when || '')}" placeholder='ex: eq(type_personne,"personne physique")'>
              <button class="btn btn-sm btn-outline-secondary" data-action="edit-when">Builder</button>
            </div>
          </div>
          <div class="rule-row">
            <label class="small">IDs manuels (${targetLabel.toLowerCase()}s)</label>
            <input class="form-control form-control-sm" data-field="manualIds" value="${esc(manualText)}" placeholder="id1, id2, id3">
            <div class="mt-1 d-flex flex-wrap">
              <button class="btn btn-sm btn-outline-secondary m-1" data-action="add-selected">Ajouter selection</button>
              <button class="btn btn-sm btn-outline-secondary m-1" data-action="clear-manual">Vider manuel</button>
            </div>
          </div>
          <div class="rule-row">
            <label class="small">References</label>
            <div class="group-ref-list">${referencesHtml}</div>
          </div>
        </div>
      </div>
    `;
  }

  getGroupReferences(group) {
    if (!group) return [];
    const out = [];
    const pushRef = (prefix, name, expr, contextTarget, meta = {}) => {
      if (!this.expressionReferencesGroup(expr, group, contextTarget)) return;
      const title = String(name || '').trim() || '(sans nom)';
      out.push({
        label: `${prefix}: ${title}`,
        kind: meta.kind || 'style',
        ruleType: meta.ruleType || '',
        ruleId: meta.ruleId || '',
        groupId: meta.groupId || '',
        groupName: meta.groupName || '',
        groupTarget: meta.groupTarget || '',
        target: meta.target || '',
        field: meta.field || ''
      });
    };

    (graphConfig?.styleRules?.nodes || []).forEach(rule => {
      pushRef('Regle style noeud', rule?.name || rule?.id, rule?.when, 'node', {
        kind: 'rule',
        ruleType: 'style',
        ruleId: rule?.id || ''
      });
    });
    (graphConfig?.styleRules?.links || []).forEach(rule => {
      pushRef('Regle style lien', rule?.name || rule?.id, rule?.when, 'link', {
        kind: 'rule',
        ruleType: 'style',
        ruleId: rule?.id || ''
      });
    });
    (graphConfig?.pieRules?.nodes || []).forEach(rule => {
      pushRef('Regle pie chart', rule?.name || rule?.id, rule?.when, 'node', {
        kind: 'rule',
        ruleType: 'pie',
        ruleId: rule?.id || ''
      });
    });

    const nodeSchema = this.graphState?.schema?.nodes || {};
    Object.keys(nodeSchema).forEach(field => {
      const entry = nodeSchema[field];
      if (entry?.type !== 'conditional') return;
      pushRef('Champ conditionnel noeud', field, entry?.expr, 'node', {
        kind: 'conditional',
        target: 'node',
        field
      });
    });

    const linkSchema = this.graphState?.schema?.links || {};
    Object.keys(linkSchema).forEach(field => {
      const entry = linkSchema[field];
      if (entry?.type !== 'conditional') return;
      pushRef('Champ conditionnel lien', field, entry?.expr, 'link', {
        kind: 'conditional',
        target: 'link',
        field
      });
    });

    (graphConfig?.groups?.nodes || []).forEach(other => {
      if (!other || String(other.id || '') === String(group.id || '')) return;
      pushRef('Groupe noeud', other?.name || other?.id, other?.when, 'node', {
        kind: 'group',
        groupId: other?.id || '',
        groupName: other?.name || '',
        groupTarget: 'node'
      });
    });
    (graphConfig?.groups?.links || []).forEach(other => {
      if (!other || String(other.id || '') === String(group.id || '')) return;
      pushRef('Groupe lien', other?.name || other?.id, other?.when, 'link', {
        kind: 'group',
        groupId: other?.id || '',
        groupName: other?.name || '',
        groupTarget: 'link'
      });
    });

    const seen = new Set();
    return out.filter(ref => {
      const key = `${ref.kind}|${ref.ruleType}|${ref.ruleId}|${ref.groupId}|${ref.groupName}|${ref.target}|${ref.field}|${ref.label}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  expressionReferencesGroup(expr, group, contextTarget) {
    const refs = this.extractGroupRefs(expr);
    if (!refs.length) return false;
    const keys = new Set([
      normalizeRef(group.id),
      normalizeRef(group.name)
    ].filter(Boolean));
    return refs.some(ref => {
      if (!keys.has(normalizeRef(ref.groupRef))) return false;
      const refTarget = ref.scope === 'same' ? contextTarget : ref.scope;
      if (!refTarget || refTarget === 'any') return true;
      return refTarget === group.target;
    });
  }

  extractGroupRefs(expr) {
    const text = String(expr || '').trim();
    if (!text) return [];
    try {
      const ast = parseExpression(text);
      return this.extractGroupRefsFromAst(ast);
    } catch (e) {
      // Fallback permissif si expression partiellement invalide.
      return this.extractGroupRefsFromText(text);
    }
  }

  extractGroupRefsFromAst(ast) {
    const refs = [];
    walkAst(ast, node => {
      if (node?.type !== 'call') return;
      const name = String(node.name || '');
      const g = getLiteralText(node.args?.[0]);
      if (!g) return;

      if (name === 'inGroup') {
        refs.push({ groupRef: g, scope: 'same' });
        return;
      }
      if (name === 'inNodeGroup') {
        refs.push({ groupRef: g, scope: 'node' });
        return;
      }
      if (name === 'inLinkGroup') {
        refs.push({ groupRef: g, scope: 'link' });
        return;
      }
      if (name === 'groupCount') {
        const rawTarget = String(getLiteralText(node.args?.[1]) || 'same').toLowerCase();
        const scope = rawTarget.startsWith('n')
          ? 'node'
          : (rawTarget.startsWith('l') ? 'link' : 'same');
        refs.push({ groupRef: g, scope });
      }
    });
    return refs;
  }

  extractGroupRefsFromText(text) {
    const refs = [];
    const patterns = [
      { re: /inGroup\s*\(\s*["']([^"']+)["']/gi, scope: 'same' },
      { re: /inNodeGroup\s*\(\s*["']([^"']+)["']/gi, scope: 'node' },
      { re: /inLinkGroup\s*\(\s*["']([^"']+)["']/gi, scope: 'link' },
      { re: /groupCount\s*\(\s*["']([^"']+)["'](?:\s*,\s*["']([^"']+)["'])?/gi, scope: 'same', isCount: true }
    ];
    patterns.forEach(pattern => {
      let match = null;
      while ((match = pattern.re.exec(text)) !== null) {
        let scope = pattern.scope;
        if (pattern.isCount) {
          const rawTarget = String(match[2] || '').toLowerCase();
          scope = rawTarget.startsWith('n')
            ? 'node'
            : (rawTarget.startsWith('l') ? 'link' : 'same');
        }
        refs.push({ groupRef: String(match[1] || ''), scope });
      }
    });
    return refs;
  }

  onInput(event) {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const card = target?.closest('[data-group-id]');
    const groupId = card?.dataset?.groupId;
    const field = target?.dataset?.field;
    if (!groupId || !field) return;
    const group = this.findGroupById(groupId);
    if (!group) return;

    const value = target.type === 'checkbox' ? target.checked : target.value;
    if (field === 'manualIds') {
      group.manualIds = parseIdList(value);
    } else if (field === 'priority') {
      group.priority = toFiniteNumber(value, 0);
    } else {
      group[field] = value;
    }
    this.commitGroups({ source: 'groups-ui-input' });
  }

  onClick(event) {
    const refBtn = event.target.closest('button[data-ref-edit]');
    if (refBtn) {
      this.editReference(refBtn.dataset);
      return;
    }

    const btn = event.target.closest('button[data-action]');
    if (!btn) return;
    const card = btn.closest('[data-group-id]');
    const groupId = card?.dataset?.groupId;
    if (!groupId) return;

    const action = btn.dataset.action;
    if (action === 'toggle-expand') {
      this.toggleExpandedCard(groupId);
      return;
    }
    if (action === 'remove') {
      this.removeGroup(groupId);
      return;
    }

    const group = this.findGroupById(groupId);
    if (!group) return;

    if (action === 'edit-when') {
      this.openConditionEditor(group);
      return;
    }

    if (action === 'add-selected') {
      this.addSelectionToGroup(group, card);
      return;
    }

    if (action === 'clear-manual') {
      group.manualIds = [];
      const manualInput = card?.querySelector('[data-field="manualIds"]');
      if (manualInput) manualInput.value = '';
      this.commitGroups();
    }
  }

  editReference(dataset) {
    const kind = String(dataset?.refKind || '');
    if (kind === 'rule') {
      const ruleId = String(dataset?.refRuleId || '');
      const ruleType = String(dataset?.refRuleType || 'style');
      this.jumpToRule(ruleId, ruleType);
      return;
    }
    if (kind === 'group') {
      const groupId = String(dataset?.refGroupId || '');
      const groupName = String(dataset?.refGroupName || '');
      const groupTarget = String(dataset?.refGroupTarget || '');
      this.jumpToGroup(groupId, groupTarget, groupName);
      return;
    }
    if (kind === 'conditional') {
      const target = String(dataset?.refTarget || '');
      const field = String(dataset?.refField || '');
      if (!target || !field) return;
      eventBus.emit('conditional-edit-requested', { target, field });
      return;
    }
  }

  jumpToRule(ruleId, type) {
    if (!ruleId) return;

    const topTab = document.querySelector('.nav-link[href="#tab7"]');
    topTab?.click();

    const subTabHref = type === 'pie' ? '#tab7-rules-pie' : '#tab7-rules-style';
    const subTab = document.querySelector(`.nav-link[href="${subTabHref}"]`);
    subTab?.click();

    const highlight = () => {
      const primaryId = type === 'pie' ? 'pie-rules-list' : 'style-rules-list';
      const fallbackId = type === 'pie' ? 'pie-rules-list-all' : 'style-rules-list-all';
      const containers = [document.getElementById(primaryId), document.getElementById(fallbackId)].filter(Boolean);
      const visible = containers.find(container => {
        const pane = container.closest('.tab-pane');
        return pane?.classList.contains('active') || container.offsetParent !== null;
      });
      const ordered = visible
        ? [visible].concat(containers.filter(c => c !== visible))
        : containers;
      let match = null;
      ordered.some(container => {
        match = Array.from(container.querySelectorAll('[data-rule-id]'))
          .find(card => String(card.dataset.ruleId) === String(ruleId)) || null;
        return !!match;
      });
      if (!match) return false;
      match.classList.add('rule-expanded');
      match.scrollIntoView({ behavior: 'smooth', block: 'center' });
      match.classList.add('rule-card-highlight');
      setTimeout(() => match.classList.remove('rule-card-highlight'), 1200);
      return true;
    };

    if (!highlight()) {
      setTimeout(highlight, 120);
      setTimeout(highlight, 260);
    }
  }

  jumpToGroup(groupId, target, groupName = '') {
    if (!groupId && !groupName) return;

    const topTab = document.querySelector('.nav-link[href="#tab7"]');
    topTab?.click();

    const subTab = document.querySelector('.nav-link[href="#tab7-rules-groups"]');
    subTab?.click();

    const highlight = () => {
      const idRef = String(groupId || '').trim();
      const nameRef = String(groupName || '').trim().toLowerCase();
      const containers = [
        document.getElementById('element-groups-list'),
        document.getElementById('element-groups-list-all')
      ].filter(Boolean);
      const visible = containers.find(container => {
        const pane = container.closest('.tab-pane');
        return pane?.classList.contains('active') || container.offsetParent !== null;
      });
      const ordered = visible
        ? [visible].concat(containers.filter(c => c !== visible))
        : containers;

      const findInContainer = (container, strictTarget = true, byName = false) => {
        return Array.from(container.querySelectorAll('[data-group-id]')).find(card => {
          const cardTarget = String(card.dataset.target || '');
          if (strictTarget && target && cardTarget !== String(target)) return false;
          if (byName) {
            const inputName = String(card.querySelector('[data-field="name"]')?.value || '')
              .trim()
              .toLowerCase();
            return !!nameRef && inputName === nameRef;
          }
          if (!idRef) return false;
          return String(card.dataset.groupId) === idRef;
        }) || null;
      };

      let match = null;
      ordered.some(container => {
        match = findInContainer(container, true, false);
        return !!match;
      });
      if (!match) {
        ordered.some(container => {
          match = findInContainer(container, false, false);
          return !!match;
        });
      }
      if (!match && nameRef) {
        ordered.some(container => {
          match = findInContainer(container, true, true);
          return !!match;
        });
      }
      if (!match && nameRef) {
        ordered.some(container => {
          match = findInContainer(container, false, true);
          return !!match;
        });
      }
      if (!match) return false;
      match.classList.add('rule-expanded');
      match.scrollIntoView({ behavior: 'smooth', block: 'center' });
      match.classList.add('rule-card-highlight');
      setTimeout(() => match.classList.remove('rule-card-highlight'), 1200);
      return true;
    };

    if (!highlight()) {
      setTimeout(highlight, 120);
      setTimeout(highlight, 260);
    }
  }

  toggleExpandedCard(groupId) {
    const id = String(groupId || '');
    if (!id) return;
    if (this.expandedCards.has(id)) this.expandedCards.delete(id);
    else this.expandedCards.add(id);
    this.el.lists.forEach(list => {
      Array.from(list.querySelectorAll('[data-group-id]'))
        .filter(card => String(card.dataset.groupId) === id)
        .forEach(card => {
          card.classList.toggle('rule-expanded', this.expandedCards.has(id));
        });
    });
  }

  addSelectionToGroup(group, card) {
    const selected = group.target === 'link'
      ? this.graphState.selectedLink
      : this.graphState.selectedNode;
    if (!selected?.id) return;
    const id = String(selected.id);
    const manual = Array.isArray(group.manualIds) ? group.manualIds.map(v => String(v)) : [];
    if (!manual.includes(id)) {
      manual.push(id);
      group.manualIds = manual;
      const manualInput = card?.querySelector('[data-field="manualIds"]');
      if (manualInput) manualInput.value = manual.join(', ');
      this.commitGroups();
    }
  }

  openConditionEditor(group) {
    const requestId = uid('cond-group');
    this.conditionRequests.set(requestId, { groupId: group.id });
    eventBus.emit('condition-editor-requested', {
      requestId,
      target: group.target,
      expr: group.when || '',
      title: `Groupe: ${group.name || ''}`.trim()
    });
  }

  findGroupById(id) {
    return (this.groups.nodes || []).find(g => sameId(g?.id, id))
      || (this.groups.links || []).find(g => sameId(g?.id, id));
  }

  removeGroup(id) {
    this.groups.nodes = (this.groups.nodes || []).filter(g => !sameId(g?.id, id));
    this.groups.links = (this.groups.links || []).filter(g => !sameId(g?.id, id));
    this.commitGroups();
  }

  commitGroups(opts = {}) {
    graphConfig.groups = this.groups;
    eventBus.emit('group-rules-updated', { rules: this.groups, source: opts.source });
    this.renderer.updateGraph();
  }

  escapeAttr(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  escapeText(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}
