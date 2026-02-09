/**
 * Manages the global graph state and provides methods to manipulate it.
 */
import { performAction } from './undo_redo.js';
import { graphConfig } from '../config/index.js';
import {
  normalizeType,
  inferTypeFromValues,
  getDefaultValueForType,
  isValueValid
} from '../services/FieldTypeService.js';
import {
  evaluateExpression,
  parseExpression,
  inferExpressionType,
  serializeToFunctional
} from '../expr/ExpressionEngine.js';

const INTERNAL_NODE_FIELDS = new Set(['vx', 'vy', 'fx', 'fy', 'index']);

export class GraphState {
  constructor() {
    // Initialize with default data.
    this.nodes = [
      // Use fx and fy to fix initial positions.
      { id: '1', name: 'Node1', description: 'Description1', x: 100, y: 300, size: 30, fx: 100, fy: 300 },
      { id: '2', name: 'Node2', description: 'Description2', x: 200, y: 200, size: 30, fx: 200, fy: 200 },
      { id: '3', name: 'Node3', description: 'Description3', x: 300, y: 300, size: 30, fx: 300, fy: 300 }
    ];
    
    // Initialize links with direct references to node objects.
    this.links = [];
    
    // Counters for IDs.
    this.nextNodeId = this.nodes.length + 1;
    this.nextLinkId = 1;
    
    // Selection state.
    this.selectedNode = null;
    this.selectedLink = null;
    this.selectedNodes = [];
    this.selectedLinks = [];
    
    // Global configuration.
    this.globalSettings = {
      nodeIdField: "id",
      nodeLabelField: "name",
      linkLabelField: "",
      nodeSizeField: "",
      xField: "x",
      yField: "y",
      defaultNodeSize: 30,
      defaultLinkWidth: 5,
      defaultFocusField: "name",
      multilingualEnabled: false,
      multilingualLangs: "fr,en",
      currentLanguage: "fr"
    };
    
    // Initialize links after creating nodes.
    this.initializeLinks();

    // Type schema for fields.
    this.schema = { nodes: {}, links: {} };
    this.initializeSchema();
    this.groupAstCache = new Map();

    // Update ID counters from current data.
    this.syncNextIds();
  }
  
  /**
   * Initialize links with references to node objects.
   */
  initializeLinks() {
    // Get nodes by ID.
    const getNodeById = (id) => this.nodes.find(n => n.id === id);
    
    // Create links with direct references.
    const linksData = [
      { id: '1', name: 'Link1', description: 'Description1', source: '1', target: '2', width: this.globalSettings.defaultLinkWidth },
      { id: '2', name: 'Link2', description: 'Description2', source: '2', target: '3', width: this.globalSettings.defaultLinkWidth }
    ];
    
    // Convert ID references to object references.
    this.links = linksData.map(link => ({
      ...link,
      source: getNodeById(link.source),
      target: getNodeById(link.target)
    }));
  }
  
  /**
   * Create a new node at the specified position.
   */
  createNode(x, y) {
    let id = String(this.nextNodeId++);
    while (this.nodes.find(n => String(n.id) === id)) {
      id = String(this.nextNodeId++);
    }
    const nx = Number(x);
    const ny = Number(y);
    let finalX = Number.isFinite(nx) ? nx : null;
    let finalY = Number.isFinite(ny) ? ny : null;
    if ((!Number.isFinite(finalX) || !Number.isFinite(finalY)) && Array.isArray(this.lastPointer)) {
      const lpX = Number(this.lastPointer[0]);
      const lpY = Number(this.lastPointer[1]);
      if (!Number.isFinite(finalX) && Number.isFinite(lpX)) finalX = lpX;
      if (!Number.isFinite(finalY) && Number.isFinite(lpY)) finalY = lpY;
    }
    if (!Number.isFinite(finalX)) finalX = 0;
    if (!Number.isFinite(finalY)) finalY = 0;
    const newNode = {
      id,
      name: `Node${id}`,
      description: `Description${id}`,
      x: finalX,
      y: finalY,
      size: this.globalSettings.defaultNodeSize || 30
    };

    // Add missing fields according to the schema.
    Object.keys(this.schema.nodes).forEach(field => {
      if (INTERNAL_NODE_FIELDS.has(field)) return;
      if (newNode[field] === undefined) {
        newNode[field] = getDefaultValueForType(this.getFieldType('node', field));
      }
    });

    // If the user uses custom coordinate fields,
    // initialize those fields with the created position.
    const { xField, yField } = this.globalSettings;
    if (xField && xField !== 'x') newNode[xField] = finalX;
    if (yField && yField !== 'y') newNode[yField] = finalY;
    
    performAction({ 
      type: "create_node", 
      data: { 
        node: newNode, 
        label: `Create node ${newNode.name}` 
      } 
    });
    
    return newNode;
  }

