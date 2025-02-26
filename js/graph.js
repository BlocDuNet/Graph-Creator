// graph.js
// ===== IMPORTS =====
import { getForceConfiguration } from './config_graph.js';
import {
  performAction,
  undo,
  redo,
  jumpToHistory,
  registerGraphState,
  registerUpdateCallback
} from './undo_redo.js';

// ===== ÉTAT GLOBAL DU GRAPHE =====
const defaultNodeRadius = 30; // Valeur par défaut

// Données initiales
const initialNodes = [
  { id: '1', name: 'Node1', description: 'Description1', x: 100, y: 300, size: defaultNodeRadius },
  { id: '2', name: 'Node2', description: 'Description2', x: 200, y: 200, size: defaultNodeRadius },
  { id: '3', name: 'Node3', description: 'Description3', x: 300, y: 300, size: defaultNodeRadius }
];
const initialLinks = [
  { id: '1', name: 'Link1', description: 'Description1', source: '1', target: '2' },
  { id: '2', name: 'Link2', description: 'Description2', source: '2', target: '3' }
];

// L'état global du graphe (objet mutable)
export let graphState = {
  nodes: [...initialNodes],
  links: [...initialLinks]
};

let nextNodeId = initialNodes.length + 1;
let nextLinkId = initialLinks.length + 1;

// ===== INITIALISATION D3 =====
const svg = d3.select('svg');
const width = +svg.attr('width');
const height = +svg.attr('height');
const g = svg.append('g'); // Groupe global

// Configuration de la simulation
const forceConfig = getForceConfiguration();
const simulation = d3.forceSimulation()
  .force('link', forceConfig.link)
  .force('charge', forceConfig.charge)
  .force('center', forceConfig.center);

// Enregistrement dans undo/redo
registerGraphState(graphState);
registerUpdateCallback(updateGraph);

// ===== FORMULAIRES & RÉGLAGES GLOBAUX (onglet "Values") =====
const nodeForm = d3.select('#node-form');
const linkForm = d3.select('#link-form');
let nodeInputs = {};
let linkInputs = {};

// Création initiale des formulaires
createFormInputs(graphState.nodes, nodeForm, nodeInputs);
createFormInputs(graphState.links, linkForm, linkInputs);

// Réglages globaux – ces valeurs s’appliquent à l’ensemble du graph.
let globalSettings = {
  nodeLabelField: "name",    // Par défaut, le label pour les nœuds est "name"
  linkLabelField: "",        // Par défaut vide pour les liens
  nodeSizeField: "",         // Si vide, on utilise la propriété "size"
  defaultNodeSize: 30,       // Taille par défaut pour la création de nouveaux nœuds
  defaultFocusField: "name"  // Champ par défaut à focus (sera remplacé par le choix dans le dropdown)
};

// --- FONCTIONS POUR LES FORMULAIRES ---

function createFormInputs(data, formElement, inputObject) {
  formElement.selectAll('div').remove();
  const fieldNames = getFieldOptions(data);
  fieldNames.forEach(fieldName => createField(fieldName, formElement, inputObject, data));
}

