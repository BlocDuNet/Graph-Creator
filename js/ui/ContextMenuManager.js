import { performAction } from '../state/undo_redo.js';
import { graphConfig } from '../config/index.js';
import eventBus from '../services/EventBus.js';
import {
  CONTEXT_MENU_CONTEXTS,
  CONTEXT_MENU_DEFINITIONS,
  createDefaultContextMenuConfig,
  normalizeContextMenuConfig
} from '../services/ContextMenuConfigService.js';

function cloneValue(value) {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (e) {
    return value;
  }
}

function valuesEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a && typeof a === 'object' && b && typeof b === 'object') {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch (e) {
      return false;
    }
  }
  return false;
}

function uniqueById(items) {
  const seen = new Set();
  const out = [];
  (items || []).forEach(item => {
    if (!item || item.id == null) return;
    const id = String(item.id);
    if (seen.has(id)) return;
    seen.add(id);
    out.push(item);
  });
  return out;
}

function openBootstrapTab(href) {
  const tab = document.querySelector(`.nav-link[href="${href}"]`);
  if (!tab) return null;
  tab.click();
  if (window.$) {
    window.$(tab).tab('show');
  }
  return tab;
}

export class ContextMenuManager {
  constructor(graphState, renderer, interactionManager, uiManager) {
    this.graphState = graphState;
    this.renderer = renderer;
    this.interactionManager = interactionManager;
    this.uiManager = uiManager;
    this.svg = renderer?.svg || d3.select('svg');

    this.menuRoot = null;
    this.menuPanel = null;
    this.currentContext = 'canvas';
    this.currentTargetNode = null;
    this.currentTargetLink = null;
    this.lastGraphPoint = null;
    this.visible = false;

    this.configHost = document.getElementById('context-menu-config-list');
    this.resetBtn = document.getElementById('context-menu-config-reset');

    this.ensureConfig();
    this.createMenuDom();
    this.bindMenuEvents();
    this.bindConfigEvents();
    this.renderConfigEditor();
  }

  ensureConfig() {
    graphConfig.contextMenu = normalizeContextMenuConfig(graphConfig.contextMenu);
  }

  createMenuDom() {
    this.menuRoot = document.createElement('div');
    this.menuRoot.className = 'graph-context-menu';
    this.menuRoot.style.display = 'none';

    this.menuPanel = document.createElement('div');
    this.menuPanel.className = 'graph-context-menu-panel';
    this.menuRoot.appendChild(this.menuPanel);

    document.body.appendChild(this.menuRoot);
  }

  bindMenuEvents() {
    this.svg.on('contextmenu.context-menu', event => this.handleContextMenu(event));

    document.addEventListener('click', event => {
      if (!this.visible) return;
      if (this.menuRoot.contains(event.target)) return;
      this.hideMenu();
    });

    window.addEventListener('keydown', event => {
      if (event.key === 'Escape') this.hideMenu();
    });
    window.addEventListener('resize', () => this.hideMenu());
    window.addEventListener('blur', () => this.hideMenu());

    eventBus.on('context-menu-config-updated', () => {
      this.ensureConfig();
      this.renderConfigEditor();
      if (this.visible) this.hideMenu();
    });
  }

  bindConfigEvents() {
    if (this.resetBtn) {
      this.resetBtn.addEventListener('click', () => {
        graphConfig.contextMenu = createDefaultContextMenuConfig();
        this.commitConfig('context-menu-reset');
      });
    }

    if (!this.configHost) return;

    this.configHost.addEventListener('change', event => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const role = target.dataset.role;
      const contextId = target.dataset.context;
      const path = target.dataset.path;
      if (!role || !contextId || !path) return;
      const entry = this.getConfigEntry(contextId, path);
      if (!entry?.item) return;

      if (role === 'visible') {
        entry.item.visible = !!target.checked;
      } else if (role === 'enabled') {
        entry.item.enabled = !!target.checked;
      } else if (role === 'default-child') {
        entry.item.defaultChildId = String(target.value || '');
      } else {
        return;
      }

      this.commitConfig('context-menu-ui');
    });

    this.configHost.addEventListener('click', event => {
      const button = event.target.closest('button[data-role]');
      if (!button) return;
      const role = button.dataset.role;
      if (!['move-up', 'move-down'].includes(role)) return;
      const contextId = button.dataset.context;
      const path = button.dataset.path;
      if (!contextId || !path) return;

      const entry = this.getConfigEntry(contextId, path);
      if (!entry?.parentArray || entry.index == null) return;

      const arr = entry.parentArray;
      const idx = entry.index;
      if (role === 'move-up' && idx > 0) {
        [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
      } else if (role === 'move-down' && idx < arr.length - 1) {
        [arr[idx + 1], arr[idx]] = [arr[idx], arr[idx + 1]];
      } else {
        return;
      }

      this.commitConfig('context-menu-ui');
    });
  }