  _computeNextId(items) {
    let found = false;
    let max = 0;
    (items || []).forEach(item => {
      const raw = item?.id;
      const num = Number.parseInt(raw, 10);
      if (Number.isFinite(num)) {
        found = true;
        if (num > max) max = num;
      }
    });
    if (found) return max + 1;
    return (items?.length || 0) + 1;
  }

  syncNextIds() {
    this.nextNodeId = this._computeNextId(this.nodes);
    this.nextLinkId = this._computeNextId(this.links);
  }
  
  /**
   * Delete a node from the graph.
   */
  deleteNode(node) {
    const relatedLinks = this.links.filter(link => 
      link.source.id === node.id || link.target.id === node.id
    );
    
    performAction({ 
      type: "delete_node", 
      data: { 
        node, 
        relatedLinks, 
        label: `Delete node (${node[this.globalSettings.nodeLabelField] || node.name})` 
      } 
    });
  }
  
  /**
   * Create a new link between two nodes.
   */
  createLink(source, target) {
    const id = String(this.nextLinkId++);
    const newLink = { 
      id, 
      name: `Link${id}`, 
      description: `Description${id}`, 
      source, 
      target,
      width: this.globalSettings.defaultLinkWidth
    };

    Object.keys(this.schema.links).forEach(field => {
      if (newLink[field] === undefined) {
        newLink[field] = getDefaultValueForType(this.getFieldType('link', field));
      }
    });
    
    performAction({ 
      type: "create_link", 
      data: { 
        link: newLink, 
        label: `Create link (${source[this.globalSettings.nodeLabelField] || source.name} ? ${target[this.globalSettings.nodeLabelField] || target.name})` 
      } 
    });
    
    return newLink;
  }
  
  /**
   * Delete a link from the graph.
   */
  deleteLink(link) {
    performAction({ 
      type: "delete_link", 
      data: { 
        link, 
        label: `Delete link (${link.name})` 
      } 
    });
  }
  
  /**
   * Update a node with a new value.
   */
  updateNodeField(nodeId, field, newValue) {
    const node = this.nodes.find(n => n.id === nodeId);
    if (!node) return;
    
    const oldValue = node[field] || "";
    if (newValue === oldValue) return;
    
    performAction({
      type: "update_node",
      data: {
        nodeId,
        field,
        from: oldValue,
        to: newValue,
        label: `Update node ${field} (${oldValue} ? ${newValue})`
      }
    });
  }
  
  /**
   * Update a link with a new value.
   */
  updateLinkField(linkId, field, newValue) {
    const link = this.links.find(l => l.id === linkId);
    if (!link) return;
    
    const oldValue = link[field] || "";
    if (newValue === oldValue) return;
    
    performAction({
      type: "update_link",
      data: {
        linkId,
        field,
        from: oldValue,
        to: newValue,
        label: `Update link ${field} (${oldValue} ? ${newValue})`
      }
    });
  }
  
  /**
   * Add a field to all nodes or links.
   */
  addField(fieldName, target) {
    return this.addFieldWithType(fieldName, target, 'text');
  }

  /**
   * Add a field with a type to all nodes or links.
   */
  addFieldWithType(fieldName, target, fieldType) {
    if (fieldName.trim() === '') return;

    const data = target === 'node' ? this.nodes : this.links;
    const existingKeys = data.length > 0 ? Object.keys(data[0]) : [];
    const normalizedType = normalizeType(fieldType);
    const defaultValue = getDefaultValueForType(normalizedType);

    const languages = (this.globalSettings.multilingualLangs || "")
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    if (this.globalSettings.multilingualEnabled && languages.length > 0) {
      const fieldsToAdd = languages
        .map(lang => `${fieldName}_${lang}`)
        .filter(f => !existingKeys.includes(f));

      if (fieldsToAdd.length === 0) return;

      const actions = fieldsToAdd.map(f => ({
        type: "add_field",
        data: {
          field: f,
          target,
          fieldType: normalizedType,
          defaultValue,
          label: `Add field ${f} to ${target}s`
        }
      }));
      performAction({ type: "composite", actions });
      return;
    }

    if (existingKeys.includes(fieldName)) return;

    performAction({
      type: "add_field",
      data: {
        field: fieldName,
        target,
        fieldType: normalizedType,
        defaultValue,
        label: `Add field ${fieldName} to ${target}s`
      }
    });
  }