function createField(fieldName, formElement, inputObject, data) {
  const fieldDiv = formElement.append('div');
  fieldDiv.append('label')
    .attr('for', `${formElement.attr('id')}-${fieldName}`)
    .text(`${fieldName}:`);
  const input = fieldDiv.append('input')
    .attr('type', 'text')
    .attr('id', `${formElement.attr('id')}-${fieldName}`)
    .attr('name', fieldName)
    .on('blur', function () {
      const newValue = this.value;
      if (selectedNode && inputObject === nodeInputs) {
        const oldValue = selectedNode[fieldName] || "";
        if (newValue !== oldValue) {
          performAction({
            type: "update_node",
            data: {
              nodeId: selectedNode.id,
              field: fieldName,
              from: oldValue,
              to: newValue,
              label: `Rename node (${oldValue} → ${newValue})`
            }
          });
        }
      } else if (selectedLink && inputObject === linkInputs) {
        const oldValue = selectedLink[fieldName] || "";
        if (newValue !== oldValue) {
          performAction({
            type: "update_link",
            data: {
              linkId: selectedLink.id,
              field: fieldName,
              from: oldValue,
              to: newValue,
              label: `Rename link (${oldValue} → ${newValue})`
            }
          });
        }
      }
      updateGraph();
    });
  inputObject[fieldName] = input;
  if (fieldName !== "id" && fieldName !== "x" && fieldName !== "y") {
    fieldDiv.append('button')
      .text('x')
      .on('click', function () {
        if (confirm("Supprimer ce champ pour tous les éléments ?")) {
          data.forEach(item => delete item[fieldName]);
          fieldDiv.remove();
          delete inputObject[fieldName];
          performAction({ type: "remove_field", data: { field: fieldName, target: (inputObject === nodeInputs ? "node" : "link"), label: `Remove field ${fieldName}` } });
          updateGraph();
        }
      });
  }
}

function getFieldOptions(data) {
  const excluded = ["x", "y", "vx", "vy", "fx", "fy"];
  const fields = new Set();
  data.forEach(item => {
    Object.keys(item).forEach(key => {
      if (!excluded.includes(key)) fields.add(key);
    });
  });
  return Array.from(fields);
}

function addField(fieldName, formElement, inputObject, data) {
  if (fieldName.trim() === '' || Object.keys(inputObject).includes(fieldName)) return;
  performAction({ type: "add_field", data: { field: fieldName, target: (inputObject === nodeInputs ? "node" : "link"), label: `Add field ${fieldName}` } });
  data.forEach(item => { item[fieldName] = ""; });
  createField(fieldName, formElement, inputObject, data);
  updateGraph();
}

function updateForm(inputObject, dataItem) {
  Object.keys(inputObject).forEach(key => {
    const value = (key === "source" || key === "target")
      ? (dataItem[key] && dataItem[key].id ? dataItem[key].id : "")
      : dataItem[key] || "";
    inputObject[key].property('value', value);
  });
  // Le champ à focus est celui actuellement sélectionné dans le dropdown correspondant.
  let fieldToFocus;
  if (inputObject === nodeInputs) {
    const selectedField = d3.select('#node-label').property('value');
    fieldToFocus = (selectedField && selectedField.trim() !== "") ? selectedField : "name";
  } else {
    const selectedField = d3.select('#link-label').property('value');
    fieldToFocus = (selectedField && selectedField.trim() !== "") ? selectedField : "name";
  }
  if (fieldToFocus && inputObject[fieldToFocus]) {
    focusInputField('a[href="#tab2"]', `${(inputObject === nodeInputs ? nodeForm : linkForm).attr("id")}-${fieldToFocus}`);
  }
}

function focusInputField(tabSelector, fieldId) {
  const tabLink = document.querySelector(tabSelector);
  if (tabLink) tabLink.click();
  setTimeout(() => {
    const inputField = document.getElementById(fieldId);
    if (inputField) {
      inputField.focus();
      inputField.select();
    }
  }, 300);
}

// Événements pour les boutons "Add Node Field" et "Add Link Field"
d3.select("#addNodeFieldButton").on("click", () => {
  const fieldName = d3.select("#addNodeFieldInput").property("value").trim();
  if (fieldName) {
    addField(fieldName, nodeForm, nodeInputs, graphState.nodes);
    d3.select("#addNodeFieldInput").property("value", "");
  }
});
d3.select("#addLinkFieldButton").on("click", () => {
  const fieldName = d3.select("#addLinkFieldInput").property("value").trim();
  if (fieldName) {
    addField(fieldName, linkForm, linkInputs, graphState.links);
    d3.select("#addLinkFieldInput").property("value", "");
  }
});

