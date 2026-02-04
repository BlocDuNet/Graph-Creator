/**
 * Service pour l'import/export des données du graphe
 */
import { performAction } from '../state/undo_redo.js';
import { uiConfig } from '../config/index.js';
import { listJsonFiles } from './fileService.js';  // <— nouvel import
import eventBus from './EventBus.js';

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
  
  initJSONModelsList();
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
    const { nodes, links } = normalizeImportedGraph(jsonData);
    
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
    eventBus.emit('graph-imported', { nodes, links });
    
  } catch (error) {
    console.error("Erreur lors du chargement du graphe:", error);
    alert(`Erreur lors du chargement du graphe: ${error.message}`);
  }
}

/**
 * Normalise et valide un JSON de graphes provenant de schémas variés.
 * Objectif: accepter plusieurs formats tout en garantissant des données sûres.
 */
function normalizeImportedGraph(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new Error("Format JSON invalide: objet requis.");
  }

  // Supporter les wrappers fréquents
  let data = raw;
  if (raw.graph && typeof raw.graph === 'object') data = raw.graph;
  if (raw.data && typeof raw.data === 'object') data = raw.data;

  // Détecter les tableaux de noeuds/liens avec plusieurs noms possibles
  const nodesArray =
    data.nodes || data.vertices || data.items || data.nodeList || data.node || null;
  const linksArray =
    data.links || data.edges || data.relations || data.connections || data.link || null;

  // Cas: tableau direct de noeuds
  const nodesRaw = Array.isArray(data) ? data : nodesArray;
  let linksRaw = Array.isArray(linksArray) ? linksArray : [];

  if (!Array.isArray(nodesRaw)) {
    throw new Error("Format JSON invalide: aucun tableau de noeuds détecté.");
  }

  // Normaliser les noeuds
  const nodes = nodesRaw.map((node, idx) => {
    if (!node || typeof node !== 'object') {
      throw new Error(`Noeud invalide à l'index ${idx}: objet requis.`);
    }
    const id = extractNodeId(node, idx);
    return { ...node, id: String(id) };
  });

  // Index par id
  const nodeById = new Map(nodes.map(n => [String(n.id), n]));

  // Si pas de liens fournis, tenter de dériver depuis les noeuds (adjacence)
  if (!linksRaw.length) {
    linksRaw = deriveLinksFromNodes(nodes);
  }

  // Normaliser les liens
  const links = linksRaw.map((link, idx) => {
    if (!link || typeof link !== 'object') {
      throw new Error(`Lien invalide à l'index ${idx}: objet requis.`);
    }

    const { sourceId, targetId } = extractLinkEndpoints(link);
    if (sourceId == null || targetId == null) {
      console.warn("Lien ignoré (source/target manquant):", link);
      return null;
    }

    // Créer les noeuds manquants si besoin (schémas “liens uniquement”)
    if (!nodeById.has(String(sourceId))) {
      const newNode = { id: String(sourceId), name: String(sourceId), description: "" };
      nodeById.set(String(sourceId), newNode);
      nodes.push(newNode);
    }
    if (!nodeById.has(String(targetId))) {
      const newNode = { id: String(targetId), name: String(targetId), description: "" };
      nodeById.set(String(targetId), newNode);
      nodes.push(newNode);
    }

    return {
      ...link,
      id: String(link.id ?? `${sourceId}-${targetId}-${idx}`),
      source: nodeById.get(String(sourceId)),
      target: nodeById.get(String(targetId))
    };
  }).filter(Boolean);

  return { nodes, links };
}

function extractNodeId(node, idx) {
  const candidate =
    node.id ?? node.key ?? node.uuid ?? node.uid ??
    node.name ?? node.label ?? node.title;
  if (candidate == null || candidate === '') {
    return `node-${idx + 1}`;
  }
  return candidate;
}

function extractLinkEndpoints(link) {
  const src =
    link.source ?? link.from ?? link.src ?? link.sourceId ?? link.origin ?? link.start;
  const tgt =
    link.target ?? link.to ?? link.dst ?? link.targetId ?? link.destination ?? link.end;

  const sourceId = normalizeEndpoint(src);
  const targetId = normalizeEndpoint(tgt);
  return { sourceId, targetId };
}

function normalizeEndpoint(value) {
  if (value == null) return null;
  if (typeof value === 'object') {
    return value.id ?? value.key ?? value.uuid ?? value.name ?? value.label ?? null;
  }
  return value;
}

function deriveLinksFromNodes(nodes) {
  const links = [];
  nodes.forEach((node, idx) => {
    const edgeLists = [
      node.links,
      node.edges,
      node.relations,
      node.connections,
      node.neighbors,
      node.targets,
      node.children
    ].filter(Boolean);

    edgeLists.forEach(list => {
      if (!Array.isArray(list)) return;
      list.forEach((edge, eIdx) => {
        const targetId = normalizeEndpoint(edge?.target ?? edge ?? null);
        if (targetId == null) return;
        links.push({
          id: `${node.id}-${targetId}-${idx}-${eIdx}`,
          source: node.id,
          target: targetId,
          name: edge?.name ?? `Link ${node.id} -> ${targetId}`,
          description: edge?.description ?? ""
        });
      });
    });
  });
  return links;
}

/**
 * Initialise la liste des modèles JSON disponibles
 */
async function initJSONModelsList() {
  try {
    // Récupérer la liste via le service commun
    const jsonFiles = await listJsonFiles(uiConfig.jsonModels.directoryPath);
    const select = document.getElementById('json-models');
    if (!select) return;

    // Construire les options
    select.innerHTML = [
      '<option value="">-- Choisir un modèle --</option>',
      ...jsonFiles.map(f => `<option value="${f}">${f.replace(/\.json$/, '')}</option>`)
    ].join('');

    select.addEventListener('change', async function() {
      if (this.value) {
        await loadJSONModelFile(uiConfig.jsonModels.directoryPath + this.value);
      }
    });
  } catch (e) {
    console.error('Erreur initJSONModelsList:', e);
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
