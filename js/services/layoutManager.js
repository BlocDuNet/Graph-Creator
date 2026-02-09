import {
  applyCircleLayout,
  applyGridLayout,
  applyRandomLayout,
  applyHierarchicalLayout,
  applyRadialLayout,
  applySpiralLayout,
  applyArcDiagramLayout,
  applyConcentricLayout,
  applyBipartiteLayout,
  applyForceAtlasLayout
} from './layoutService.js';

let graphState = null;
let renderer = null;

/**
 * Initialize the layout manager.
 * Graph state.
 * @param {Object} graphRenderer - Renderer du graphe
 */
export function initLayoutManager(state, graphRenderer) {
  graphState = state;
  renderer = graphRenderer;
  
  setupEventListeners();
}

/**
 * Configure event listeners.
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
 * Apply a layout to the graph.
 * Layout type to apply.
 */
function applyLayout(layoutType) {
  if (!graphState || !renderer) return;
  const w = renderer.width, h = renderer.height;
  switch (layoutType) {
    case "circle":       applyCircleLayout(graphState.nodes, w, h); break;
    case "grid":         applyGridLayout(graphState.nodes, w, h); break;
    case "random":       applyRandomLayout(graphState.nodes, w, h); break;
    case "hierarchical": applyHierarchicalLayout(graphState.nodes, w, h); break;
    case "radial":       applyRadialLayout(graphState.nodes, w, h); break;
    case "spiral":       applySpiralLayout(graphState.nodes, w, h); break;
    case "arc":          applyArcDiagramLayout(graphState.nodes, w, h); break;
    case "concentric":   applyConcentricLayout(graphState.nodes, w, h); break;
    case "bipartite":    applyBipartiteLayout(graphState.nodes, w, h); break;
    case "forceAtlas":   applyForceAtlasLayout(graphState.nodes, w, h); break;
    default:
      console.warn(`Layout type ${layoutType} not recognized`);
  }
  renderer.updateGraph();
}

// Export useful functions for other modules.
export {
  applyLayout,
  applyCircleLayout,
  applyGridLayout,
  applyRandomLayout
};