// Mise à jour des menus déroulants globaux
function updateGlobalSelects() {
  updateSelectOptions(d3.select('#node-label'), getFieldOptions(graphState.nodes), globalSettings.nodeLabelField);
  updateSelectOptions(d3.select('#link-label'), getFieldOptions(graphState.links), globalSettings.linkLabelField);
  updateSelectOptions(d3.select('#node-size-field'), getFieldOptions(graphState.nodes), globalSettings.nodeSizeField);
}

function updateSelectOptions(selectElem, optionsArr, selectedValue) {
  selectElem.selectAll('option').remove();
  selectElem.append('option').attr('value', '').text('');
  optionsArr.forEach(opt => {
    selectElem.append('option').attr('value', opt).text(opt);
  });
  if (selectedValue && optionsArr.includes(selectedValue)) {
    selectElem.property('value', selectedValue);
  }
  // Dès que l'utilisateur change la sélection, mettre à jour immédiatement le graph.
  selectElem.on("change", () => updateGraph());
}

// ===== AFFICHAGE DU GRAPHE =====

function updateNodes() {
  const sizeField = d3.select("#node-size-field").property("value");
  const nodeSelection = g.selectAll('.node').data(graphState.nodes, d => d.id);
  const nodeEnter = nodeSelection.enter()
    .append('g')
    .attr('class', 'node')
    .call(drag(simulation))
    .on('click', selectNode)
    .on('dblclick', (event, d) => {
      event.stopPropagation();
      updateGraph();
    });
  nodeEnter.append('circle')
    .attr('r', d => (sizeField && d[sizeField]) ? +d[sizeField] : (d.size || defaultNodeRadius));
  nodeEnter.append('text')
    .attr('dx', d => (sizeField && d[sizeField]) ? (+d[sizeField] + 5) : 35)
    .attr('dy', 5)
    .text(d => {
      const field = d3.select('#node-label').property('value') || globalSettings.nodeLabelField;
      return field ? (d[field] || "") : "";
    });
  nodeSelection.merge(nodeEnter)
    .classed('selected', d => d === selectedNode)
    .select('text')
    .text(d => {
      const field = d3.select('#node-label').property('value') || globalSettings.nodeLabelField;
      return field ? (d[field] || "") : "";
    });
  nodeSelection.exit().remove();
}

function updateLinks() {
  const sizeField = d3.select("#node-size-field").property("value");
  const linkSelection = g.selectAll('.link').data(graphState.links, d => `${d.source.id}-${d.target.id}`);
  linkSelection.enter()
    .append('path')
    .attr('class', 'link')
    .attr('fill', 'none')
    .attr('stroke', '#000')
    .attr('marker-end', 'url(#arrowhead)')
    .on('click', selectLink)
    .on('dblclick', event => {
      event.stopPropagation();
      updateGraph();
    })
    .merge(linkSelection)
    .classed('selected', d => d === selectedLink);
  linkSelection.exit().remove();
}

function updateLinkLabels() {
  const linkLabels = g.selectAll('.link-label').data(graphState.links, d => `${d.source.id}-${d.target.id}`);
  linkLabels.enter()
    .append('text')
    .attr('class', 'link-label')
    .attr('dx', 10)
    .merge(linkLabels)
    .classed('selected', d => d === selectedLink)
    .text(d => {
      const field = d3.select('#link-label').property('value') || globalSettings.linkLabelField;
      return field ? (d[field] || "") : "";
    })
    .on('click', selectLink);
  linkLabels.exit().remove();
}

function updateGraph() {
  updateNodes();
  updateLinks();
  updateLinkLabels();
  updateGlobalSelects();
  simulation.nodes(graphState.nodes).on('tick', ticked);
  simulation.force('link').links(graphState.links);
  simulation.alpha(1).restart();
  updateHistorySelect();
}