  /**
   * Initialize type schema from data and known defaults.
   */
  initializeSchema() {
    const defaults = {
      nodes: {
        id: 'text',
        name: 'text',
        description: 'text',
        x: 'number',
        y: 'number',
        size: 'number'
      },
      links: {
        id: 'text',
        source: 'object',
        target: 'object',
        name: 'text',
        description: 'text',
        width: 'number'
      }
    };
    Object.keys(defaults.nodes).forEach(f => {
      this.schema.nodes[f] = { type: normalizeType(defaults.nodes[f]) };
    });
    Object.keys(defaults.links).forEach(f => {
      this.schema.links[f] = { type: normalizeType(defaults.links[f]) };
    });

    this.ensureSchemaForItems('node', this.nodes);
    this.ensureSchemaForItems('link', this.links);
  }

  getSchemaGroup(target) {
    return target === 'node' ? this.schema.nodes : this.schema.links;
  }

  ensureSchemaForItems(target, items) {
    const group = this.getSchemaGroup(target);
    (items || []).forEach(item => {
      Object.keys(item || {}).forEach(field => {
        if (field.startsWith('__')) return;
        if (!group[field]) {
          const values = (items || []).map(i => i[field]);
          group[field] = { type: inferTypeFromValues(values) };
        }
      });
    });
  }

  getFieldType(target, field) {
    const group = this.getSchemaGroup(target);
    if (!group[field]) {
      const items = target === 'node' ? this.nodes : this.links;
      const values = (items || []).map(i => i[field]);
      group[field] = { type: inferTypeFromValues(values) };
    }
    return normalizeType(group[field].type);
  }

  setFieldTypeInternal(target, field, type) {
    const group = this.getSchemaGroup(target);
    const current = group[field] || {};
    const nextType = normalizeType(type);
    group[field] = { ...current, type: nextType };
  }

  getFieldResolvedType(target, field) {
    const group = this.getSchemaGroup(target);
    const entry = group[field];
    if (!entry) return this.getFieldType(target, field);
    const base = normalizeType(entry.type);
    if (base === 'conditional') {
      const rawResult = entry.resultType;
      let resolved = normalizeType(rawResult || 'text');
      if (!rawResult || rawResult === 'auto') {
        let ast = entry.ast;
        if (!ast && entry.expr) {
          try {
            ast = parseExpression(entry.expr);
          } catch (e) {
            ast = null;
          }
        }
        if (ast) {
          const inferred = inferExpressionType(ast, name => this.getFieldResolvedType(target, name)).type;
          resolved = normalizeType(inferred || resolved || 'text');
        }
      }
      return resolved === 'number_comma' ? 'number' : resolved;
    }
    if (base === 'number_comma') return 'number';
    return base;
  }

  getFieldSchema(target, field) {
    const group = this.getSchemaGroup(target);
    if (!group[field]) {
      this.getFieldType(target, field);
    }
    return group[field];
  }

  updateFieldSchema(target, field, nextEntry) {
    const group = this.getSchemaGroup(target);
    const current = group[field] || { type: 'text' };
    performAction({
      type: "update_field_schema",
      data: {
        target,
        field,
        from: { ...current },
        to: { ...current, ...nextEntry },
        label: `Update ${target} field schema ${field}`
      }
    });
  }

