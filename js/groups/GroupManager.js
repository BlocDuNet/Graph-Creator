import eventBus from '../services/EventBus.js';
import { graphConfig } from '../config/index.js';

function uid(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function parseIdList(value) {
  return String(value || '')
    .split(/[,;\n]/)
    .map(s => s.trim())
    .filter(Boolean);
}

function ensureGroup(group, target) {
  return {
    id: group?.id || uid('group'),
    name: group?.name || (target === 'link' ? 'Groupe lien' : 'Groupe noeud'),
    enabled: group?.enabled !== false,
    target,
    priority: Number(group?.priority ?? 0),
    when: group?.when || '',
    manualIds: Array.isArray(group?.manualIds) ? group.manualIds.map(v => String(v)) : []
  };
}

export class GroupManager {
  constructor(graphState, renderer) {
    this.graphState = graphState;
    this.renderer = renderer;
    this.groups = graphConfig.groups || { nodes: [], links: [] };
    this.groups.nodes = this.groups.nodes || [];
    this.groups.links = this.groups.links || [];
    this.ensureIds();
    this.conditionRequests = new Map();
    this.bindElements();
    this.bindEvents();
    this.render();
  }

  bindElements() {
    this.el = {
      list: document.getElementById('element-groups-list'),
      addNode: document.getElementById('group-add-node'),
      addLink: document.getElementById('group-add-link')
    };
  }

  bindEvents() {
    this.el.addNode?.addEventListener('click', () => {
      this.groups.nodes.push(ensureGroup({}, 'node'));
      this.commitGroups();
    });

    this.el.addLink?.addEventListener('click', () => {
      this.groups.links.push(ensureGroup({}, 'link'));
      this.commitGroups();
    });

    this.el.list?.addEventListener('input', e => this.onInput(e));
    this.el.list?.addEventListener('change', e => this.onInput(e));
    this.el.list?.addEventListener('click', e => this.onClick(e));

    eventBus.on('group-rules-updated', event => {
      if (event?.detail?.source === 'groups-ui-input') return;
      this.groups = graphConfig.groups || { nodes: [], links: [] };
      this.groups.nodes = this.groups.nodes || [];
      this.groups.links = this.groups.links || [];
      this.ensureIds();
      this.render();
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
    if (!this.el.list) return;
    this.ensureIds();
    const cards = [];
    (this.groups.nodes || []).forEach(group => cards.push(this.buildCard(ensureGroup(group, 'node'))));
    (this.groups.links || []).forEach(group => cards.push(this.buildCard(ensureGroup(group, 'link'))));
    this.el.list.innerHTML = cards.join('');
  }

  buildCard(group) {
    const esc = value => this.escapeAttr(value);
    const targetLabel = group.target === 'link' ? 'Lien' : 'Noeud';
    const manualText = (group.manualIds || []).join(', ');
    return `
      <div class="rule-card" data-group-id="${esc(group.id)}" data-target="${esc(group.target)}">
        <div class="rule-header">
          <label class="small">
            <input type="checkbox" data-field="enabled" ${group.enabled ? 'checked' : ''}> Actif
          </label>
          <span class="badge badge-light">${targetLabel}</span>
          <input class="form-control form-control-sm rule-name" data-field="name" value="${esc(group.name || '')}" placeholder="Nom groupe">
          <input class="form-control form-control-sm rule-priority" data-field="priority" type="number" value="${esc(group.priority ?? 0)}" title="Priorite">
          <button class="btn btn-sm btn-outline-danger" data-action="remove">Supprimer</button>
        </div>
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
      </div>
    `;
  }

  onInput(event) {
    const target = event.target;
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
      group.priority = Number(value || 0);
    } else {
      group[field] = value;
    }
    this.commitGroups({ source: 'groups-ui-input' });
  }

  onClick(event) {
    const btn = event.target.closest('button[data-action]');
    if (!btn) return;
    const card = btn.closest('[data-group-id]');
    const groupId = card?.dataset?.groupId;
    if (!groupId) return;

    const action = btn.dataset.action;
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
    return (this.groups.nodes || []).find(g => g.id === id)
      || (this.groups.links || []).find(g => g.id === id);
  }

  removeGroup(id) {
    this.groups.nodes = (this.groups.nodes || []).filter(g => g.id !== id);
    this.groups.links = (this.groups.links || []).filter(g => g.id !== id);
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
}