function ticked() {
  const sizeField = d3.select("#node-size-field").property("value");
  g.selectAll('.link')
    .attr('d', d => {
      let rSource = (sizeField && d.source[sizeField]) ? +d.source[sizeField] : (d.source.size || defaultNodeRadius);
      let rTarget = (sizeField && d.target[sizeField]) ? +d.target[sizeField] : (d.target.size || defaultNodeRadius);
      const dx = d.target.x - d.source.x;
      const dy = d.target.y - d.source.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const sx = d.source.x + (dx * rSource / dist);
      const sy = d.source.y + (dy * rSource / dist);
      const tx = d.target.x - (dx * rTarget / dist);
      const ty = d.target.y - (dy * rTarget / dist);
      return `M${sx},${sy} L${tx},${ty}`;
    });
  g.selectAll('.node')
    .attr('transform', d => `translate(${d.x},${d.y})`);
  g.selectAll('.link-label')
    .attr('x', d => (d.source.x + d.target.x) / 2)
    .attr('y', d => (d.source.y + d.target.y) / 2);
}

// ===== ZOOM & DRAG =====
function zoomed(event) {
  if (event.sourceEvent && event.sourceEvent.button === 2) {
    g.attr('transform', `translate(${event.transform.x},${event.transform.y})`);
  } else {
    g.attr('transform', `translate(${event.transform.x},${event.transform.y}) scale(${event.transform.k})`);
  }
}
svg.call(
  d3.zoom()
    .extent([[0, 0], [width, height]])
    .scaleExtent([0.5, 3])
    .filter(event => event.button === 2 || event.type === "wheel")
    .on('zoom', zoomed)
);
svg.on('dblclick.zoom', null);
svg.on('contextmenu', event => event.preventDefault());

// ===== DRAG DES NŒUDS =====
function drag(simulation) {
  return d3.drag()
    .on('start', (event, d) => {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.initialPosition = { x: d.x, y: d.y };
    })
    .on('drag', (event, d) => {
      d.x = event.x;
      d.y = event.y;
    })
    .on('end', (event, d) => {
      if (!event.active) simulation.alphaTarget(0);
      if (d.initialPosition &&
          (d.x !== d.initialPosition.x || d.y !== d.initialPosition.y)) {
        performAction({
          type: "move_node",
          data: { nodeId: d.id, from: { ...d.initialPosition }, to: { x: d.x, y: d.y } }
        });
      }
      delete d.initialPosition;
    });
}

// ===== GESTION DES NŒUDS & LIENS =====
let selectedNode = null;
let selectedLink = null;

function createNode(x, y) {
  const id = String(nextNodeId++);
  const newNode = {
    id,
    name: `Node${id}`,
    description: `Description${id}`,
    x,
    y,
    size: globalSettings.defaultNodeSize
  };
  // Intégrer le libellé dans l'action (basé sur le dropdown "node label")
  performAction({ type: "create_node", data: { node: newNode, label: `Create node (${newNode[globalSettings.nodeLabelField] || newNode.name})` } });
  return newNode;
}

function deleteNode(node) {
  const relatedLinks = graphState.links.filter(link => link.source.id === node.id || link.target.id === node.id);
  performAction({ type: "delete_node", data: { node, relatedLinks, label: `Delete node (${node[globalSettings.nodeLabelField] || node.name})` } });
}

function createLink(source, target) {
  const id = String(nextLinkId++);
  const newLink = { id, name: `Link${id}`, description: `Description${id}`, source, target };
  performAction({ type: "create_link", data: { link: newLink, label: `Create link (${source[globalSettings.nodeLabelField] || source.name} → ${target[globalSettings.nodeLabelField] || target.name})` } });
  return newLink;
}

function deleteLink(link) {
  performAction({ type: "delete_link", data: { link, label: `Delete link (${link.name})` } });
}

function selectNode(event, d) {
  if (event.ctrlKey && selectedNode) {
    createLink(selectedNode, d);
    updateGraph(); // mise à jour immédiate
    selectedLink = null;
    nodeForm.classed('hidden', true);
    linkForm.classed('hidden', true);
    return;
  }
  if (selectedNode === d) {
    nodeForm.classed('hidden', true);
    selectedNode = null;
  } else {
    selectedNode = d;
    selectedLink = null;
    linkForm.classed('hidden', true);
    nodeForm.classed('hidden', false);
    updateForm(nodeInputs, d);
  }
  updateGraph();
}