  resolveFieldValue(target, item, field, stack = []) {
    if (!item || !field) return '';
    const entry = this.getFieldSchema(target, field);
    const baseType = normalizeType(entry?.type);
    if (baseType !== 'conditional') {
      return item[field];
    }
    const key = `${target}:${field}:${item.id}`;
    if (stack.includes(key)) return '';
    const nextStack = stack.concat([key]);
    let ast = entry?.ast || null;
    if (!ast && entry?.expr) {
      try {
        ast = parseExpression(entry.expr);
      } catch (e) {
        return '';
      }
    }
    if (!ast) return '';
    const ctx = {
      graph: this,
      target,
      item,
      getField: name => this.resolveFieldValue(target, item, name, nextStack)
    };
    try {
      return evaluateExpression(ast, ctx);
    } catch (e) {
      return '';
    }
  }

  buildConditionalSchema(target, field, exprText, ast, resultType, visual) {
    const inferred = ast ? inferExpressionType(ast, name => this.getFieldResolvedType(target, name)).type : 'text';
    const finalType = normalizeType(resultType || inferred || 'text');
    return {
      type: 'conditional',
      expr: exprText || (ast ? serializeToFunctional(ast) : ''),
      ast,
      resultType: finalType,
      visual
    };
  }

  updateFieldType(target, field, type) {
    const newType = normalizeType(type);
    const oldType = this.getFieldType(target, field);
    if (newType === oldType) return;
    performAction({
      type: "update_field_type",
      data: {
        target,
        field,
        from: oldType,
        to: newType,
        label: `Update ${target} field type ${field} (${oldType} ?' ${newType})`
      }
    });
  }

  getSchemaSnapshot() {
    return JSON.parse(JSON.stringify(this.schema));
  }

  validateField(target, field, typeOverride = null) {
    const entry = this.getFieldSchema(target, field);
    const baseType = normalizeType(typeOverride || entry?.type || this.getFieldType(target, field));
    const isConditional = baseType === 'conditional';
    const resolvedType = isConditional ? normalizeType(entry?.resultType || 'text') : baseType;
    const items = target === 'node' ? this.nodes : this.links;
    const invalidIds = [];
    items.forEach(item => {
      if (!item) return;
      const value = isConditional
        ? this.resolveFieldValue(target, item, field)
        : item[field];
      if (value === null || value === undefined || value === '') return;
      if (!isValueValid(value, resolvedType)) invalidIds.push(item.id);
    });
    return { invalidCount: invalidIds.length, invalidIds, total: items.length };
  }

  /**
   * Convert existing fields to multilingual variants (suffixes).
   */
  convertFieldsToMultilingual(fields, target, baseLang = "") {
    const langs = (this.globalSettings.multilingualLangs || "")
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    if (!langs.length) return;

    const data = target === 'node' ? this.nodes : this.links;
    const existingKeys = data.length > 0 ? Object.keys(data[0]) : [];

    const actions = [];
    fields.forEach(base => {
      const baseType = this.getFieldType(target, base);
      langs.forEach(lang => {
        const fieldLang = `${base}_${lang}`;
        if (!existingKeys.includes(fieldLang)) {
          actions.push({
            type: "add_field",
            data: {
              field: fieldLang,
              target,
              fieldType: baseType,
              defaultValue: getDefaultValueForType(baseType),
              label: `Add field ${fieldLang} to ${target}s`
            }
          });
        }
      });
    });

    const copyLang = baseLang && langs.includes(baseLang) ? baseLang : langs[0];
    data.forEach(item => {
      fields.forEach(base => {
        const baseVal = item[base];
        if (baseVal == null || baseVal === '') return;
        const fieldLang = `${base}_${copyLang}`;
        if (item[fieldLang] == null || item[fieldLang] === '') {
          actions.push({
            type: target === 'node' ? "update_node" : "update_link",
            data: target === 'node'
              ? { nodeId: item.id, field: fieldLang, from: "", to: baseVal, label: `Set ${fieldLang}` }
              : { linkId: item.id, field: fieldLang, from: "", to: baseVal, label: `Set ${fieldLang}` }
          });
        }
      });
    });

    if (actions.length) {
      performAction({ type: "composite", actions, label: "Convert fields to multilingual" });
    }
  }

