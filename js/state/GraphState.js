/**
 * Gère l'état global du graphe et fournit des méthodes pour le manipuler
 */
import { performAction } from './undo_redo.js';
import { graphConfig } from '../config/index.js';

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
      defaultLinkWidth: 2,
      defaultFocusField: "name"
    };
    
    // Initialiser les liens après avoir créé les nodes
    this.initializeLinks();
  }
  
  /**
   * Initialise les liens avec références aux objets nœuds
   */
  initializeLinks() {
    // Récupérer les nœuds par ID
    const getNodeById = (id) => this.nodes.find(n => n.id === id);
    
    // Créer les liens avec références directes
    const linksData = [
      { id: '1', name: 'Link1', description: 'Description1', source: '1', target: '2', width: 2 },
      { id: '2', name: 'Link2', description: 'Description2', source: '2', target: '3', width: 2 }
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
    if (fieldName.trim() === '') return;
    
    const data = target === 'node' ? this.nodes : this.links;
    const existingKeys = data.length > 0 ? Object.keys(data[0]) : [];
    
    if (existingKeys.includes(fieldName)) return;
    
    performAction({ 
      type: "add_field", 
      data: { 
        field: fieldName, 
        target, 
        label: `Add field ${fieldName} to ${target}s` 
      } 
    });
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
      links: [...this.links]
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
    const excluded = ["vx", "vy", "fx", "fy", "index"];
    const fields = new Set();
    
    this.nodes.forEach(item => {
      Object.keys(item).forEach(key => {
        if (!excluded.includes(key)) fields.add(key);
      });
    });
    
    return Array.from(fields);
  }
  
  /**
   * Retourne les champs de liens disponibles
   */
  getLinkFields() {
    const excluded = ["index", "source", "target"];
    const fields = new Set();
    
    this.links.forEach(item => {
      Object.keys(item).forEach(key => {
        if (!excluded.includes(key)) fields.add(key);
      });
    });
    
    return Array.from(fields);
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