function selectLink(event, d) {
  if (selectedLink === d) {
    linkForm.classed('hidden', true);
    selectedLink = null;
  } else {
    selectedLink = d;
    selectedNode = null;
    nodeForm.classed('hidden', true);
    linkForm.classed('hidden', false);
    updateForm(linkInputs, d);
  }
  updateGraph();
}

// ===== GESTION DES ÉVÉNEMENTS CLAVIER & SOURIS =====
window.addEventListener('keyup', event => {
  if (['Delete', 'Backspace'].includes(event.key)) {
    if (selectedNode) deleteNode(selectedNode);
    if (selectedLink) deleteLink(selectedLink);
  }
});
window.addEventListener('keyup', event => {
  if (event.key === 'Escape') {
    selectedNode = null;
    selectedLink = null;
    nodeForm.classed('hidden', true);
    linkForm.classed('hidden', true);
    updateGraph();
  }
});
// Raccourcis CTRL+Z / CTRL+Y
window.addEventListener('keydown', event => {
  if (event.ctrlKey && !event.shiftKey && (event.key === 'z' || event.key === 'Z')) {
    undo();
    event.preventDefault();
  }
  if (event.ctrlKey && (event.key === 'y' || event.key === 'Y')) {
    redo();
    event.preventDefault();
  }
});

// Double-clic sur une zone vide pour créer un nœud et le sélectionner immédiatement
svg.on('dblclick', event => {
  const transform = d3.zoomTransform(svg.node());
  const point = transform.invert([event.clientX, event.clientY]);
  const newNode = createNode(point[0], point[1]);
  selectedNode = newNode;
  selectedLink = null;
  nodeForm.classed('hidden', false);
  updateForm(nodeInputs, newNode);
  updateGraph();
});

// CTRL+clic (ou CTRL+SHIFT+clic) pour créer un nœud s'il n'existe pas et le relier
svg.on('mousedown', event => {
  if (event.ctrlKey && selectedNode) {
    const transform = d3.zoomTransform(svg.node());
    const point = transform.invert(d3.pointer(event));
    const existing = graphState.nodes.find(node => Math.hypot(point[0] - node.x, point[1] - node.y) < defaultNodeRadius);
    if (!existing) {
      const newNode = createNode(point[0], point[1]);
      createLink(selectedNode, newNode);
      updateGraph();
      if (event.shiftKey) {
        selectedNode = newNode;
        nodeForm.classed('hidden', false);
        updateForm(nodeInputs, newNode);
        updateGraph();
      }
    }
  }
});

// ===== BOUTONS UNDO / REDO & HISTORIQUE =====
d3.select("#undoButton").on("click", () => { undo(); });
d3.select("#redoButton").on("click", () => { redo(); });
function updateHistorySelect() {
  const historySelect = d3.select("#historySelect");
  historySelect.selectAll("option").remove();
  const history = window.historyList || [];
  history.forEach((action, index) => {
    historySelect.append("option")
      .attr("value", index)
      .text(`${index}: ${action.label || action.type}`);
  });
}
d3.select("#historySelect").on("dblclick", function() {
  const index = +this.value;
  jumpToHistory(index);
});