  commitConfig(source = 'context-menu') {
    graphConfig.contextMenu = normalizeContextMenuConfig(graphConfig.contextMenu);
    eventBus.emit('context-menu-config-updated', {
      config: graphConfig.contextMenu,
      source
    });
  }

  handleContextMenu(event) {
    event.preventDefault();
    event.stopPropagation();

    this.ensureConfig();
    this.lastGraphPoint = this.getGraphPoint(event);

    const targetData = this.resolveTargetData(event.target);
    this.prepareSelectionForContext(targetData);

    this.currentTargetNode = targetData.node;
    this.currentTargetLink = targetData.link;
    this.currentContext = this.resolveContext(targetData);

    const items = this.buildMenuItems(this.currentContext);
    if (!items.length) {
      this.hideMenu();
      return;
    }

    this.renderMenu(this.currentContext, items);
    this.showMenuAt(event.clientX, event.clientY);
  }

  resolveTargetData(target) {
    const nodeElement = target?.closest?.('.node');
    if (nodeElement) {
      const nodeData = d3.select(nodeElement).datum();
      return { node: nodeData || null, link: null };
    }

    const linkElement = target?.closest?.('.link, .link-label');
    if (linkElement) {
      const linkData = d3.select(linkElement).datum();
      return { node: null, link: linkData || null };
    }

    return { node: null, link: null };
  }

  prepareSelectionForContext(targetData) {
    const total = this.getSelectionCount();
    if (targetData.node) {
      const isSelected = this.graphState.isNodeSelected(targetData.node);
      if (!isSelected || total <= 1) {
        this.graphState.selectNode(targetData.node, { clearLinks: true, autoFocus: false });
        this.emitSelectionEvents();
        this.renderer.updateGraph();
      }
      return;
    }
    if (targetData.link) {
      const isSelected = this.graphState.isLinkSelected(targetData.link);
      if (!isSelected || total <= 1) {
        this.graphState.selectLink(targetData.link, { clearNodes: true, autoFocus: false });
        this.emitSelectionEvents();
        this.renderer.updateGraph();
      }
    }
  }

  resolveContext(targetData) {
    if (this.getSelectionCount() > 1) return 'multi';
    if (targetData.node) return 'node';
    if (targetData.link) return 'link';
    return 'canvas';
  }

  buildMenuItems(contextId) {
    const defs = CONTEXT_MENU_DEFINITIONS[contextId] || [];
    const cfgItems = graphConfig.contextMenu?.contexts?.[contextId] || [];
    const defById = new Map(defs.map(item => [String(item.id), item]));

    const buildFromConfig = (items, map, parentDef = null) => {
      const out = [];
      (items || []).forEach(cfg => {
        if (!cfg || cfg.visible === false) return;
        const def = map.get(String(cfg.id));
        if (!def) return;

        const runtimeEnabled = this.isActionRuntimeEnabled(def.id);
        const menuItem = {
          id: String(def.id),
          label: String(def.label || def.id),
          enabled: cfg.enabled !== false && runtimeEnabled
        };

        if (Array.isArray(def.children) && def.children.length) {
          const childMap = new Map(def.children.map(child => [String(child.id), child]));
          const childCfg = Array.isArray(cfg.children) ? cfg.children : [];
          const children = buildFromConfig(childCfg, childMap, def);
          if (!children.length) return;
          menuItem.children = children;
          menuItem.defaultChildId = String(cfg.defaultChildId || def.defaultChildId || children[0].id);
          if (!children.some(child => child.id === menuItem.defaultChildId)) {
            menuItem.defaultChildId = children[0].id;
          }
          menuItem.enabled = menuItem.enabled && children.some(child => child.enabled);
        }

        if (parentDef && parentDef.id === 'create-linked-node' && !this.getNodesForLinkedCreation().length) {
          menuItem.enabled = false;
        }

        out.push(menuItem);
      });
      return out;
    };

    return buildFromConfig(cfgItems, defById);
  }

  renderMenu(contextId, items) {
    this.menuPanel.innerHTML = '';

    const title = document.createElement('div');
    title.className = 'graph-context-menu-title';
    const contextLabel = CONTEXT_MENU_CONTEXTS.find(ctx => ctx.id === contextId)?.label || contextId;
    title.textContent = `Menu: ${contextLabel}`;
    this.menuPanel.appendChild(title);

    items.forEach(item => {
      this.menuPanel.appendChild(this.buildMenuEntry(item));
    });
  }

