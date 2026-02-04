/**
 * Service pour l'import/export des données du graphe
 */
import { performAction } from '../state/undo_redo.js';
import { uiConfig } from '../config/index.js';
import { listJsonFiles } from './fileService.js';  // <— nouvel import
import eventBus from './EventBus.js';

let graphState = null;
let renderer = null;
let pendingAdvancedImport = null;

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
 * Prépare l'import avancé (mapping utilisateur)
 */
function prepareAdvancedImport(jsonContent) {
  try {
    const raw = typeof jsonContent === 'string' ? JSON.parse(jsonContent) : jsonContent;
    pendingAdvancedImport = { raw };
    showAdvancedImportPanel(true);
    populateAdvancedImportUI(raw);
  } catch (error) {
    console.error("Erreur import avancé:", error);
    alert(`Erreur import avancé: ${error.message}`);
  }
}

function applyAdvancedImport() {
  if (!pendingAdvancedImport?.raw) return;
  const mapping = readAdvancedMapping();
  try {
    const { nodes, links } = normalizeImportedGraph(pendingAdvancedImport.raw, mapping);
    const oldState = { nodes: [...graphState.nodes], links: [...graphState.links] };
    performAction({
      type: "import_graph",
      data: { oldState, newState: { nodes, links }, label: "Import JSON graph (advanced)" }
    });
    renderer.updateGraph();
    eventBus.emit('graph-imported', { nodes, links });
    showAdvancedImportPanel(false);
    pendingAdvancedImport = null;
  } catch (error) {
    console.error("Erreur application import avancé:", error);
    alert(`Erreur import avancé: ${error.message}`);
  }
}

function cancelAdvancedImport() {
  pendingAdvancedImport = null;
  showAdvancedImportPanel(false);
}

function showAdvancedImportPanel(show) {
  const overlay = document.getElementById('advanced-import-overlay');
  if (!overlay) return;
  overlay.classList.toggle('hidden', !show);
}

function populateAdvancedImportUI(raw) {
  const rootKeys = Object.keys(raw || {});
  const nodeKeyGuess = guessNodesKey(raw);
  const linkKeyGuess = guessLinksKey(raw);
  const nodes = resolveRootArray(raw, nodeKeyGuess) || [];
  const links = resolveRootArray(raw, linkKeyGuess) || [];

  const nodeFields = collectKeysFromArray(nodes);
  const linkFields = collectKeysFromArray(links);

  fillInputWithDatalist('advanced-nodes-key', rootKeys, nodeKeyGuess || '');
  fillInputWithDatalist('advanced-links-key', rootKeys, linkKeyGuess || '');

  fillInputWithDatalist('advanced-node-id', nodeFields, guessField(nodeFields, ['id', 'key', 'uuid', 'uid']));
  fillInputWithDatalist('advanced-node-label', nodeFields, guessField(nodeFields, ['name', 'label', 'title']));
  fillInputWithDatalist('advanced-node-desc', nodeFields, guessField(nodeFields, ['description', 'desc', 'details']));

  fillInputWithDatalist('advanced-link-source', linkFields, guessField(linkFields, ['source', 'from', 'src', 'origin', 'start']));
  fillInputWithDatalist('advanced-link-target', linkFields, guessField(linkFields, ['target', 'to', 'dst', 'destination', 'end']));
  fillInputWithDatalist('advanced-link-label', linkFields, guessField(linkFields, ['name', 'label', 'type']));
}

function readAdvancedMapping() {
  return {
    nodesKey: document.getElementById('advanced-nodes-key')?.value || '',
    linksKey: document.getElementById('advanced-links-key')?.value || '',
    nodeIdField: document.getElementById('advanced-node-id')?.value || '',
    nodeLabelField: document.getElementById('advanced-node-label')?.value || '',
    nodeDescField: document.getElementById('advanced-node-desc')?.value || '',
    linkSourceField: document.getElementById('advanced-link-source')?.value || '',
    linkTargetField: document.getElementById('advanced-link-target')?.value || '',
    linkLabelField: document.getElementById('advanced-link-label')?.value || '',
    languageKey: document.getElementById('advanced-language-key')?.value || ''
  };
}

function fillInputWithDatalist(inputId, options, value) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const listId = `${inputId}-list`;
  let list = document.getElementById(listId);
  if (!list) {
    list = document.createElement('datalist');
    list.id = listId;
    input.setAttribute('list', listId);
    input.parentNode.appendChild(list);
  }
  list.innerHTML = (options || []).map(o => `<option value="${o}"></option>`).join('');
  if (value != null) input.value = value;
}