// ===== RÉGLAGES GLOBAUX (dans l'onglet "Values") =====
d3.select("#node-label").on("change", function() {
  const oldVal = globalSettings.nodeLabelField;
  const newVal = this.value || "name";
  performAction({ type: "update_global", data: { field: "nodeLabelField", from: oldVal, to: newVal, label: `Change node label (${oldVal} → ${newVal})` } });
  globalSettings.nodeLabelField = newVal;
  updateGraph();
});
d3.select("#link-label").on("change", function() {
  const oldVal = globalSettings.linkLabelField;
  const newVal = this.value || "";
  performAction({ type: "update_global", data: { field: "linkLabelField", from: oldVal, to: newVal, label: `Change link label (${oldVal} → ${newVal})` } });
  globalSettings.linkLabelField = newVal;
  updateGraph();
});
d3.select("#node-size-field").on("change", function() {
  const oldVal = globalSettings.nodeSizeField;
  const newVal = this.value || "";
  performAction({ type: "update_global", data: { field: "nodeSizeField", from: oldVal, to: newVal, label: `Change node size field (${oldVal} → ${newVal})` } });
  globalSettings.nodeSizeField = newVal;
  updateGraph();
});
d3.select("#defaultNodeSizeInput").on("change", function() {
  const oldVal = globalSettings.defaultNodeSize;
  const newVal = +this.value || defaultNodeRadius;
  performAction({ type: "update_global", data: { field: "defaultNodeSize", from: oldVal, to: newVal, label: `Change default node size (${oldVal} → ${newVal})` } });
  globalSettings.defaultNodeSize = newVal;
  updateGraph();
});

// ===== LAYOUTS (dans l'onglet "Config Graph") =====
function applyLayout(layoutType) {
  if (layoutType === "circle") {
    // Disposer les nœuds sur un cercle
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) / 3;
    const n = graphState.nodes.length;
    graphState.nodes.forEach((node, i) => {
      node.x = centerX + radius * Math.cos((2 * Math.PI * i) / n);
      node.y = centerY + radius * Math.sin((2 * Math.PI * i) / n);
    });
  } else if (layoutType === "grid") {
    // Disposer les nœuds en grille
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
  updateGraph();
}
d3.select("#layoutSelect").on("change", function() {
  const layoutType = this.value;
  applyLayout(layoutType);
});

// ===== IMPORT/EXPORT JSON =====
d3.select('#export-json').on('click', () => {
  const exportData = {
    nodes: graphState.nodes.map(node => {
      const { vx, vy, fx, fy, ...rest } = node;
      return rest;
    }),
    links: graphState.links.map(link => {
      const { id, source, target, ...rest } = link;
      return { id, source: source.id, target: target.id, ...rest };
    })
  };
  const jsonStr = JSON.stringify(exportData, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "graph.json";
  a.click();
});
d3.select('#import-json').on('click', () => {
  d3.select('#json-file').node().click();
});
d3.select('#json-file').on('change', function() {
  const file = this.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = function(event) {
      const jsonData = JSON.parse(event.target.result);
      const newState = {
        nodes: jsonData.nodes,
        links: jsonData.links.map(link => ({
          ...link,
          source: jsonData.nodes.find(n => n.id === link.source),
          target: jsonData.nodes.find(n => n.id === link.target)
        }))
      };
      performAction({ type: "import_graph", data: { oldState: { nodes: graphState.nodes, links: graphState.links }, newState, label: "Import graph" } });
      graphState.nodes = newState.nodes;
      graphState.links = newState.links;
      createFormInputs(graphState.nodes, nodeForm, nodeInputs);
      createFormInputs(graphState.links, linkForm, linkInputs);
      updateGraph();
    };
    reader.readAsText(file);
  }
});

// ===== BOUTON DE DEBUG =====
d3.select('#update').on('click', () => { updateGraph(); });

// ===== INITIALISATION DES LABELS PAR DÉFAUT =====
function initializeLabels() {
  globalSettings.nodeLabelField = "name";
  globalSettings.linkLabelField = "";
  d3.select("#node-label").property("value", "name");
  d3.select("#link-label").property("value", "");
  updateGraph();
}
document.addEventListener("DOMContentLoaded", () => {
  const changeLabelButton = document.getElementById("changeLabelButton");
  changeLabelButton.addEventListener("click", initializeLabels);
  changeLabelButton.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
});

// ===== DÉMARRAGE INITIAL =====
updateGraph();
