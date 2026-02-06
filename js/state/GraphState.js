/**
 * Gère l'état global du graphe et fournit des méthodes pour le manipuler
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

export class GraphState {
  constructor() {
    // Initialisation avec des données par défaut
    this.nodes = [
      // Utiliser fx et fy pour fixer les positions initiales
      { id: '1', name: 'Node1', description: 'Description1', x: 100, y: 300, size: 30, fx: 100, fy: 300 },
      { id: '2', name: 'Node2', description: 'Description2', x: 200, y: 200, size: 30, fx: 200, fy: 200 },
      { id: '3', name: 'Node3', description: 'Description3', x: 300, y: 300, size: 30, fx: 300, fy: 300 }
    ];
    
    // Initialisation des liens avec références directes aux objets nœuds
    this.links = [];
    
    // Compteurs pour les IDs
    this.nextNodeId = this.nodes.length + 1;
    this.nextLinkId = 1;
    
    // État de sélection
    this.selectedNode = null;
    this.selectedLink = null;
    
    // Configuration globale
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
    
    // Initialiser les liens après avoir créé les nodes
    this.initializeLinks();

    // SchÃ©ma de types pour les champs
    this.schema = { nodes: {}, links: {} };
    this.initializeSchema();

    // -- ajout start --
    // Mettre nextLinkId juste après le plus grand ID de lien existant
    const maxId = this.links.reduce((max, l) => {
      const n = parseInt(l.id, 10);
      return isNaN(n) ? max : Math.max(max, n);
    }, 0);
    this.nextLinkId = maxId + 1;
    // -- ajout end --
  }
  
  /**
   * Initialise les liens avec références aux objets nœuds
   */
  initializeLinks() {
    // Récupérer les nœuds par ID
    const getNodeById = (id) => this.nodes.find(n => n.id === id);
    
    // Créer les liens avec références directes
    const linksData = [
      { id: '1', name: 'Link1', description: 'Description1', source: '1', target: '2', width: this.globalSettings.defaultLinkWidth },
      { id: '2', name: 'Link2', description: 'Description2', source: '2', target: '3', width: this.globalSettings.defaultLinkWidth }
    ];
    
    // Convertir les références d'ID en références d'objets
    this.links = linksData.map(link => ({
      ...link,
      source: getNodeById(link.source),
      target: getNodeById(link.target)
    }));
  }
  
  /**
   * Crée un nouveau nœud à la position spécifiée
   */
  createNode(x, y) {
    const id = String(this.nextNodeId++);
    const newNode = {
      id,
      name: `Node${id}`,
      description: `Description${id}`,
      x,
      y,
      size: this.globalSettings.defaultNodeSize || 30
    };

    // Ajouter les champs manquants selon le schÃ©ma
    Object.keys(this.schema.nodes).forEach(field => {
      if (newNode[field] === undefined) {
        newNode[field] = getDefaultValueForType(this.getFieldType('node', field));
      }
    });
    
    performAction({ 
      type: "create_node", 
      data: { 
        node: newNode, 
        label: `Create node ${newNode.name}` 
      } 
    });
    
    return newNode;
  }
  
  /**
   * Supprime un nœud du graphe
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
   * Crée un nouveau lien entre deux nœuds
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
        label: `Create link (${source[this.globalSettings.nodeLabelField] || source.name} → ${target[this.globalSettings.nodeLabelField] || target.name})` 
      } 
    });
    
    return newLink;
  }
  
  /**
   * Supprime un lien du graphe
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
   * Met à jour un nœud avec une nouvelle valeur
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
        label: `Update node ${field} (${oldValue} → ${newValue})`
      }
    });
  }
  
  /**
   * Met à jour un lien avec une nouvelle valeur
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
        label: `Update link ${field} (${oldValue} → ${newValue})`
      }
    });
  }
  
  /**
   * Ajoute un champ à tous les nœuds ou liens
   */
  addField(fieldName, target) {
    return this.addFieldWithType(fieldName, target, 'text');
  }

  /**
   * Ajoute un champ Ã  tous les nÅ“uds ou liens avec un type
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
   * Initialise le schÃ©ma de types Ã  partir des donnÃ©es et des dÃ©fauts connus
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
      const resolved = normalizeType(entry.resultType || 'text');
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
        label: `Update ${target} field type ${field} (${oldType} â†’ ${newType})`
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
   * Convertit des champs existants vers des variantes multilingues (suffixes)
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
   * Convertit des champs multilingues (suffixes) vers un champ unilingue
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
   * Supprime un champ de tous les nœuds ou liens
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
   * Met à jour un paramètre de configuration global
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
        label: `Update global setting ${field} (${oldValue} → ${value})` 
      } 
    });
    
    this.globalSettings[field] = value;
  }
  
  /**
   * Importe un graphe complet
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
   * Sélectionne un nœud
   */
  selectNode(node) {
    if (!node) return;
    
    // Désélection de tout élément actuellement sélectionné
    this.selectedNode = null;
    this.selectedLink = null;
    
    // Sélection du nouveau nœud
    this.selectedNode = node;
    
    console.log(`Nœud sélectionné: ${node.id}`);
  }
  
  /**
   * Sélectionne un lien
   * @param {Object} link - Le lien à sélectionner
   */
  selectLink(link) {
    if (!link || typeof link !== 'object') {
      console.error("Tentative de sélection d'un lien invalide:", link);
      return;
    }
    
    this.selectedLink = link;
    this.selectedNode = null;
    
    console.log("Lien sélectionné:", link);
  }
  
  /**
   * Efface toutes les sélections actuelles
   */
  clearSelection() {
    if (this.selectedNode || this.selectedLink) {
      console.log("Effacement de la sélection");
      this.selectedNode = null;
      this.selectedLink = null;
    }
  }
  
  /**
   * Retourne les champs de nœuds disponibles
   */
  getNodeFields() {
    return this.getFieldsByType('node');
  }
  
  /**
   * Retourne les champs de liens disponibles
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
    const list = Array.from(fields).filter(f => !excluded.includes(f));
    if (!allowedTypes) return list;
    return list.filter(f => allowedTypes.includes(this.getFieldResolvedType(target, f)));
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