  buildMenuEntry(item) {
    const wrapper = document.createElement('div');
    wrapper.className = 'context-menu-entry';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'context-menu-button';
    button.textContent = item.label;
    button.disabled = !item.enabled;
    wrapper.appendChild(button);

    if (Array.isArray(item.children) && item.children.length) {
      wrapper.classList.add('has-children');

      const arrow = document.createElement('span');
      arrow.className = 'context-menu-arrow';
      arrow.textContent = '>';
      button.appendChild(arrow);

      const submenu = document.createElement('div');
      submenu.className = 'context-submenu';
      item.children.forEach(child => submenu.appendChild(this.buildMenuEntry(child)));
      wrapper.appendChild(submenu);

      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        if (!item.enabled) return;
        const defaultChild = this.pickDefaultChild(item);
        if (!defaultChild) return;
        this.executeAction(defaultChild.id);
      });

      return wrapper;
    }

    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      if (!item.enabled) return;
      this.executeAction(item.id);
    });

    return wrapper;
  }

  pickDefaultChild(parentItem) {
    const children = Array.isArray(parentItem.children) ? parentItem.children : [];
    if (!children.length) return null;
    const preferred = children.find(child => child.id === parentItem.defaultChildId && child.enabled);
    if (preferred) return preferred;
    return children.find(child => child.enabled) || null;
  }

  showMenuAt(clientX, clientY) {
    this.menuRoot.style.display = 'block';
    this.menuRoot.style.left = '0px';
    this.menuRoot.style.top = '0px';

    const panelRect = this.menuPanel.getBoundingClientRect();
    const maxX = window.innerWidth - panelRect.width - 8;
    const maxY = window.innerHeight - panelRect.height - 8;
    const x = Math.max(8, Math.min(clientX, maxX));
    const y = Math.max(8, Math.min(clientY, maxY));

    this.menuRoot.style.left = `${x}px`;
    this.menuRoot.style.top = `${y}px`;
    this.visible = true;
  }

  hideMenu() {
    if (!this.menuRoot) return;
    this.menuRoot.style.display = 'none';
    this.visible = false;
  }

  getGraphPoint(event) {
    if (this.interactionManager?.updateLastPointer) {
      this.interactionManager.updateLastPointer(event);
    }
    if (this.interactionManager?.getGraphPoint) {
      const point = this.interactionManager.getGraphPoint(event);
      if (Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1])) {
        return point;
      }
    }
    const svgElement = this.svg?.node();
    if (!svgElement) return null;
    const rect = svgElement.getBoundingClientRect();
    const local = [event.clientX - rect.left, event.clientY - rect.top];
    const transform = d3.zoomTransform(svgElement);
    const adjusted = transform ? transform.invert(local) : local;
    if (Array.isArray(adjusted) && Number.isFinite(adjusted[0]) && Number.isFinite(adjusted[1])) {
      return adjusted;
    }
    return null;
  }

  getFallbackGraphPoint() {
    if (Array.isArray(this.lastGraphPoint)) return this.lastGraphPoint;
    const svgElement = this.svg?.node();
    if (!svgElement) return [0, 0];
    const centerLocal = [svgElement.clientWidth / 2, svgElement.clientHeight / 2];
    const transform = d3.zoomTransform(svgElement);
    return transform ? transform.invert(centerLocal) : centerLocal;
  }

  executeAction(actionId) {
    switch (actionId) {
      case 'create-node-here':
        this.actionCreateNodeHere();
        break;
      case 'select-all':
        this.actionSelectAll();
        break;
      case 'auto-layout':
        this.renderer.simulation?.alpha(1).restart();
        break;
      case 'reset-zoom':
        this.renderer.resetZoom?.();
        break;
      case 'import-json':
        document.getElementById('import-json')?.click();
        break;
      case 'export-json':
        document.getElementById('export-json')?.click();
        break;
      case 'export-image':
        document.getElementById('export-image')?.click();
        break;

      case 'rename-node':
        this.actionFocusNode(true);
        break;
      case 'edit-node':
        this.actionFocusNode(false);
        this.openValuesTab();
        break;
      case 'create-link-from-node':
        this.actionFocusNode(false);
        break;
      case 'duplicate-node':
        this.actionDuplicateNode();
        break;
      case 'lock-node':
        this.actionLockNode(true);
        break;
      case 'unlock-node':
        this.actionLockNode(false);
        break;
      case 'highlight-neighbors':
        this.actionHighlightNeighbors();
        break;
      case 'add-node-to-group':
        this.actionFocusNode(false);
        this.openGroupsTab();
        break;
      case 'delete-node':
        this.actionDeleteNode();
        break;

      case 'rename-link':
        this.actionFocusLink(true);
        break;
      case 'edit-link':
        this.actionFocusLink(false);
        this.openValuesTab();
        break;
      case 'reverse-link':
        this.actionReverseLink();
        break;
      case 'duplicate-link':
        this.actionDuplicateLink();
        break;
      case 'add-link-to-group':
        this.actionFocusLink(false);
        this.openGroupsTab();
        break;
      case 'delete-link':
        this.actionDeleteLink();
        break;

      case 'selected-to-new':
      case 'new-to-selected':
      case 'bidirectional-to-selected':
        this.actionCreateLinkedNode(actionId);
        break;
      case 'edit-batch':
        this.openValuesTab();
        break;
      case 'apply-common-style':
        this.openValuesTab();
        break;
      case 'add-selection-to-group':
        this.openGroupsTab();
        break;
      case 'align-left':
      case 'align-right':
      case 'align-top':
      case 'align-bottom':
        this.actionAlign(actionId);
        break;
      case 'distribute-horizontal':
      case 'distribute-vertical':
        this.actionDistribute(actionId);
        break;
      case 'lock-selected':
        this.actionLockSelection(true);
        break;
      case 'unlock-selected':
        this.actionLockSelection(false);
        break;
      case 'duplicate-selection':
        this.actionDuplicateSelection();
        break;
      case 'delete-selection':
        this.actionDeleteSelection();
        break;
      default:
        break;
    }

    this.hideMenu();
  }

  actionCreateNodeHere() {
    const [x, y] = this.getFallbackGraphPoint();
    const node = this.graphState.createNode(x, y);
    this.interactionManager?.pinNewNode?.(node);
    this.graphState.selectNode(node, { clearLinks: true, autoFocus: true });
    this.emitSelectionEvents();
    eventBus.emit('node-created', { node });
    this.renderer.updateGraph();
  }

  actionSelectAll() {
    this.graphState.setSelection({
      nodes: this.graphState.nodes.slice(),
      links: this.graphState.links.slice(),
      activeNode: this.graphState.nodes[0] || null,
      activeLink: this.graphState.links[0] || null
    });
    this.emitSelectionEvents();
    this.renderer.updateGraph();
  }

  actionFocusNode(autoFocus = true) {
    const node = this.getActionNode();
    if (!node) return;
    this.graphState.selectNode(node, { clearLinks: true, autoFocus });
    this.emitSelectionEvents();
    this.renderer.updateGraph();
  }

  actionFocusLink(autoFocus = true) {
    const link = this.getActionLink();
    if (!link) return;
    this.graphState.selectLink(link, { clearNodes: true, autoFocus });
    this.emitSelectionEvents();
    this.renderer.updateGraph();
  }

  actionDuplicateNode() {
    const node = this.getActionNode();
    if (!node) return;
    const duplicate = this.duplicateNode(node, 40, 40);
    if (!duplicate) return;
    this.graphState.selectNode(duplicate, { clearLinks: true, autoFocus: false });
    this.emitSelectionEvents();
    this.renderer.updateGraph();
  }

  actionLockNode(lock = true) {
    const node = this.getActionNode();
    if (!node) return;
    this.setNodeLock(node, lock);
    this.renderer.updateGraph();
  }

  actionHighlightNeighbors() {
    const node = this.getActionNode();
    if (!node) return;
    this.renderer.highlightNeighbors(node);
  }

  actionDeleteNode() {
    const node = this.getActionNode();
    if (!node) return;
    this.graphState.deleteNode(node);
    this.graphState.clearSelection();
    this.emitSelectionEvents();
    this.renderer.updateGraph();
  }

  actionReverseLink() {
    const link = this.getActionLink();
    if (!link) return;
    const source = link.source;
    const target = link.target;
    performAction({
      type: 'composite',
      actions: [
        {
          type: 'update_link',
          data: {
            linkId: link.id,
            field: 'source',
            from: source,
            to: target,
            label: `Reverse link source (${source?.id} -> ${target?.id})`
          }
        },
        {
          type: 'update_link',
          data: {
            linkId: link.id,
            field: 'target',
            from: target,
            to: source,
            label: `Reverse link target (${target?.id} -> ${source?.id})`
          }
        }
      ],
      label: `Reverse link ${link.id}`
    });
    this.renderer.updateGraph();
  }

  actionDuplicateLink() {
    const link = this.getActionLink();
    if (!link) return;
    const duplicate = this.duplicateLink(link, link.source, link.target);
    if (!duplicate) return;
    this.graphState.selectLink(duplicate, { clearNodes: true, autoFocus: false });
    this.emitSelectionEvents();
    this.renderer.updateGraph();
  }

  actionDeleteLink() {
    const link = this.getActionLink();
    if (!link) return;
    this.graphState.deleteLink(link);
    this.graphState.clearSelection();
    this.emitSelectionEvents();
    this.renderer.updateGraph();
  }

  actionCreateLinkedNode(mode) {
    const selectedNodes = this.getNodesForLinkedCreation();
    if (!selectedNodes.length) return;
    const [x, y] = this.getFallbackGraphPoint();
    const newNode = this.graphState.createNode(x, y);
    this.interactionManager?.pinNewNode?.(newNode);

    selectedNodes.forEach(node => {
      if (mode === 'selected-to-new' || mode === 'bidirectional-to-selected') {
        this.graphState.createLink(node, newNode);
      }
      if (mode === 'new-to-selected' || mode === 'bidirectional-to-selected') {
        this.graphState.createLink(newNode, node);
      }
    });

    this.graphState.selectNode(newNode, { clearLinks: true, autoFocus: false });
    this.emitSelectionEvents();
    eventBus.emit('node-created', { node: newNode });
    this.renderer.updateGraph();
  }

  actionAlign(mode) {
    const nodes = this.getSelectedNodes();
    if (nodes.length < 2) return;
    const xs = nodes.map(node => Number(node.x) || 0);
    const ys = nodes.map(node => Number(node.y) || 0);
    const valueX = mode === 'align-left' ? Math.min(...xs) : Math.max(...xs);
    const valueY = mode === 'align-top' ? Math.min(...ys) : Math.max(...ys);

    nodes.forEach(node => {
      if (mode === 'align-left' || mode === 'align-right') {
        this.commitNodePosition(node, valueX, null, 'Align selection');
      } else {
        this.commitNodePosition(node, null, valueY, 'Align selection');
      }
    });
    this.renderer.updateGraph();
  }

  actionDistribute(mode) {
    const nodes = this.getSelectedNodes();
    if (nodes.length < 3) return;

    const horizontal = mode === 'distribute-horizontal';
    const sorted = nodes.slice().sort((a, b) => horizontal ? (a.x - b.x) : (a.y - b.y));
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const start = horizontal ? Number(first.x) || 0 : Number(first.y) || 0;
    const end = horizontal ? Number(last.x) || 0 : Number(last.y) || 0;
    const step = (end - start) / (sorted.length - 1);

    sorted.forEach((node, index) => {
      if (index === 0 || index === sorted.length - 1) return;
      const next = start + (step * index);
      if (horizontal) {
        this.commitNodePosition(node, next, null, 'Distribute nodes');
      } else {
        this.commitNodePosition(node, null, next, 'Distribute nodes');
      }
    });
    this.renderer.updateGraph();
  }

  actionLockSelection(lock = true) {
    this.getSelectedNodes().forEach(node => this.setNodeLock(node, lock));
    this.renderer.updateGraph();
  }

  actionDuplicateSelection() {
    const selectedNodes = this.getSelectedNodes();
    const selectedLinks = this.getSelectedLinks();
    if (!selectedNodes.length && !selectedLinks.length) return;

    const nodeMap = new Map();
    selectedNodes.forEach(node => {
      const duplicate = this.duplicateNode(node, 40, 40);
      if (duplicate) nodeMap.set(String(node.id), duplicate);
    });

    let linksToDuplicate = selectedLinks.slice();
    if (!linksToDuplicate.length && selectedNodes.length) {
      const selectedIds = new Set(selectedNodes.map(node => String(node.id)));
      linksToDuplicate = this.graphState.links.filter(link => {
        return selectedIds.has(String(link?.source?.id)) && selectedIds.has(String(link?.target?.id));
      });
    }

    const duplicatedLinks = [];
    linksToDuplicate.forEach(link => {
      const newSource = nodeMap.get(String(link.source.id)) || link.source;
      const newTarget = nodeMap.get(String(link.target.id)) || link.target;
      const duplicate = this.duplicateLink(link, newSource, newTarget);
      if (duplicate) duplicatedLinks.push(duplicate);
    });

    const duplicatedNodes = Array.from(nodeMap.values());
    this.graphState.setSelection({
      nodes: duplicatedNodes,
      links: duplicatedLinks,
      activeNode: duplicatedNodes[0] || null,
      activeLink: duplicatedLinks[0] || null
    });
    this.emitSelectionEvents();
    this.renderer.updateGraph();
  }

  actionDeleteSelection() {
    const selectedNodes = this.getSelectedNodes();
    const selectedLinks = this.getSelectedLinks();
    let didDelete = false;

    const deletedNodeIds = new Set();
    selectedNodes.forEach(node => {
      if (!node?.id) return;
      this.graphState.deleteNode(node);
      deletedNodeIds.add(String(node.id));
      didDelete = true;
    });

    selectedLinks
      .filter(link => {
        const sourceId = String(link?.source?.id ?? '');
        const targetId = String(link?.target?.id ?? '');
        return !deletedNodeIds.has(sourceId) && !deletedNodeIds.has(targetId);
      })
      .forEach(link => {
        if (!link?.id) return;
        this.graphState.deleteLink(link);
        didDelete = true;
      });

    if (!didDelete) return;
    this.graphState.clearSelection();
    this.emitSelectionEvents();
    this.renderer.updateGraph();
  }

  duplicateNode(sourceNode, dx = 40, dy = 40) {
    if (!sourceNode) return null;
    const x = (Number(sourceNode.x) || 0) + dx;
    const y = (Number(sourceNode.y) || 0) + dy;
    const duplicate = this.graphState.createNode(x, y);
    this.copyNodeFields(sourceNode, duplicate);
    return duplicate;
  }

  duplicateLink(sourceLink, sourceNode, targetNode) {
    if (!sourceLink || !sourceNode || !targetNode) return null;
    const duplicate = this.graphState.createLink(sourceNode, targetNode);
    this.copyLinkFields(sourceLink, duplicate);
    return duplicate;
  }

  copyNodeFields(sourceNode, targetNode) {
    const { xField = 'x', yField = 'y' } = this.graphState.globalSettings || {};
    const blocked = new Set([
      'id', 'x', 'y', xField, yField, 'fx', 'fy', 'vx', 'vy', 'index',
      '__renderSize', '__style', '__pie', '__hitRadius', 'initialPosition'
    ]);

    Object.keys(sourceNode || {}).forEach(field => {
      if (blocked.has(field)) return;
      if (String(field).startsWith('__') && !['__localStyle', '__localStyleEnabled'].includes(field)) return;
      const from = cloneValue(targetNode[field]);
      const to = cloneValue(sourceNode[field]);
      if (valuesEqual(from, to)) return;
      performAction({
        type: 'update_node',
        data: {
          nodeId: targetNode.id,
          field,
          from,
          to,
          label: `Copy node field ${field}`
        }
      });
    });
  }

  copyLinkFields(sourceLink, targetLink) {
    const blocked = new Set([
      'id', 'source', 'target', 'index', 'isLoop', 'curvature',
      '__style', '__renderWidth'
    ]);

    Object.keys(sourceLink || {}).forEach(field => {
      if (blocked.has(field)) return;
      if (String(field).startsWith('__') && !['__localStyle', '__localStyleEnabled'].includes(field)) return;
      const from = cloneValue(targetLink[field]);
      const to = cloneValue(sourceLink[field]);
      if (valuesEqual(from, to)) return;
      performAction({
        type: 'update_link',
        data: {
          linkId: targetLink.id,
          field,
          from,
          to,
          label: `Copy link field ${field}`
        }
      });
    });
  }

  setNodeLock(node, lock) {
    if (!node?.id) return;
    if (lock) {
      this.updateNodeField(node, 'fx', Number(node.x) || 0, 'Lock node');
      this.updateNodeField(node, 'fy', Number(node.y) || 0, 'Lock node');
    } else {
      this.updateNodeField(node, 'fx', null, 'Unlock node');
      this.updateNodeField(node, 'fy', null, 'Unlock node');
    }
  }

  commitNodePosition(node, newX, newY, label = 'Move selection') {
    if (!node?.id) return;
    const { xField = 'x', yField = 'y' } = this.graphState.globalSettings || {};

    if (Number.isFinite(newX)) {
      const oldX = Number(node[xField] ?? node.x);
      if (!valuesEqual(oldX, newX)) {
        this.updateNodeField(node, xField, newX, `${label} x`);
      }
      node.x = newX;
      if (xField !== 'x') node[xField] = newX;
      if (node.fx != null) node.fx = newX;
    }

    if (Number.isFinite(newY)) {
      const oldY = Number(node[yField] ?? node.y);
      if (!valuesEqual(oldY, newY)) {
        this.updateNodeField(node, yField, newY, `${label} y`);
      }
      node.y = newY;
      if (yField !== 'y') node[yField] = newY;
      if (node.fy != null) node.fy = newY;
    }
  }

  updateNodeField(node, field, to, label) {
    const from = cloneValue(node[field]);
    if (valuesEqual(from, to)) return;
    performAction({
      type: 'update_node',
      data: {
        nodeId: node.id,
        field,
        from,
        to,
        label
      }
    });
  }

  getNodesForLinkedCreation() {
    const selectedNodes = this.getSelectedNodes();
    if (selectedNodes.length) return selectedNodes;
    const selectedLinks = this.getSelectedLinks();
    if (!selectedLinks.length) return [];
    const nodes = [];
    selectedLinks.forEach(link => {
      if (link?.source) nodes.push(link.source);
      if (link?.target) nodes.push(link.target);
    });
    return uniqueById(nodes);
  }

  isActionRuntimeEnabled(actionId) {
    const selectedNodes = this.getSelectedNodes();
    const selectedLinks = this.getSelectedLinks();
    const total = selectedNodes.length + selectedLinks.length;
    const hasNode = !!this.getActionNode();
    const hasLink = !!this.getActionLink();

    switch (actionId) {
      case 'rename-node':
      case 'edit-node':
      case 'create-link-from-node':
      case 'duplicate-node':
      case 'lock-node':
      case 'unlock-node':
      case 'highlight-neighbors':
      case 'add-node-to-group':
      case 'delete-node':
        return hasNode;

      case 'rename-link':
      case 'edit-link':
      case 'reverse-link':
      case 'duplicate-link':
      case 'add-link-to-group':
      case 'delete-link':
        return hasLink;

      case 'create-linked-node':
      case 'selected-to-new':
      case 'new-to-selected':
      case 'bidirectional-to-selected':
        return this.getNodesForLinkedCreation().length > 0;

      case 'edit-batch':
      case 'apply-common-style':
      case 'add-selection-to-group':
      case 'duplicate-selection':
      case 'delete-selection':
        return total > 1;

      case 'align-left':
      case 'align-right':
      case 'align-top':
      case 'align-bottom':
      case 'distribute-horizontal':
      case 'distribute-vertical':
        return selectedNodes.length >= 2;

      case 'lock-selected':
      case 'unlock-selected':
        return selectedNodes.length >= 1;

      default:
        return true;
    }
  }

  openValuesTab() {
    openBootstrapTab('#tab2');
  }

  openGroupsTab() {
    openBootstrapTab('#tab7');
    openBootstrapTab('#tab7-rules-groups');
  }

  getActionNode() {
    if (this.currentTargetNode && this.graphState.isNodeSelected(this.currentTargetNode)) {
      return this.currentTargetNode;
    }
    return this.getPrimarySelectedNode();
  }

  getActionLink() {
    if (this.currentTargetLink && this.graphState.isLinkSelected(this.currentTargetLink)) {
      return this.currentTargetLink;
    }
    return this.getPrimarySelectedLink();
  }

  getSelectedNodes() {
    if (typeof this.graphState.getSelectedNodes === 'function') return this.graphState.getSelectedNodes();
    return this.graphState.selectedNode ? [this.graphState.selectedNode] : [];
  }

  getSelectedLinks() {
    if (typeof this.graphState.getSelectedLinks === 'function') return this.graphState.getSelectedLinks();
    return this.graphState.selectedLink ? [this.graphState.selectedLink] : [];
  }

  getPrimarySelectedNode() {
    if (typeof this.graphState.getPrimarySelectedNode === 'function') return this.graphState.getPrimarySelectedNode();
    return this.graphState.selectedNode || null;
  }

  getPrimarySelectedLink() {
    if (typeof this.graphState.getPrimarySelectedLink === 'function') return this.graphState.getPrimarySelectedLink();
    return this.graphState.selectedLink || null;
  }

  getSelectionCount() {
    return this.getSelectedNodes().length + this.getSelectedLinks().length;
  }

  emitSelectionEvents() {
    const nodes = this.getSelectedNodes();
    const links = this.getSelectedLinks();
    if (!nodes.length && !links.length) {
      eventBus.emit('selection-cleared');
      return;
    }
    if (nodes.length) {
      eventBus.emit('node-selected', { node: this.getPrimarySelectedNode(), nodes });
    }
    if (links.length) {
      eventBus.emit('link-selected', { link: this.getPrimarySelectedLink(), links });
    }
  }

  renderConfigEditor() {
    if (!this.configHost) return;
    this.ensureConfig();
    this.configHost.innerHTML = '';

    CONTEXT_MENU_CONTEXTS.forEach(context => {
      const block = document.createElement('div');
      block.className = 'context-menu-config-context';

      const title = document.createElement('div');
      title.className = 'context-menu-config-title';
      title.textContent = context.label;
      block.appendChild(title);

      const header = document.createElement('div');
      header.className = 'context-menu-config-row context-menu-config-header';
      header.innerHTML = `
        <span class="context-menu-config-col context-menu-config-col-label">Action</span>
        <span class="context-menu-config-col">Afficher</span>
        <span class="context-menu-config-col">Actif</span>
        <span class="context-menu-config-col">Ordre</span>
      `;
      block.appendChild(header);

      const items = graphConfig.contextMenu?.contexts?.[context.id] || [];
      const defs = CONTEXT_MENU_DEFINITIONS[context.id] || [];
      this.renderConfigRows(context.id, items, defs, block, 0, '');

      this.configHost.appendChild(block);
    });
  }

  renderConfigRows(contextId, items, defs, parent, level, basePath) {
    (items || []).forEach((item, index) => {
      const path = basePath ? `${basePath}.${index}` : `${index}`;
      const def = (defs || []).find(definition => String(definition.id) === String(item.id));
      if (!def) return;

      const row = document.createElement('div');
      row.className = 'context-menu-config-row';

      const label = document.createElement('span');
      label.className = 'context-menu-config-col context-menu-config-col-label';
      label.style.paddingLeft = `${level * 16}px`;
      label.textContent = level > 0 ? `- ${def.label}` : def.label;
      row.appendChild(label);

      const visible = document.createElement('input');
      visible.type = 'checkbox';
      visible.checked = item.visible !== false;
      visible.dataset.role = 'visible';
      visible.dataset.context = contextId;
      visible.dataset.path = path;
      row.appendChild(visible);

      const enabled = document.createElement('input');
      enabled.type = 'checkbox';
      enabled.checked = item.enabled !== false;
      enabled.dataset.role = 'enabled';
      enabled.dataset.context = contextId;
      enabled.dataset.path = path;
      row.appendChild(enabled);

      const order = document.createElement('div');
      order.className = 'context-menu-config-order';
      const upBtn = document.createElement('button');
      upBtn.type = 'button';
      upBtn.className = 'btn btn-sm btn-outline-secondary';
      upBtn.textContent = '^';
      upBtn.dataset.role = 'move-up';
      upBtn.dataset.context = contextId;
      upBtn.dataset.path = path;
      order.appendChild(upBtn);

      const downBtn = document.createElement('button');
      downBtn.type = 'button';
      downBtn.className = 'btn btn-sm btn-outline-secondary';
      downBtn.textContent = 'v';
      downBtn.dataset.role = 'move-down';
      downBtn.dataset.context = contextId;
      downBtn.dataset.path = path;
      order.appendChild(downBtn);

      row.appendChild(order);
      parent.appendChild(row);

      if (Array.isArray(item.children) && item.children.length && Array.isArray(def.children)) {
        const defaultRow = document.createElement('div');
        defaultRow.className = 'context-menu-config-row context-menu-config-default';
        const defaultLabel = document.createElement('span');
        defaultLabel.className = 'context-menu-config-col context-menu-config-col-label';
        defaultLabel.style.paddingLeft = `${(level + 1) * 16}px`;
        defaultLabel.textContent = 'Action par defaut du sous-menu';
        defaultRow.appendChild(defaultLabel);

        const defaultSelect = document.createElement('select');
        defaultSelect.className = 'form-control form-control-sm';
        defaultSelect.dataset.role = 'default-child';
        defaultSelect.dataset.context = contextId;
        defaultSelect.dataset.path = path;
        defaultSelect.innerHTML = def.children
          .map(child => `<option value="${child.id}">${child.label}</option>`)
          .join('');
        defaultSelect.value = item.defaultChildId || item.children[0]?.id || '';
        defaultRow.appendChild(defaultSelect);
        parent.appendChild(defaultRow);

        this.renderConfigRows(contextId, item.children, def.children, parent, level + 1, path);
      }
    });
  }

  getConfigEntry(contextId, path) {
    const indexes = String(path)
      .split('.')
      .map(v => Number.parseInt(v, 10))
      .filter(Number.isFinite);
    if (!indexes.length) return null;

    let parentArray = graphConfig.contextMenu?.contexts?.[contextId];
    if (!Array.isArray(parentArray)) return null;
    let item = null;

    for (let i = 0; i < indexes.length; i++) {
      const idx = indexes[i];
      if (!Array.isArray(parentArray) || idx < 0 || idx >= parentArray.length) return null;
      item = parentArray[idx];
      if (i === indexes.length - 1) {
        return { item, parentArray, index: idx };
      }
      parentArray = item.children;
    }
    return null;
  }
}
