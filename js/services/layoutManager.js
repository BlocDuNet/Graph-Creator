/**
 * Service pour gérer les différents layouts du graphe
 */

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
  // Gestionnaire d'événement pour le sélecteur de layout
  const layoutSelect = document.getElementById("layoutSelect");
  if (layoutSelect) {
    layoutSelect.addEventListener("change", function() {
      const layoutType = this.value;
      applyLayout(layoutType);
    });
  }
  
  // Gestionnaire d'événement pour le bouton "Recharger"
  const reloadButton = document.getElementById("reloadLayout");
  if (reloadButton) {
    reloadButton.addEventListener("click", function() {
      const layoutType = document.getElementById("layoutSelect")?.value;
      if (layoutType) {
        applyLayout(layoutType);
      }
    });
  }
}

/**
 * Applique un layout au graphe
 * @param {string} layoutType - Type de layout à appliquer
 */
function applyLayout(layoutType) {
  if (!graphState || !renderer) return;
  
  const width = renderer.width;
  const height = renderer.height;
  
  switch (layoutType) {
    case "circle":
      applyCircleLayout(width, height);
      break;
    case "grid":
      applyGridLayout(width, height);
      break;
    case "random":
      applyRandomLayout(width, height);
      break;
    default:
      console.warn(`Layout type ${layoutType} not recognized`);
  }
  
  // Mettre à jour le graphe après avoir modifié les positions
  renderer.updateGraph();
}

/**
 * Applique un layout circulaire aux nœuds
 * @param {number} width - Largeur disponible
 * @param {number} height - Hauteur disponible
 */
function applyCircleLayout(width, height) {
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) / 3;
  const n = graphState.nodes.length;
  
  graphState.nodes.forEach((node, i) => {
    node.x = centerX + radius * Math.cos((2 * Math.PI * i) / n);
    node.y = centerY + radius * Math.sin((2 * Math.PI * i) / n);
  });
}

/**
 * Applique un layout en grille aux nœuds
 * @param {number} width - Largeur disponible
 * @param {number} height - Hauteur disponible
 */
function applyGridLayout(width, height) {
  const cols = Math.ceil(Math.sqrt(graphState.nodes.length));
  const spacingX = width / (cols + 1);
  const spacingY = height / (cols + 1);
  
  graphState.nodes.forEach((node, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    node.x = spacingX * (col + 1);
    node.y = spacingY * (row + 1);
  });
}

/**
 * Applique un layout aléatoire aux nœuds
 * @param {number} width - Largeur disponible
 * @param {number} height - Hauteur disponible
 */
function applyRandomLayout(width, height) {
  const padding = 50; // Espace de marge autour des bords
  const availWidth = width - (padding * 2);
  const availHeight = height - (padding * 2);
  
  graphState.nodes.forEach(node => {
    // Position aléatoire mais dans une zone utilisable
    node.x = padding + Math.random() * availWidth;
    node.y = padding + Math.random() * availHeight;
  });
}

// Exporter les fonctions utiles pour d'autres modules
export {
  applyLayout,
  applyCircleLayout,
  applyGridLayout,
  applyRandomLayout
};
