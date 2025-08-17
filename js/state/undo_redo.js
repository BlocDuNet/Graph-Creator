// Gestion de l'historique des actions pour les fonctionnalités annuler/rétablir

class HistoryManager extends EventTarget {
  constructor() {
    super();
    this.actionHistory = [];
    this.undoneActions = [];
    this.graphState = null;
    this.updateCallback = null;
  }

  registerGraphState(state) {
    this.graphState = state;
  }
  registerUpdateCallback(fn) {
    this.updateCallback = fn;
  }

  applyAction(action) {
    if (!this.graphState) {
      console.error("graphState non enregistré");
      return;
    }
    if (action.type === "composite") {
      action.actions.forEach(sub => this.applyAction(sub));
    } else if (action.type === "update_global") {
      // Les réglages globaux sont gérés dans GraphState
      const { field, to } = action.data;
      this.graphState.globalSettings[field] = to;
    } else if (action.type === "import_graph") {
      this.graphState.nodes = action.data.newState.nodes;
      this.graphState.links = action.data.newState.links;
    } else if (action.type === "add_field") {
      const { field, target, oldValues } = action.data;
      const items = (target === "node") ? this.graphState.nodes : this.graphState.links;
      items.forEach(item => {
        const old = Array.isArray(oldValues) 
          ? oldValues.find(o => o.id === item.id) 
          : null;
        item[field] = old ? old.value : "";
      });
    } else if (action.type === "remove_field") {
      const { field, target } = action.data;
      const data = (target === "node") ? this.graphState.nodes : this.graphState.links;
      data.forEach(item => { delete item[field]; });
    } else {
      switch (action.type) {
        case "create_node": {
          const { node } = action.data;
          if (!this.graphState.nodes.find(n => n.id === node.id)) {
            this.graphState.nodes.push(node);
          }
          break;
        }
        case "delete_node": {
          const { node, relatedLinks } = action.data;
          this.graphState.nodes = this.graphState.nodes.filter(n => n.id !== node.id);
          this.graphState.links = this.graphState.links.filter(link => !relatedLinks.find(r => r.id === link.id));
          break;
        }
        case "move_node": {
          const { nodeId, to } = action.data;
          const node = this.graphState.nodes.find(n => n.id === nodeId);
          if (node) {
            node.x = to.x;
            node.y = to.y;
          }
          break;
        }
        case "update_node": {
          const { nodeId, field, to } = action.data;
          const node = this.graphState.nodes.find(n => n.id === nodeId);
          if (node) node[field] = to;
          break;
        }
        case "create_link": {
          const { link } = action.data;
          if (!this.graphState.links.find(l => l.id === link.id)) {
            this.graphState.links.push(link);
          }
          break;
        }
        case "delete_link": {
          const { link } = action.data;
          this.graphState.links = this.graphState.links.filter(l => l.id !== link.id);
          break;
        }
        case "update_link": {
          const { linkId, field, to } = action.data;
          const link = this.graphState.links.find(l => l.id === linkId);
          if (link) link[field] = to;
          break;
        }
        default:
          console.error("Action inconnue :", action.type);
      }
    }
    if (this.updateCallback) this.updateCallback();
    this.dispatchEvent(new CustomEvent('action-performed', { detail:{action} }));
  }

  // Table de correspondance pour les actions inverses
  getInverseAction(action) {
    if (action.type === "composite") {
      return {
        type: "composite",
        actions: action.actions.slice().reverse().map(this.getInverseAction.bind(this))
      };
    }
    const inv = {
      create_node: () => ({ type: "delete_node", data: { node: action.data.node, relatedLinks: [] } }),
      delete_node: () => {
        // When undoing a node deletion, we need to:
        // 1. Restore the node
        // 2. Restore all links that were connected to it
        const nodeAction = { 
          type: "create_node", 
          data: { node: action.data.node } 
        };
        
        // If no related links were stored, just return the node creation action
        if (!action.data.relatedLinks || action.data.relatedLinks.length === 0) {
          return nodeAction;
        }
        
        // Create actions to restore each link that was connected to the node
        const linkActions = action.data.relatedLinks.map(link => ({
          type: "create_link",
          data: { link }
        }));
        
        // Return a composite action that restores both the node and its links
        return {
          type: "composite",
          actions: [nodeAction, ...linkActions]
        };
      },
      move_node: () => ({ type: "move_node", data: { nodeId: action.data.nodeId, from: action.data.to, to: action.data.from } }),
      update_node: () => ({ type: "update_node", data: { nodeId: action.data.nodeId, field: action.data.field, from: action.data.to, to: action.data.from } }),
      create_link: () => ({ type: "delete_link", data: { link: action.data.link } }),
      delete_link: () => ({ type: "create_link", data: { link: action.data.link } }),
      update_link: () => ({ type: "update_link", data: { linkId: action.data.linkId, field: action.data.field, from: action.data.to, to: action.data.from } }),
      update_global: () => ({ type: "update_global", data: { field: action.data.field, from: action.data.to, to: action.data.from } }),
      add_field: () => ({ type: "remove_field", data: action.data }),
      remove_field: () => ({ type: "add_field", data: action.data }),
      import_graph: act => ({
        type: "import_graph",
        data: {
          // on restaure l'ancien état puis on le repartage sur redo
          oldState: act.data.newState,
          newState: act.data.oldState,
          label: act.data.label
        }
      })
    }[action.type];
    return inv ? inv(action) : (console.error("Inverse inconnu pour", action.type), null);
  }

  perform(action) {
    // pour remove_field, capturer les anciennes valeurs
    if (action.type === "remove_field") {
      const { field, target } = action.data;
      const items = target === "node" ? this.graphState.nodes : this.graphState.links;
      action.data.oldValues = items.map(item => ({ id: item.id, value: item[field] }));
    }
    this.applyAction(action);
    this.actionHistory.push(action);
    this.undoneActions = [];
    this._updateHistoryList();
  }

  undo() {
    if (this.actionHistory.length === 0) return;
    const last = this.actionHistory.pop();
    const inverse = this.getInverseAction(last);
    if (inverse) {
      this.applyAction(inverse);
      this.undoneActions.push(last);
    }
    this._updateHistoryList();
    this.dispatchEvent(new Event('undo-performed'));
  }

  redo() {
    if (this.undoneActions.length === 0) return;
    const action = this.undoneActions.pop();
    this.applyAction(action);
    this.actionHistory.push(action);
    this._updateHistoryList();
    this.dispatchEvent(new Event('redo-performed'));
  }

  jumpToHistory(idx) {
    while (this.actionHistory.length > idx) this.undo();
    while (this.actionHistory.length < idx && this.undoneActions.length) this.redo();
  }

  _updateHistoryList() {
    this._history = [...this.actionHistory];
    // Notifier les abonnés au singleton
    this.dispatchEvent(new CustomEvent('history-updated', { detail:{ history:this._history } }));
    // ← Compatibilité retour en arrière : maintenir window.updateHistoryList
    window.historyList = this._history.slice();
    window.updateHistoryList?.(this._history);
  }

  getHistory() {
    return [...this._history];
  }
}

// Export singleton
const history = new HistoryManager();
export default history;
export const registerGraphState     = history.registerGraphState.bind(history);
export const registerUpdateCallback = history.registerUpdateCallback.bind(history);
export const performAction          = history.perform.bind(history);
export const undo                   = history.undo.bind(history);
export const redo                   = history.redo.bind(history);
export const jumpToHistory          = history.jumpToHistory.bind(history);
export const getHistory             = history.getHistory.bind(history);
export const historyEmitter         = history;
