import { applyCircleLayout, applyGridLayout, applyRandomLayout } from './layoutService.js';

let graphState = null;
let renderer = null;

/**
 * Initialise le gestionnaire de layouts
 * @param {Object} state - État du graphe
 * @param {Object} graphRenderer - Renderer du graphe
 */
export function initLayoutManager(state, graphRenderer) {
  graphState = state;
  renderer = graphRenderer;
  
  setupEventListeners();
}

/**
 * Configure les écouteurs d'événements
 */
function setupEventListeners() {
  document.getElementById("layoutSelect")?.addEventListener("change", function() {
    applyLayout(this.value);
  });
  document.getElementById("reloadLayout")?.addEventListener("click", () => {
    const sel = document.getElementById("layoutSelect");
    if (sel?.value) applyLayout(sel.value);
  });
}

/**
 * Applique un layout au graphe
 * @param {string} layoutType - Type de layout à appliquer
 */
function applyLayout(layoutType) {
  if (!graphState || !renderer) return;
  const w = renderer.width, h = renderer.height;
  switch (layoutType) {
    case "circle":
      applyCircleLayout(graphState.nodes, w, h); break;
    case "grid":
      applyGridLayout(graphState.nodes, w, h);  break;
    case "random":
      applyRandomLayout(graphState.nodes, w, h); break;
    default:
      console.warn(`Layout type ${layoutType} not recognized`);
  }
  renderer.updateGraph();
}

// Exporter les fonctions utiles pour d'autres modules
export {
  applyLayout,
  applyCircleLayout,
  applyGridLayout,
  applyRandomLayout
};