  /**
   * Convert multilingual fields (suffixes) to a unilingual field.
   */
  convertFieldsToUnilingual(fields, target, lang) {
    const chosen = (lang || "").trim();
    if (!chosen) return;

    const data = target === 'node' ? this.nodes : this.links;
    const actions = [];

    data.forEach(item => {
      fields.forEach(base => {
        const src = item[`${base}_${chosen}`];
        if (src == null) return;
        actions.push({
          type: target === 'node' ? "update_node" : "update_link",
          data: target === 'node'
            ? { nodeId: item.id, field: base, from: item[base] ?? "", to: src, label: `Set ${base} from ${base}_${chosen}` }
            : { linkId: item.id, field: base, from: item[base] ?? "", to: src, label: `Set ${base} from ${base}_${chosen}` }
        });
      });
    });

    if (actions.length) {
      performAction({ type: "composite", actions, label: "Convert fields to unilingual" });
    }
  }
  
  /**
   * Remove a field from all nodes or links.
   */
  removeField(fieldName, target) {
    performAction({ 
      type: "remove_field", 
      data: { 
        field: fieldName, 
        target,
        oldType: this.getFieldType(target, fieldName),
        label: `Remove field ${fieldName} from ${target}s` 
      } 
    });
  }
  
  /**
   * Update a global configuration setting.
   */
  updateGlobalSetting(field, value) {
    const oldValue = this.globalSettings[field];
    if (value === oldValue) return;
    
    performAction({ 
      type: "update_global", 
      data: { 
        field, 
        from: oldValue, 
        to: value, 
        label: `Update global setting ${field} (${oldValue} ? ${value})` 
      } 
    });
    
    this.globalSettings[field] = value;
  }
  
  /**
   * Import a full graph.
   */
  importGraph(newGraph) {
    const oldState = {
      nodes: [...this.nodes],
      links: [...this.links],
      schema: this.getSchemaSnapshot()
    };
    
    performAction({
      type: "import_graph",
      data: { 
        oldState,
        newState: newGraph,
        label: "Import graph" 
      }
    });
  }
  
  /**
   * Normalize and deduplicate selected nodes.
   */
  normalizeSelectedNodes(nodes) {
    const map = new Map((this.nodes || []).map(node => [String(node.id), node]));
    const selected = [];
    (nodes || []).forEach(node => {
      if (!node || node.id == null) return;
      const normalized = map.get(String(node.id));
      if (!normalized) return;
      if (!selected.some(item => String(item.id) === String(normalized.id))) {
        selected.push(normalized);
      }
    });
    return selected;
  }

  /**
   * Normalize and deduplicate selected links.
   */
  normalizeSelectedLinks(links) {
    const map = new Map((this.links || []).map(link => [String(link.id), link]));
    const selected = [];
    (links || []).forEach(link => {
      if (!link || link.id == null) return;
      const normalized = map.get(String(link.id));
      if (!normalized) return;
      if (!selected.some(item => String(item.id) === String(normalized.id))) {
        selected.push(normalized);
      }
    });
    return selected;
  }

  /**
   * Set full selection (nodes + links) in one operation.
   */
  setSelection({ nodes = this.selectedNodes, links = this.selectedLinks, activeNode = null, activeLink = null } = {}) {
    this.selectedNodes = this.normalizeSelectedNodes(nodes);
    this.selectedLinks = this.normalizeSelectedLinks(links);

    if (activeNode && this.selectedNodes.some(node => String(node.id) === String(activeNode.id))) {
      this.selectedNode = this.selectedNodes.find(node => String(node.id) === String(activeNode.id)) || this.selectedNodes[0] || null;
    } else {
      this.selectedNode = this.selectedNodes[0] || null;
    }

    if (activeLink && this.selectedLinks.some(link => String(link.id) === String(activeLink.id))) {
      this.selectedLink = this.selectedLinks.find(link => String(link.id) === String(activeLink.id)) || this.selectedLinks[0] || null;
    } else {
      this.selectedLink = this.selectedLinks[0] || null;
    }
  }

  /**
   * Select a node.
   */
  selectNode(node, options = {}) {
    if (!node) return;
    const { additive = false, toggle = false, clearLinks = false } = options;
    const current = this.normalizeSelectedNodes(this.selectedNodes);
    const nodeId = String(node.id);
    const exists = current.some(item => String(item.id) === nodeId);

    let nextNodes = current;
    let activeNode = node;

    if (toggle) {
      if (exists) {
        nextNodes = current.filter(item => String(item.id) !== nodeId);
        activeNode = nextNodes[nextNodes.length - 1] || null;
      } else {
        nextNodes = current.concat([node]);
      }
    } else if (additive) {
      if (!exists) nextNodes = current.concat([node]);
    } else {
      nextNodes = [node];
    }

    const nextLinks = clearLinks ? [] : this.selectedLinks;
    this.setSelection({ nodes: nextNodes, links: nextLinks, activeNode, activeLink: this.selectedLink });

    console.log(`noeud selectionn: ${node.id}`);
  }
  
