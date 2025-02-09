let history = [];
let future = [];

export function saveState(nodes, links) {
  // Save the current state to history
  history.push({
    nodes: JSON.parse(JSON.stringify(nodes)),
    links: JSON.parse(JSON.stringify(links))
  });
  // Clear the future states when a new action is performed
  future = [];
}

export function undo() {
  if (history.length > 1) {
    // Move the current state to the future stack
    future.push(history.pop());
    return history[history.length - 1];
  }
  return null;
}

export function redo() {
  if (future.length > 0) {
    const state = future.pop();
    history.push(state);
    return state;
  }
  return null;
}