/**
 * Normalise et valide un JSON de graphes provenant de schémas variés.
 * Objectif: accepter plusieurs formats tout en garantissant des données sûres.
 */
function normalizeImportedGraph(raw, mapping = null) {
  if (!raw || typeof raw !== 'object') {
    throw new Error("Format JSON invalide: objet requis.");
  }

  // Supporter les wrappers fréquents
  let data = raw;
  if (raw.graph && typeof raw.graph === 'object') data = raw.graph;
  if (raw.data && typeof raw.data === 'object') data = raw.data;

  // Détecter les tableaux de noeuds/liens avec plusieurs noms possibles
  const nodesArray = resolveRootArray(data, mapping?.nodesKey) ||
    data.nodes || data.vertices || data.items || data.nodeList || data.node || null;
  const linksArray = resolveRootArray(data, mapping?.linksKey) ||
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
    const id = mapping?.nodeIdField
      ? resolveValue(node, mapping.nodeIdField, mapping.languageKey)
      : extractNodeId(node, idx);
    const label = mapping?.nodeLabelField
      ? resolveValue(node, mapping.nodeLabelField, mapping.languageKey)
      : undefined;
    const desc = mapping?.nodeDescField
      ? resolveValue(node, mapping.nodeDescField, mapping.languageKey)
      : undefined;
    const normalized = { ...node, id: String(id) };
    if (label != null && label !== '') normalized.name = String(label);
    if (desc != null && desc !== '') normalized.description = String(desc);
    return normalized;
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

    const { sourceId, targetId } = mapping
      ? extractLinkEndpointsWithMapping(link, mapping)
      : extractLinkEndpoints(link);
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

    const label = mapping?.linkLabelField
      ? resolveValue(link, mapping.linkLabelField, mapping.languageKey)
      : undefined;
    const normalized = {
      ...link,
      id: String(link.id ?? `${sourceId}-${targetId}-${idx}`),
      source: nodeById.get(String(sourceId)),
      target: nodeById.get(String(targetId))
    };
    if (label != null && label !== '') normalized.name = String(label);
    return normalized;
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

function extractLinkEndpointsWithMapping(link, mapping) {
  const src = mapping.linkSourceField ? resolveValue(link, mapping.linkSourceField, mapping.languageKey) : null;
  const tgt = mapping.linkTargetField ? resolveValue(link, mapping.linkTargetField, mapping.languageKey) : null;
  const sourceId = normalizeEndpoint(src);
  const targetId = normalizeEndpoint(tgt);
  return { sourceId, targetId };
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

function resolveValue(obj, path, langKey) {
  if (!path) return null;
  let value = getByPath(obj, path);
  if (value && typeof value === 'object' && langKey) {
    if (value[langKey] != null) return value[langKey];
  }
  return value;
}

function getByPath(obj, path) {
  if (!obj || !path) return null;
  if (!path.includes('.')) return obj[path];
  return path.split('.').reduce((acc, key) => (acc ? acc[key] : undefined), obj);
}

function resolveRootArray(data, key) {
  if (!data || !key) return null;
  if (key.includes('.')) return getByPath(data, key);
  return data[key];
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

function collectKeysFromArray(arr) {
  const set = new Set();
  (arr || []).forEach(item => {
    if (!item || typeof item !== 'object') return;
    Object.keys(item).forEach(k => set.add(k));
  });
  return Array.from(set);
}

function guessNodesKey(raw) {
  if (!raw || typeof raw !== 'object') return '';
  const keys = Object.keys(raw);
  const arrays = keys.filter(k => Array.isArray(raw[k]));
  // Prefer array with "node-ish" keys
  const nodeish = arrays.find(k => {
    const item = raw[k]?.[0];
    return item && typeof item === 'object' && ('id' in item || 'name' in item || 'label' in item);
  });
  return nodeish || arrays[0] || '';
}

function guessLinksKey(raw) {
  if (!raw || typeof raw !== 'object') return '';
  const keys = Object.keys(raw);
  const arrays = keys.filter(k => Array.isArray(raw[k]));
  const linkish = arrays.find(k => {
    const item = raw[k]?.[0];
    return item && typeof item === 'object' && (
      'source' in item || 'target' in item || 'from' in item || 'to' in item
    );
  });
  return linkish || '';
}

function guessField(fields, candidates) {
  const f = (fields || []).map(x => x.toLowerCase());
  for (const cand of candidates) {
    const idx = f.indexOf(cand.toLowerCase());
    if (idx >= 0) return fields[idx];
  }
  return '';
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
  loadJSONModelFile,
  prepareAdvancedImport,
  applyAdvancedImport,
  cancelAdvancedImport
};