  /**
   * Select a link.
   * @param {Object} link - Le lien  selectionner
   */
  selectLink(link, options = {}) {
    if (!link || typeof link !== 'object') {
      console.error("Tentative de selection d'un lien invalide:", link);
      return;
    }
    const { additive = false, toggle = false, clearNodes = false } = options;
    const current = this.normalizeSelectedLinks(this.selectedLinks);
    const linkId = String(link.id);
    const exists = current.some(item => String(item.id) === linkId);

    let nextLinks = current;
    let activeLink = link;

    if (toggle) {
      if (exists) {
        nextLinks = current.filter(item => String(item.id) !== linkId);
        activeLink = nextLinks[nextLinks.length - 1] || null;
      } else {
        nextLinks = current.concat([link]);
      }
    } else if (additive) {
      if (!exists) nextLinks = current.concat([link]);
    } else {
      nextLinks = [link];
    }

    const nextNodes = clearNodes ? [] : this.selectedNodes;
    this.setSelection({ nodes: nextNodes, links: nextLinks, activeNode: this.selectedNode, activeLink });
    
    console.log("Lien selectionn:", link);
  }
  
  /**
   * Toggle node membership in the current selection.
   */
  toggleNodeSelection(node) {
    this.selectNode(node, { toggle: true });
  }

  /**
   * Toggle link membership in the current selection.
   */
  toggleLinkSelection(link) {
    this.selectLink(link, { toggle: true });
  }

  /**
   * Check if a node is selected.
   */
  isNodeSelected(node) {
    if (!node || node.id == null) return false;
    return this.selectedNodes.some(item => String(item.id) === String(node.id));
  }

  /**
   * Check if a link is selected.
   */
  isLinkSelected(link) {
    if (!link || link.id == null) return false;
    return this.selectedLinks.some(item => String(item.id) === String(link.id));
  }

  /**
   * Return selected nodes.
   */
  getSelectedNodes() {
    return this.normalizeSelectedNodes(this.selectedNodes);
  }

  /**
   * Return selected links.
   */
  getSelectedLinks() {
    return this.normalizeSelectedLinks(this.selectedLinks);
  }

  /**
   * Return active selected node.
   */
  getPrimarySelectedNode() {
    const selected = this.getSelectedNodes();
    if (!selected.length) return null;
    if (this.selectedNode && selected.some(node => String(node.id) === String(this.selectedNode.id))) {
      return selected.find(node => String(node.id) === String(this.selectedNode.id)) || selected[0];
    }
    return selected[0];
  }

  /**
   * Return active selected link.
   */
  getPrimarySelectedLink() {
    const selected = this.getSelectedLinks();
    if (!selected.length) return null;
    if (this.selectedLink && selected.some(link => String(link.id) === String(this.selectedLink.id))) {
      return selected.find(link => String(link.id) === String(this.selectedLink.id)) || selected[0];
    }
    return selected[0];
  }

  /**
   * Cleanup selected items if they no longer exist in graph data.
   */
  pruneSelection() {
    this.setSelection({
      nodes: this.selectedNodes,
      links: this.selectedLinks,
      activeNode: this.selectedNode,
      activeLink: this.selectedLink
    });
  }

  /**
   * Clear all current selections.
   */
  clearSelection(options = {}) {
    const { nodes = true, links = true } = options;
    if (this.selectedNode || this.selectedLink || this.selectedNodes.length || this.selectedLinks.length) {
      console.log("Effacement de la selection");
      this.setSelection({
        nodes: nodes ? [] : this.selectedNodes,
        links: links ? [] : this.selectedLinks,
        activeNode: nodes ? null : this.selectedNode,
        activeLink: links ? null : this.selectedLink
      });
    }
  }
  
  /**
   * Return available node fields.
   */
  getNodeFields() {
    return this.getFieldsByType('node');
  }
  
  /**
   * Return available link fields.
   */
  getLinkFields() {
    return this.getFieldsByType('link');
  }

