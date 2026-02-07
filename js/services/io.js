/**
 * Service pour l'import/export des données du graphe
 */
import { performAction } from '../state/undo_redo.js';
import { uiConfig, graphConfig } from '../config/index.js';
import { listJsonFiles } from './fileService.js';  // <— nouvel import
import eventBus from './EventBus.js';
import {
  inferTypeFromValues,
  normalizeType,
  toExternalType
} from './FieldTypeService.js';
import { parseExpression } from '../expr/ExpressionEngine.js';

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

function stripInternalFields(obj) {
  const out = {};
  Object.keys(obj || {}).forEach(key => {
    if (key.startsWith('__') && !['__localStyle', '__localStyleEnabled'].includes(key)) return;
    out[key] = obj[key];
  });
  return out;
}

/**
 * Exporte le graphe actuel en JSON
 */
function exportJson() {
  exportJsonAdvanced({ format: 'auto' });
}

function exportJsonAdvanced(options = {}) {
  const format = options.format || 'auto';
  const langs = parseLangs(options.langs || graphState?.globalSettings?.multilingualLangs || 'fr,en');
  const singleLang = (options.lang || '').trim();
  const includeXY = options.includeXY || 'auto';
  const { xField, yField, nodeIdField } = graphState.globalSettings;

  const exportData = {
    nodes: graphState.nodes.map(node => {
      const { vx, vy, fx, fy, ...rest } = node;
      let out = stripInternalFields({ ...rest });

      if (format === 'auto') {
        out = autoConvertMultilang(out, langs);
      } else if (format === 'object') {
        out = convertSuffixToObject(out, langs);
      } else if (format === 'suffix') {
        out = convertObjectToSuffix(out, langs);
      } else if (format === 'single') {
        out = convertToSingleLang(out, langs, singleLang);
      } else if (format === 'raw') {
        // no conversion
      }

      // Gestion x/y à l'export
      if (includeXY === 'no' || (includeXY === 'auto' && ((xField && xField !== 'x') || (yField && yField !== 'y')))) {
        if (xField !== 'x') delete out.x;
        if (yField !== 'y') delete out.y;
      }

      return out;
    }),
    links: graphState.links.map(link => {
      const { source, target, ...rest } = link;
      let out = stripInternalFields({ ...rest });

      if (format === 'auto') {
        out = autoConvertMultilang(out, langs);
      } else if (format === 'object') {
        out = convertSuffixToObject(out, langs);
      } else if (format === 'suffix') {
        out = convertObjectToSuffix(out, langs);
      } else if (format === 'single') {
        out = convertToSingleLang(out, langs, singleLang);
      } else if (format === 'raw') {
        // no conversion
      }

      return {
        ...out,
        source: source[nodeIdField] ?? source.id,
        target: target[nodeIdField] ?? target.id
      };
    })
  };

  exportData.schema = buildSchemaForExport(exportData.nodes, exportData.links, graphState?.schema);
  exportData.styleRules = graphConfig?.styleRules || { nodes: [], links: [] };
  exportData.pieRules = graphConfig?.pieRules || { nodes: [] };

  if (format === 'csv_nodes') {
    downloadDelimited(exportData.nodes, 'nodes.csv', ',');
    return;
  }
  if (format === 'csv_links') {
    downloadDelimited(exportData.links, 'links.csv', ',');
    return;
  }
  if (format === 'tsv_nodes') {
    downloadDelimited(exportData.nodes, 'nodes.tsv', '\t');
    return;
  }
  if (format === 'tsv_links') {
    downloadDelimited(exportData.links, 'links.tsv', '\t');
    return;
  }
  if (format === 'xls_nodes') {
    downloadExcel(exportData.nodes, 'nodes.xls');
    return;
  }
  if (format === 'xls_links') {
    downloadExcel(exportData.links, 'links.xls');
    return;
  }

  const jsonStr = JSON.stringify(exportData, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "graph.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

/**
 * Charge un graphe à partir de données JSON
 */
function loadJSONGraph(jsonContent) {
  try {
    const jsonData = typeof jsonContent === 'string' ? JSON.parse(jsonContent) : jsonContent;
      const { nodes, links, schema, styleRules, pieRules } = normalizeImportedGraph(jsonData);
    
    // Sauvegarder l'état précédent
    const oldState = {
      nodes: [...graphState.nodes],
      links: [...graphState.links],
      schema: graphState.getSchemaSnapshot?.() || graphState.schema
    };
    
    // Appliquer la nouvelle structure de graphe
    performAction({ 
      type: "import_graph", 
      data: { 
        oldState,
        newState: { nodes, links, schema },
        label: "Import JSON graph" 
      } 
    });
    
    // Mettre à jour le graphe
    renderer.updateGraph();
    applyImportedRules(styleRules, pieRules);
    
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

// expose for other modules if needed

function applyAdvancedImport() {
  if (!pendingAdvancedImport?.raw) return;
  const mapping = readAdvancedMapping();
  try {
    const { nodes, links, schema, styleRules, pieRules } = normalizeImportedGraph(pendingAdvancedImport.raw, mapping);
    const oldState = { nodes: [...graphState.nodes], links: [...graphState.links], schema: graphState.getSchemaSnapshot?.() || graphState.schema };
    performAction({ 
      type: "import_graph", 
      data: { oldState, newState: { nodes, links, schema }, label: "Import JSON graph (advanced)" } 
    });
    renderer.updateGraph();
    applyImportedRules(styleRules, pieRules);
    eventBus.emit('graph-imported', { nodes, links });
    // ensure UI selects are refreshed
    // compatibility: some UI code still listens on window
    window.dispatchEvent(new CustomEvent('graph-imported', { detail: { nodes, links } }));
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

function showAdvancedExportPanel(show) {
  const overlay = document.getElementById('advanced-export-overlay');
  if (!overlay) return;
  overlay.classList.toggle('hidden', !show);
}

function exportImage() {
  const svg = document.querySelector('svg');
  if (!svg) return;
  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(svg);
  const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);

  const img = new Image();
  const width = svg.clientWidth || +svg.getAttribute('width') || 1000;
  const height = svg.clientHeight || +svg.getAttribute('height') || 1000;

  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    URL.revokeObjectURL(url);

    canvas.toBlob(blob => {
      if (!blob) return;
      const pngUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = pngUrl;
      a.download = 'graph.png';
      a.click();
      setTimeout(() => URL.revokeObjectURL(pngUrl), 100);
    });
  };
  img.src = url;
}

function populateAdvancedImportUI(raw) {
  const rootKeys = Object.keys(raw || {});
  const nodeKeyGuess = guessNodesKey(raw);
  const linkKeyGuess = guessLinksKey(raw);
  const nodes = resolveRootArray(raw, nodeKeyGuess) || [];
  const links = resolveRootArray(raw, linkKeyGuess) || [];

  const nodeFields = expandFieldsWithMultilang(collectKeysFromArray(nodes), nodes);
  const linkFields = expandFieldsWithMultilang(collectKeysFromArray(links), links);
  const detectedLangs = detectLangsFromItems(nodes.length ? nodes : links);
  const defaultLang = detectedLangs[0] || '';

  fillInputWithDatalist('advanced-nodes-key', rootKeys, nodeKeyGuess || '');
  fillInputWithDatalist('advanced-links-key', rootKeys, linkKeyGuess || '');

  fillInputWithDatalist('advanced-node-id', nodeFields, guessField(nodeFields, ['id', 'key', 'uuid', 'uid']));
  fillInputWithDatalist('advanced-node-label', nodeFields, guessField(nodeFields, defaultLang ? [`name_${defaultLang}`, `name.${defaultLang}`, 'name', 'label', 'title'] : ['name', 'label', 'title']));
  fillInputWithDatalist('advanced-node-desc', nodeFields, guessField(nodeFields, defaultLang ? [`description_${defaultLang}`, `description.${defaultLang}`, 'description', 'desc', 'details'] : ['description', 'desc', 'details']));

  fillInputWithDatalist('advanced-link-source', linkFields, guessField(linkFields, ['source', 'from', 'src', 'origin', 'start']));
  fillInputWithDatalist('advanced-link-target', linkFields, guessField(linkFields, ['target', 'to', 'dst', 'destination', 'end']));
  fillInputWithDatalist('advanced-link-label', linkFields, guessField(linkFields, defaultLang ? [`name_${defaultLang}`, `name.${defaultLang}`, 'name', 'label', 'type'] : ['name', 'label', 'type']));

  const preview = document.getElementById('advanced-import-preview');
  if (preview) {
    const nodePreview = (nodes || []).slice(0, 10).map(n => JSON.stringify(n, null, 0)).join('\n');
    const linkPreview = (links || []).slice(0, 15).map(l => JSON.stringify(l, null, 0)).join('\n');
    preview.textContent = `NODES (10 max)\n${nodePreview}\n\nLINKS (15 max)\n${linkPreview}`;
  }
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
  if (input.tagName === 'SELECT') {
    input.innerHTML = [''].concat(options || []).map(o => `<option value="${o}">${o}</option>`).join('');
    if (value != null) input.value = value;
    return;
  }
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

  // Détection multilingue (objets) -> suffixes
  expandMultilangObjectsToSuffix(nodes, ['name', 'description']);
  expandMultilangObjectsToSuffix(links, ['name', 'description']);

  const schemaSource = raw.schema || data.schema || null;
  const schema = normalizeSchema(schemaSource, nodes, links);

  const { styleRules, pieRules } = extractImportedRules(raw, data);

  return { nodes, links, schema, styleRules, pieRules };
}

function applyImportedRules(styleRules, pieRules) {
  if (styleRules) {
    graphConfig.styleRules = styleRules;
    eventBus.emit('style-rules-updated', { rules: styleRules });
  }
  if (pieRules) {
    graphConfig.pieRules = pieRules;
    eventBus.emit('pie-rules-updated', { rules: pieRules });
  }
}

function extractImportedRules(raw, data) {
  const configSource = pickConfigSource(raw, data);
  const styleRulesRaw = configSource?.styleRules ?? raw.styleRules ?? data?.styleRules;
  const pieRulesRaw = configSource?.pieRules ?? raw.pieRules ?? data?.pieRules;
  const styleRules = styleRulesRaw !== undefined ? normalizeStyleRules(styleRulesRaw) : null;
  const pieRules = pieRulesRaw !== undefined ? normalizePieRules(pieRulesRaw) : null;
  return { styleRules, pieRules };
}

function pickConfigSource(raw, data) {
  const candidates = [raw?.config, raw?.graphConfig, raw?.settings, data];
  return candidates.find(c => c && typeof c === 'object' && !Array.isArray(c)) || null;
}

function normalizeStyleRules(data) {
  if (!data) return { nodes: [], links: [] };
  if (Array.isArray(data)) return { nodes: data, links: [] };
  return {
    nodes: Array.isArray(data.nodes) ? data.nodes : [],
    links: Array.isArray(data.links) ? data.links : []
  };
}

function normalizePieRules(data) {
  if (!data) return { nodes: [] };
  if (Array.isArray(data)) return { nodes: data };
  return {
    nodes: Array.isArray(data.nodes) ? data.nodes : []
  };
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
  if (value == null && path.includes('_')) {
    const parts = path.split('_');
    const maybeLang = parts.pop();
    const base = parts.join('_');
    const baseVal = obj?.[base];
    if (baseVal && typeof baseVal === 'object' && baseVal[maybeLang] != null) {
      value = baseVal[maybeLang];
    }
  }
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

function parseLangs(value) {
  return (value || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

function convertSuffixToObject(obj, langs) {
  if (!langs.length) return obj;
  const out = { ...obj };
  const groups = {};

  Object.keys(out).forEach(key => {
    const match = langs.find(l => key.endsWith(`_${l}`));
    if (!match) return;
    const base = key.slice(0, -1 * (match.length + 1));
    if (!groups[base]) groups[base] = {};
    groups[base][match] = out[key];
    delete out[key];
  });

  Object.keys(groups).forEach(base => {
    out[base] = groups[base];
  });

  return out;
}

function autoConvertMultilang(obj, langs) {
  const hasSuffix = hasSuffixFields(obj, langs);
  const hasObject = hasObjectLangFields(obj);
  if (hasSuffix && !hasObject) return convertSuffixToObject(obj, langs);
  return obj;
}

function hasSuffixFields(obj, langs) {
  if (!langs.length) return false;
  return Object.keys(obj).some(key => langs.some(l => key.endsWith(`_${l}`)));
}

function hasObjectLangFields(obj) {
  return Object.keys(obj).some(key => {
    const val = obj[key];
    if (!val || typeof val !== 'object') return false;
    return Object.keys(val).length > 0;
  });
}

function convertObjectToSuffix(obj, langs) {
  if (!langs.length) return obj;
  const out = { ...obj };
  Object.keys(out).forEach(key => {
    const val = out[key];
    if (!val || typeof val !== 'object') return;
    let hasLang = false;
    langs.forEach(l => {
      if (val[l] != null) {
        out[`${key}_${l}`] = val[l];
        hasLang = true;
      }
    });
    if (hasLang) delete out[key];
  });
  return out;
}

function convertToSingleLang(obj, langs, lang) {
  const chosen = lang || langs[0] || '';
  if (!chosen) return obj;
  let out = { ...obj };

  // objects -> single value
  Object.keys(out).forEach(key => {
    const val = out[key];
    if (val && typeof val === 'object' && val[chosen] != null) {
      out[key] = val[chosen];
    }
  });

  // suffix -> base
  const suffix = `_${chosen}`;
  Object.keys(out).forEach(key => {
    if (key.endsWith(suffix)) {
      const base = key.slice(0, -suffix.length);
      out[base] = out[key];
      delete out[key];
    }
  });

  return out;
}

function expandMultilangObjectsToSuffix(items, fields) {
  const detectedLangs = new Set();
  items.forEach(item => {
    fields.forEach(field => {
      const val = item[field];
      if (!val || typeof val !== 'object') return;
      Object.keys(val).forEach(lang => detectedLangs.add(lang));
    });
  });
  const langs = Array.from(detectedLangs);
  if (!langs.length) return;

  items.forEach(item => {
    fields.forEach(field => {
      const val = item[field];
      if (!val || typeof val !== 'object') return;
      langs.forEach(lang => {
        const key = `${field}_${lang}`;
        if (item[key] == null && val[lang] != null) {
          item[key] = val[lang];
        }
      });
    });
  });
}

function downloadDelimited(items, filename, delimiter) {
  if (!items.length) return;
  const keys = Array.from(new Set(items.flatMap(item => Object.keys(item))));
  const rows = [
    keys.join(delimiter),
    ...items.map(item => keys.map(k => csvValue(item[k], delimiter)).join(delimiter))
  ];
  const csv = rows.join('\n');
  const blob = new Blob([csv], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

function csvValue(val, delimiter) {
  if (val == null) return '';
  const s = typeof val === 'object' ? JSON.stringify(val) : String(val);
  if (s.includes(delimiter) || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function downloadExcel(items, filename) {
  if (!items.length) return;
  const keys = Array.from(new Set(items.flatMap(item => Object.keys(item))));
  const header = `<tr>${keys.map(k => `<th>${k}</th>`).join('')}</tr>`;
  const rows = items.map(item =>
    `<tr>${keys.map(k => `<td>${escapeHtml(item[k])}</td>`).join('')}</tr>`
  ).join('');
  const html = `
    <html><head><meta charset="utf-8"></head>
    <body><table>${header}${rows}</table></body></html>
  `;
  const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

function escapeHtml(value) {
  if (value == null) return '';
  const s = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function detectLangsFromGraph(state) {
  const langs = new Set();
  let format = '';
  const collect = item => {
    Object.keys(item || {}).forEach(key => {
      const val = item[key];
      if (val && typeof val === 'object') {
        Object.keys(val).forEach(l => langs.add(l));
        format = format || 'object';
      }
      if (key.includes('_')) {
        const parts = key.split('_');
        const maybeLang = parts[parts.length - 1];
        if (maybeLang.length <= 5) {
          langs.add(maybeLang);
          format = format || 'suffix';
        }
      }
    });
  };
  state?.nodes?.forEach(collect);
  state?.links?.forEach(collect);
  return { langs: Array.from(langs), format };
}

function collectKeysFromArray(arr) {
  const set = new Set();
  (arr || []).forEach(item => {
    if (!item || typeof item !== 'object') return;
    Object.keys(item).forEach(k => set.add(k));
  });
  return Array.from(set);
}

function normalizeSchemaGroup(rawGroup = {}) {
  const out = {};
  Object.keys(rawGroup || {}).forEach(field => {
    const entry = rawGroup[field];
    const type = typeof entry === 'string' ? entry : entry?.type;
    const normalized = {
      type: normalizeType(type)
    };
    if (entry && typeof entry === 'object') {
      if (entry.expr) normalized.expr = entry.expr;
      if (entry.ast) normalized.ast = entry.ast;
      if (entry.resultType) normalized.resultType = normalizeType(entry.resultType);
      if (entry.visual) normalized.visual = entry.visual;
    }
    if (!normalized.ast && normalized.expr) {
      try {
        normalized.ast = parseExpression(normalized.expr);
      } catch (e) {
        // ignore parse errors
      }
    }
    out[field] = normalized;
  });
  return out;
}

function ensureSchemaFields(group, items) {
  const out = { ...(group || {}) };
  const keys = collectKeysFromArray(items || []);
  keys.forEach(field => {
    if (!out[field]) {
      const values = (items || []).map(i => i[field]);
      out[field] = { type: inferTypeFromValues(values) };
    }
  });
  return out;
}

function normalizeSchema(rawSchema, nodes, links) {
  const schema = { nodes: {}, links: {} };
  if (rawSchema && typeof rawSchema === 'object') {
    schema.nodes = normalizeSchemaGroup(rawSchema.nodes || {});
    schema.links = normalizeSchemaGroup(rawSchema.links || {});
  }
  schema.nodes = ensureSchemaFields(schema.nodes, nodes);
  schema.links = ensureSchemaFields(schema.links, links);
  return schema;
}

function buildSchemaGroupForExport(items, internalGroup, overrides = {}) {
  const out = {};
  const keys = collectKeysFromArray(items || []);
  keys.forEach(field => {
    const entry = internalGroup?.[field] || {};
    const hint = entry?.type;
    const type = normalizeType(overrides[field] || hint || inferTypeFromValues((items || []).map(i => i[field])));
    const exported = { type: toExternalType(type) };
    if (entry?.type === 'conditional') {
      exported.type = 'conditional';
      if (entry.expr) exported.expr = entry.expr;
      if (entry.ast) exported.ast = entry.ast;
      if (entry.resultType) exported.resultType = toExternalType(entry.resultType);
      if (entry.visual) exported.visual = entry.visual;
    }
    out[field] = exported;
  });
  return out;
}

function buildSchemaForExport(nodes, links, internalSchema) {
  const nodeSchema = buildSchemaGroupForExport(nodes, internalSchema?.nodes);
  const linkSchema = buildSchemaGroupForExport(links, internalSchema?.links, {
    source: 'text',
    target: 'text'
  });
  return { nodes: nodeSchema, links: linkSchema };
}

function expandFieldsWithMultilang(fields, items) {
  const langs = detectLangsFromItems(items);
  if (!langs.length) return fields;
  const expanded = new Set(fields);
  fields.forEach(f => {
    langs.forEach(lang => {
      expanded.add(`${f}_${lang}`);
      expanded.add(`${f}.${lang}`);
    });
  });
  return Array.from(expanded);
}

function detectLangsFromItems(items) {
  const langs = new Set();
  (items || []).forEach(item => {
    Object.keys(item || {}).forEach(key => {
      const val = item[key];
      if (val && typeof val === 'object') {
        Object.keys(val).forEach(l => langs.add(l));
      }
    });
  });
  return Array.from(langs);
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
  exportJsonAdvanced,
  exportImage,
  detectLangsFromGraph,
  loadJSONGraph,
  loadJSONModelFile,
  prepareAdvancedImport,
  applyAdvancedImport,
  cancelAdvancedImport
};

