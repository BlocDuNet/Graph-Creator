/**
 * Service pour l'import/export des données du graphe
 */
import { performAction } from '../state/undo_redo.js';
import { uiConfig } from '../config/index.js';

let graphState = null;
let renderer = null;

/**
 * Initialise le service d'entrée/sortie
 * @param {Object} state - État du graphe
 * @param {Object} graphRenderer - Renderer du graphe
 */
export function initIOServices(state, graphRenderer) {
  graphState = state;
  renderer = graphRenderer;
  
  setupEventListeners();
  initJSONModelsList();
}

/**
 * Configure les écouteurs d'événements pour l'import/export
 */
function setupEventListeners() {
  // Export JSON
  const exportJsonButton = document.getElementById('export-json');
  if (exportJsonButton) {
    exportJsonButton.addEventListener('click', exportJson);
  }
  
  // Import JSON (bouton visible)
  const importJsonButton = document.getElementById('import-json');
  if (importJsonButton) {
    importJsonButton.addEventListener('click', () => {
      document.getElementById('json-file')?.click();
    });
  }
  
  // Import JSON (élément file input)
  const jsonFileInput = document.getElementById('json-file');
  if (jsonFileInput) {
    jsonFileInput.addEventListener('change', function() {
      const file = this.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = function(event) {
          loadJSONGraph(event.target.result);
        };
        reader.readAsText(file);
      }
    });
  }
}

/**
 * Exporte le graphe actuel en JSON
 */
function exportJson() {
  const exportData = {
    nodes: graphState.nodes.map(node => {
      const { vx, vy, fx, fy, ...rest } = node;
      return rest;
    }),
    links: graphState.links.map(link => {
      const { source, target, ...rest } = link;
      return { 
        ...rest, 
        source: source.id, 
        target: target.id 
      };
    })
  };
  
  const jsonStr = JSON.stringify(exportData, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement("a");
  a.href = url;
  a.download = "graph.json";
  a.click();
  
  // Nettoyer l'URL
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

/**
 * Charge un graphe à partir de données JSON
 */
function loadJSONGraph(jsonContent) {
  try {
    const jsonData = typeof jsonContent === 'string' ? JSON.parse(jsonContent) : jsonContent;
    
    // Valider la structure du JSON
    if (!Array.isArray(jsonData.nodes) || !Array.isArray(jsonData.links)) {
      throw new Error("Format JSON invalide: les tableaux 'nodes' et 'links' sont requis");
    }
    
    // Préparer les nœuds en préservant tous les champs personnalisés
    const nodes = jsonData.nodes.map(node => ({
      ...node,  // Conserver tous les champs personnalisés
      id: String(node.id) // S'assurer que l'ID est une chaîne
    }));
    
    // Préparer les liens en convertissant les références source/target en objets
    const links = jsonData.links.map(link => {
      const sourceNode = nodes.find(n => String(n.id) === String(link.source));
      const targetNode = nodes.find(n => String(n.id) === String(link.target));
      
      if (!sourceNode || !targetNode) {
        console.warn(`Lien ignoré: source=${link.source}, target=${link.target} (nœuds non trouvés)`);
        return null;
      }
      
      // Conserver tous les champs personnalisés tout en normalisant les références
      return {
        ...link,  // Préserver tous les champs personnalisés
        id: String(link.id),
        source: sourceNode,
        target: targetNode
      };
    }).filter(Boolean); // Ignorer les liens avec source/target invalides
    
    // Sauvegarder l'état précédent
    const oldState = {
      nodes: [...graphState.nodes],
      links: [...graphState.links]
    };
    
    // Appliquer la nouvelle structure de graphe
    performAction({ 
      type: "import_graph", 
      data: { 
        oldState,
        newState: { nodes, links },
        label: "Import JSON graph" 
      } 
    });
    
    // Mettre à jour le graphe
    renderer.updateGraph();
    
    // Émettre un événement personnalisé pour notifier l'importation
    window.dispatchEvent(new CustomEvent('graph-imported', { 
      detail: { nodes, links } 
    }));
    
  } catch (error) {
    console.error("Erreur lors du chargement du graphe:", error);
    alert(`Erreur lors du chargement du graphe: ${error.message}`);
  }
}

/**
 * Initialise la liste des modèles JSON disponibles
 */
async function initJSONModelsList() {
  try {
    const response = await fetch(uiConfig.jsonModels.directoryPath);
    const text = await response.text();
    const parser = new DOMParser();
    const html = parser.parseFromString(text, 'text/html');
    
    const jsonFiles = Array.from(html.querySelectorAll('a'))
      .filter(link => link.href.endsWith('.json'))
      .map(link => link.textContent);
    
    if (jsonFiles.length === 0) {
      console.log('Aucun fichier modèle JSON trouvé!');
      return;
    }
    
    // Créer les options de la liste déroulante
    const select = document.getElementById('json-models');
    if (!select) return;
    
    // Vider le select
    while (select.firstChild) {
      select.removeChild(select.firstChild);
    }
    
    // Ajouter une option vide au début
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = '-- Choisir un modèle --';
    select.appendChild(defaultOption);
    
    // Ajouter les options des fichiers
    jsonFiles.forEach(file => {
      const option = document.createElement('option');
      option.value = file;
      option.textContent = file.split(".")[0];
      select.appendChild(option);
    });
    
    // Ajouter l'écouteur d'événement
    select.addEventListener('change', function() {
      const selectedFile = this.value;
      if (selectedFile) {
        loadJSONModelFile(uiConfig.jsonModels.directoryPath + selectedFile);
      }
    });
    
  } catch (error) {
    console.error('Erreur lors de la récupération des modèles JSON:', error);
  }
}

/**
 * Charge un fichier JSON modèle depuis le serveur
 */
async function loadJSONModelFile(file) {
  try {
    const response = await fetch(file);
    if (!response.ok) throw new Error(`Erreur HTTP: ${response.status}`);
    const jsonData = await response.json();
    loadJSONGraph(jsonData);
  } catch (error) {
    console.error(`Erreur lors du chargement du modèle ${file}:`, error);
    alert(`Erreur lors du chargement du modèle: ${error.message}`);
  }
}

// Export des fonctions pour utilisation externe
export { 
  exportJson, 
  loadJSONGraph,
  loadJSONModelFile 
};
