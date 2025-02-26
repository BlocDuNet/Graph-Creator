// undo_redo.js

let actionHistory = [];
let undoneActions = [];

let graphState = null;
let updateCallback = null;

export function registerGraphState(state) {
  graphState = state;
}

export function registerUpdateCallback(fn) {
  updateCallback = fn;
}

function applyAction(action) {
  if (!graphState) {
    console.error("graphState non enregistré");
    return;
  }
  if (action.type === "composite") {
    action.actions.forEach(sub => applyAction(sub));
  } else if (action.type === "update_global") {
    // Les réglages globaux sont gérés dans globalSettings dans graph.js
  } else if (action.type === "import_graph") {
    graphState.nodes = action.data.newState.nodes;
    graphState.links = action.data.newState.links;
  } else if (action.type === "add_field") {
    const { field, target } = action.data;
    const data = (target === "node") ? graphState.nodes : graphState.links;
    data.forEach(item => { item[field] = ""; });
  } else if (action.type === "remove_field") {
    const { field, target } = action.data;
    const data = (target === "node") ? graphState.nodes : graphState.links;
    data.forEach(item => { delete item[field]; });
  } else {
    switch (action.type) {
      case "create_node": {
        const { node } = action.data;
        if (!graphState.nodes.find(n => n.id === node.id)) {
          graphState.nodes.push(node);
        }
        break;
      }
      case "delete_node": {
        const { node, relatedLinks } = action.data;
        graphState.nodes = graphState.nodes.filter(n => n.id !== node.id);
        graphState.links = graphState.links.filter(link => !relatedLinks.find(r => r.id === link.id));
        break;
      }
      case "move_node": {
        const { nodeId, to } = action.data;
        const node = graphState.nodes.find(n => n.id === nodeId);
        if (node) {
          node.x = to.x;
          node.y = to.y;
        }
        break;
      }
      case "update_node": {
        const { nodeId, field, to } = action.data;
        const node = graphState.nodes.find(n => n.id === nodeId);
        if (node) node[field] = to;
        break;
      }
      case "create_link": {
        const { link } = action.data;
        if (!graphState.links.find(l => l.id === link.id)) {
          graphState.links.push(link);
        }
        break;
      }
      case "delete_link": {
        const { link } = action.data;
        graphState.links = graphState.links.filter(l => l.id !== link.id);
        break;
      }
      case "update_link": {
        const { linkId, field, to } = action.data;
        const link = graphState.links.find(l => l.id === linkId);
        if (link) link[field] = to;
        break;
      }
      default:
        console.error("Action inconnue :", action.type);
    }
  }
  if (updateCallback) updateCallback();
}

function getInverseAction(action) {
  if (action.type === "composite") {
    return {
      type: "composite",
      actions: action.actions.slice().reverse().map(getInverseAction)
    };
  }
  switch (action.type) {
    case "create_node":
      return { type: "delete_node", data: { node: action.data.node, relatedLinks: [] } };
    case "delete_node":
      return { type: "create_node", data: { node: action.data.node } };
    case "move_node":
      return { type: "move_node", data: { nodeId: action.data.nodeId, from: action.data.to, to: action.data.from } };
    case "update_node":
      return { type: "update_node", data: { nodeId: action.data.nodeId, field: action.data.field, from: action.data.to, to: action.data.from } };
    case "create_link":
      return { type: "delete_link", data: { link: action.data.link } };
    case "delete_link":
      return { type: "create_link", data: { link: action.data.link } };
    case "update_link":
      return { type: "update_link", data: { linkId: action.data.linkId, field: action.data.field, from: action.data.to, to: action.data.from } };
    case "update_global":
      return { type: "update_global", data: { field: action.data.field, from: action.data.to, to: action.data.from } };
    case "add_field":
      return { type: "remove_field", data: action.data };
    case "remove_field":
      return { type: "add_field", data: action.data };
    case "import_graph":
      return { type: "import_graph", data: { oldState: action.data.newState, newState: action.data.oldState } };
    default:
      console.error("Inverse inconnu pour", action.type);
      return null;
  }
}

export function performAction(action) {
  applyAction(action);
  actionHistory.push(action);
  undoneActions = [];
  updateHistoryList();
}

export function undo() {
  if (actionHistory.length === 0) return;
  const last = actionHistory.pop();
  const inverse = getInverseAction(last);
  if (inverse) {
    applyAction(inverse);
    undoneActions.push(last);
  }
  updateHistoryList();
}

export function redo() {
  if (undoneActions.length === 0) return;
  const action = undoneActions.pop();
  applyAction(action);
  actionHistory.push(action);
  updateHistoryList();
}

export function jumpToHistory(targetIndex) {
  while (actionHistory.length > targetIndex) {
    undo();
  }
  while (actionHistory.length < targetIndex && undoneActions.length > 0) {
    redo();
  }
  updateHistoryList();
}

function updateHistoryList() {
  window.historyList = actionHistory.slice();
}