  getFieldsByType(target, opts = {}) {
    const excluded = target === 'node'
      ? ["vx", "vy", "fx", "fy", "index"]
      : ["index"];
    const group = this.getSchemaGroup(target);
    const data = target === 'node' ? this.nodes : this.links;
    const fields = new Set(Object.keys(group || {}));
    data.forEach(item => {
      Object.keys(item || {}).forEach(key => fields.add(key));
    });
    const allowedTypes = Array.isArray(opts.types) ? opts.types.map(normalizeType) : null;
    const list = Array.from(fields).filter(f => !excluded.includes(f) && !String(f).startsWith('__'));
    if (!allowedTypes) return list;
    return list.filter(f => allowedTypes.includes(this.getFieldResolvedType(target, f)));
  }

  getGroupList(target) {
    const groups = graphConfig?.groups || { nodes: [], links: [] };
    return target === 'link'
      ? (Array.isArray(groups.links) ? groups.links : [])
      : (Array.isArray(groups.nodes) ? groups.nodes : []);
  }

  findGroup(target, groupRef) {
    const ref = String(groupRef ?? '').trim().toLowerCase();
    if (!ref) return null;
    return this.getGroupList(target).find(group => {
      if (!group || group.enabled === false) return false;
      const id = String(group.id ?? '').trim().toLowerCase();
      const name = String(group.name ?? '').trim().toLowerCase();
      return ref === id || ref === name;
    }) || null;
  }

  isItemInGroup(target, item, groupRef, stack = []) {
    if (!item || !groupRef) return false;
    const group = typeof groupRef === 'object'
      ? groupRef
      : this.findGroup(target, groupRef);
    if (!group || group.enabled === false) return false;

    const itemId = String(item.id ?? '');
    const manualIds = Array.isArray(group.manualIds)
      ? group.manualIds.map(v => String(v))
      : [];
    if (manualIds.includes(itemId)) return true;

    const expr = String(group.when || '').trim();
    if (!expr) return false;

    const stackKey = `${target}:${group.id || group.name || expr}`;
    if (stack.includes(stackKey)) return false;
    const nextStack = stack.concat(stackKey);

    const cacheKey = `${target}:${group.id || group.name || expr}`;
    let cached = this.groupAstCache.get(cacheKey);
    if (!cached || cached.expr !== expr) {
      try {
        cached = { expr, ast: parseExpression(expr) };
        this.groupAstCache.set(cacheKey, cached);
      } catch (e) {
        return false;
      }
    }
    const ast = cached.ast;
    try {
      return !!evaluateExpression(ast, {
        graph: this,
        target,
        item,
        __groupStack: nextStack,
        getField: name => this.resolveFieldValue(target, item, name)
      });
    } catch (e) {
      return false;
    }
  }

  getGroupMembers(target, groupRef, stack = []) {
    const items = target === 'link' ? this.links : this.nodes;
    return (items || []).filter(item => this.isItemInGroup(target, item, groupRef, stack));
  }

  getGroupCount(target, groupRef, stack = []) {
    return this.getGroupMembers(target, groupRef, stack).length;
  }

  getItemGroupNames(target, item, stack = []) {
    if (!item) return [];
    return this.getGroupList(target)
      .filter(group => this.isItemInGroup(target, item, group, stack))
      .map(group => String(group.name || group.id || '').trim())
      .filter(Boolean);
  }

  getNeighbors(nodeId) {
    const neigh = new Set();
    this.links.forEach(l => {
      if (l.source.id === nodeId) neigh.add(l.target);
      else if (l.target.id === nodeId) neigh.add(l.source);
    });
    return Array.from(neigh);
  }

  getNodeLinks(nodeId) {
    return this.links.filter(l => l.source.id === nodeId || l.target.id === nodeId);
  }

  findClusters() {
    const visited = new Set();
    const clusters = [];
    this.nodes.forEach(n => {
      if (visited.has(n)) return;
      const comp = [];
      const stack = [n];
      while (stack.length) {
        const u = stack.pop();
        if (visited.has(u)) continue;
        visited.add(u);
        comp.push(u);
        this.getNeighbors(u.id).forEach(v => {
          if (!visited.has(v)) stack.push(v);
        });
      }
      clusters.push(comp);
    });
    return clusters;
  }
}
