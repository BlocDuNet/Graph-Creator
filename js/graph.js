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
  nodeIdField: "id",      // Field used as node id (modifiable by user)
  nodeLabelField: "name",    // Par défaut, le label pour les nœuds est "name"
  linkLabelField: "",        // Par défaut vide pour les liens
  nodeSizeField: "",         // Si vide, on utilise la propriété "size"
  xField: "x",            // Field for x coordinate
  yField: "y",            // Field for y coordinate
  defaultNodeSize: 30,       // Taille par défaut pour la création de nouveaux nœuds
  defaultLinkWidth: 2,       // Taille par défaut pour les liens
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
              label: `Rename node (${oldValue} ? ${newValue})`
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
              label: `Rename link (${oldValue} ? ${newValue})`
            }
          });
        }
      }
      updateGraph();
    });
  inputObject[fieldName] = input;
  if (fieldName !== "id" && fieldName !== "x" && fieldName !== "y") {
    fieldDiv.append('button')
      .attr('type', 'button')   // Important: explicitly set type to button
      .attr('tabindex', '-1')    // Remove from tab order
      .text('x')
      .on('click', function (event) {
        event.stopPropagation(); // Prevent accidental event bubbling
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
  // New dropdowns for id, x and y fields – ensure corresponding HTML selects exist (see below)
  updateSelectOptions(d3.select('#node-id-field'), getFieldOptions(graphState.nodes), globalSettings.nodeIdField);
  updateSelectOptions(d3.select('#x-field'), getFieldOptions(graphState.nodes), globalSettings.xField);
  updateSelectOptions(d3.select('#y-field'), getFieldOptions(graphState.nodes), globalSettings.yField);
  
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
  const nodeSelection = g.selectAll('.node').data(graphState.nodes, d => d[globalSettings.nodeIdField] || d.id);
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
    .attr('r', d => (sizeField && d[sizeField]) ? Number(d[sizeField]) : (Number(d.size) || defaultNodeRadius));
  nodeEnter.append('text')
    .attr('dx', d => (sizeField && d[sizeField]) ? (Number(d[sizeField]) + 5) : 35)
    .attr('dy', 5)
    .text(d => {
      const field = d3.select('#node-label').property('value') || globalSettings.nodeLabelField;
      return field ? (d[field] || "") : "";
    });
  const merged = nodeSelection.merge(nodeEnter)
    .classed('selected', d => d === selectedNode);
  merged.select('circle')
    .attr('r', d => (sizeField && d[sizeField]) ? Number(d[sizeField]) : (Number(d.size) || defaultNodeRadius));
  merged.select('text')
    .text(d => {
      const field = d3.select('#node-label').property('value') || globalSettings.nodeLabelField;
      return field ? (d[field] || "") : "";
    });
  nodeSelection.exit().remove();
}

// Ajouter une fonction pour calculer l'identifiant unique pour chaque lien
function getLinkId(link) {
  return `${link.source.id}-${link.target.id}-${link.id}`;
}

// Ajouter cette fonction pour déterminer la courbure des liens parallèles
function calculateLinkCurvature(source, target, linkId, links) {
  // Cas spécial pour les auto-liens (boucles)
  if (source.id === target.id) {
    return 1.0; // Forte courbure pour les auto-liens
  }
  
  // Trouver tous les liens entre la même paire de nœuds (dans les deux directions)
  const parallelLinks = links.filter(l => 
    (l.source.id === source.id && l.target.id === target.id) || 
    (l.source.id === target.id && l.target.id === source.id)
  );
  
  // Si c'est le seul lien, très légère courbure
  if (parallelLinks.length === 1) {
    return 0.05;
  }
  
  // Trouver l'index de ce lien spécifique dans l'ensemble des liens parallèles
  const linkIndex = parallelLinks.findIndex(l => l.id === linkId);
  
  // Pour plusieurs liens, calculer des courbures qui alternent de chaque côté
  // Les liens pairs vont d'un côté, les impairs de l'autre
  const baseCurvature = 0.2 + (0.05 * Math.floor(linkIndex / 2));
  return (linkIndex % 2 === 0) ? baseCurvature : -baseCurvature;
}

// Améliorer les définitions de flèches avec un style inspiré de l'exemple Observable
function createArrowDefinitions() {
  // Supprimer les anciennes définitions
  d3.select("svg defs").selectAll("*").remove();
  
  const defs = d3.select("svg defs");
  
  // Créer un marqueur de flèche plus harmonieux
  defs.append("marker")
    .attr("id", "arrowhead")
    .attr("viewBox", "-10 -10 20 20")
    .attr("refX", -2)  // Légère correction pour que la pointe soit parfaitement alignée
    .attr("refY", 0)
    .attr("markerWidth", 8)
    .attr("markerHeight", 8)
    .attr("orient", "auto")
    .append("path")
    .attr("d", "M -10,-6 0,0 -10,6")  // Un triangle effilé élégant
    .attr("fill", "#000")
    .attr("stroke", "none");
    
  // Ajouter un marqueur pour les liens sélectionnés
  defs.append("marker")
    .attr("id", "arrowhead-selected")
    .attr("viewBox", "-10 -10 20 20")
    .attr("refX", -2)
    .attr("refY", 0)
    .attr("markerWidth", 8)
    .attr("markerHeight", 8)
    .attr("orient", "auto")
    .append("path")
    .attr("d", "M -10,-6 0,0 -10,6")
    .attr("fill", "#f00")
    .attr("stroke", "none");
    
  // Marqueur spécial pour les auto-liens (boucles)
  defs.append("marker")
    .attr("id", "arrowhead-loop")
    .attr("viewBox", "-10 -10 20 20")
    .attr("refX", -2)
    .attr("refY", 0)
    .attr("markerWidth", 8)
    .attr("markerHeight", 8)
    .attr("orient", "auto")
    .append("path")
    .attr("d", "M -10,-6 0,0 -10,6")
    .attr("fill", "#000")
    .attr("stroke", "none");
  
  // Marqueur pour auto-liens sélectionnés
  defs.append("marker")
    .attr("id", "arrowhead-loop-selected")
    .attr("viewBox", "-10 -10 20 20")
    .attr("refX", -2)
    .attr("refY", 0)
    .attr("markerWidth", 8)
    .attr("markerHeight", 8)
    .attr("orient", "auto")
    .append("path")
    .attr("d", "M -10,-6 0,0 -10,6")
    .attr("fill", "#f00")
    .attr("stroke", "none");
}

// Modifier updateLinks pour appliquer correctement la largeur des liens
function updateLinks() {
  // Précalculer les courbures pour chaque lien
  graphState.links.forEach(link => {
    // Vérifier si c'est un auto-lien
    link.isLoop = link.source.id === link.target.id;
    link.curvature = calculateLinkCurvature(link.source, link.target, link.id, graphState.links);
    // Assurer que chaque lien a une largeur définie
    if (!link.width) link.width = globalSettings.defaultLinkWidth;
  });
  
  // Sélectionner les liens avec un ID unique pour chaque lien
  const linkSelection = g.selectAll('.link').data(graphState.links, getLinkId);
  
  const linkEnter = linkSelection.enter()
    .append('path')
    .attr('class', 'link')
    .attr('fill', 'none')
    .on('click', selectLink)
    .on('dblclick', event => {
      event.stopPropagation();
      updateGraph();
    });
  
  // Appliquer les styles à tous les liens (nouveaux et existants)
  linkSelection.merge(linkEnter)
    .attr('stroke-width', d => d.width || globalSettings.defaultLinkWidth)
    .attr('stroke', d => d === selectedLink ? '#f00' : '#000')
    .attr('marker-end', d => {
      if (d.isLoop) {
        return d === selectedLink ? 'url(#arrowhead-loop-selected)' : 'url(#arrowhead-loop)';
      } else {
        return d === selectedLink ? 'url(#arrowhead-selected)' : 'url(#arrowhead)';
      }
    });
  
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

// Modifier ticked pour raccourcir légèrement les liens avant la flèche
function ticked() {
  const sizeField = d3.select("#node-size-field").property("value");
  
  // Mise à jour des liens avec des courbes plus harmonieuses
  g.selectAll('.link')
    .attr('d', d => {
      // Récupérer les rayons des nœuds
      const rSource = (sizeField && d.source[sizeField]) ? +d.source[sizeField] : (d.source.size || defaultNodeRadius);
      const rTarget = (sizeField && d.target[sizeField]) ? +d.target[sizeField] : (d.target.size || defaultNodeRadius);
      
      // Vérifier s'il s'agit d'un auto-lien
      if (d.isLoop) {
        return drawSelfLoop(d.source.x, d.source.y, rSource);
      }
      
      // Vecteurs et distances
      const dx = d.target.x - d.source.x;
      const dy = d.target.y - d.source.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      if (dist === 0) return "M0,0L0,0"; // Protection contre division par zéro
      
      // Vecteur unitaire dans la direction de la ligne
      const unitX = dx / dist;
      const unitY = dy / dist;
      
      // Points de départ et d'arrivée ajustés selon les rayons des cercles
      const adjustedStart = {
        x: d.source.x + unitX * rSource,
        y: d.source.y + unitY * rSource
      };
      
      // Ajuster la fin du lien pour laisser un peu d'espace avant le bord du nœud
      // La distance additionnelle de 1 pixel empêche le lien de dépasser la flèche
      const markerAdjustment = 1; 
      const adjustedEnd = {
        x: d.target.x - unitX * (rTarget + markerAdjustment),
        y: d.target.y - unitY * (rTarget + markerAdjustment)
      };
      
      // Courbe de Bézier avec courbure ajustée
      const curvature = d.curvature || 0.05;
      
      // Vecteur perpendiculaire pour le point de contrôle
      const perpX = -unitY;
      const perpY = unitX;
      
      // Calculer le point médian puis décaler dans la direction perpendiculaire
      const midX = (adjustedStart.x + adjustedEnd.x) / 2;
      const midY = (adjustedStart.y + adjustedEnd.y) / 2;
      
      // Point de contrôle pour la courbe de Bézier
      const ctrlX = midX + perpX * dist * curvature;
      const ctrlY = midY + perpY * dist * curvature;
      
      return `M${adjustedStart.x},${adjustedStart.y} Q${ctrlX},${ctrlY} ${adjustedEnd.x},${adjustedEnd.y}`;
    });
  
  // Mise à jour des positions des nœuds
  g.selectAll('.node')
    .attr('transform', d => `translate(${d.x},${d.y})`);
  
  // Mise à jour des positions des labels de liens
  g.selectAll('.link-label')
    .attr('transform', d => {
      // Pour les auto-liens, positionner le label au-dessus de la boucle
      if (d.isLoop) {
        const radius = (sizeField && d.source[sizeField]) 
          ? +d.source[sizeField] 
          : (d.source.size || defaultNodeRadius);
        
        return `translate(${d.source.x},${d.source.y - radius * 2.5})`;
      }
      
      // Pour les liens normaux, utiliser le code existant
      const sx = d.source.x;
      const sy = d.source.y;
      const tx = d.target.x;
      const ty = d.target.y;
      const dist = Math.sqrt((tx - sx) * (tx - sy) + (ty - sy) * (ty - sy));
      
      if (dist === 0) return "translate(0,0)";
      
      // Placer le label à un point t=0.55 le long de la courbe de Bézier
      // (légèrement passé le milieu pour éviter de chevaucher la ligne)
      const curvature = d.curvature || 0.05;
      const t = 0.55; // Paramètre entre 0 et 1 pour la position le long de la courbe
      
      // Calcul de Bézier quadratique au point t
      const perpX = -(ty - sy) / dist;
      const perpY = (tx - sx) / dist;
      
      // Point intermédiaire pour le paramètre t sur la courbe
      const midX = (1-t)*(1-t)*sx + 2*(1-t)*t*((sx + tx)/2 + perpX*dist*curvature) + t*t*tx;
      const midY = (1-t)*(1-t)*sy + 2*(1-t)*t*((sy + ty)/2 + perpY*dist*curvature) + t*t*ty;
      
      return `translate(${midX},${midY})`;
    })
    .attr('text-anchor', 'middle')
    .attr('dominant-baseline', 'central');
}

// Fonction pour dessiner un auto-lien (boucle)
function drawSelfLoop(x, y, radius) {
  // Dessiner une boucle au-dessus du nœud
  const loopRadius = radius * 1.5;
  const startAngle = -Math.PI/2 - Math.PI/6;
  const endAngle = -Math.PI/2 + Math.PI/6;
  
  // Points de contrôle pour la courbe de Bézier
  const startX = x + radius * Math.cos(startAngle);
  const startY = y + radius * Math.sin(startAngle);
  const endX = x + radius * Math.cos(endAngle);
  const endY = y + radius * Math.sin(endAngle);
  
  // Points de contrôle pour une courbe plus arrondie
  const controlX = x;
  const controlY = y - loopRadius * 2;
  
  return `M${startX},${startY} Q${controlX},${controlY} ${endX},${endY}`;
}

// Modifier updateGraph pour initialiser les définitions de flèches
export function updateGraph() {
  createArrowDefinitions(); // Ajouter cette ligne
  updateNodes();
  updateLinks();
  updateLinkLabels();
  updateGlobalSelects();
  simulation.nodes(graphState.nodes).on('tick', ticked);
  simulation.force('link').links(graphState.links);
  simulation.alpha(1).restart();
  updateHistorySelect();
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

// Modifier la fonction createLink pour garantir que width est correctement défini
function createLink(source, target) {
  const id = String(nextLinkId++);
  const newLink = { 
    id, 
    name: `Link${id}`, 
    description: `Description${id}`, 
    source, 
    target,
    width: globalSettings.defaultLinkWidth // S'assurer que la largeur par défaut est appliquée
  };
  performAction({ type: "create_link", data: { link: newLink, label: `Create link (${source[globalSettings.nodeLabelField] || source.name} ? ${target[globalSettings.nodeLabelField] || target.name})` } });
  return newLink;
}

function deleteLink(link) {
  performAction({ type: "delete_link", data: { link, label: `Delete link (${link.name})` } });
}

// Modifier selectNode pour permettre de créer des auto-liens
function selectNode(event, d) {
  // Permettre de créer un auto-lien avec Alt+Click
  if (event.altKey && selectedNode) {
    // Si on fait Alt+Click sur le même nœud que le nœud sélectionné, créer un auto-lien
    if (d.id === selectedNode.id) {
      createLink(d, d); // Créer un lien de d à d (auto-lien)
      updateGraph();
      selectedLink = null;
      nodeForm.classed('hidden', true);
      linkForm.classed('hidden', true);
      return;
    }
  }
  
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
  performAction({ type: "update_global", data: { field: "nodeLabelField", from: oldVal, to: newVal, label: `Change node label (${oldVal} ? ${newVal})` } });
  globalSettings.nodeLabelField = newVal;
  updateGraph();
});
d3.select("#link-label").on("change", function() {
  const oldVal = globalSettings.linkLabelField;
  const newVal = this.value || "";
  performAction({ type: "update_global", data: { field: "linkLabelField", from: oldVal, to: newVal, label: `Change link label (${oldVal} ? ${newVal})` } });
  globalSettings.linkLabelField = newVal;
  updateGraph();
});
d3.select("#node-size-field").on("change", function() {
  const oldVal = globalSettings.nodeSizeField;
  const newVal = this.value || "";
  performAction({ type: "update_global", data: { field: "nodeSizeField", from: oldVal, to: newVal, label: `Change node size field (${oldVal} ? ${newVal})` } });
  globalSettings.nodeSizeField = newVal;
  updateGraph();
});
d3.select("#defaultNodeSizeInput").on("change", function() {
  const oldVal = globalSettings.defaultNodeSize;
  const newVal = +this.value || defaultNodeRadius;
  performAction({ type: "update_global", data: { field: "defaultNodeSize", from: oldVal, to: newVal, label: `Change default node size (${oldVal} ? ${newVal})` } });
  globalSettings.defaultNodeSize = newVal;
  updateGraph();
});

// Ajouter cette fonction pour appliquer les changements de largeur à tous les liens
function updateLinkWidths(newWidth) {
  // Mettre à jour la largeur de tous les liens existants qui n'ont pas de largeur spécifique
  graphState.links.forEach(link => {
    if (!link.width) {
      link.width = newWidth;
    }
  });
  updateGraph();
}

// Améliorer l'événement de changement de largeur de lien par défaut
d3.select("#defaultLinkWidthInput").on("change", function() {
  const oldVal = globalSettings.defaultLinkWidth;
  const newVal = +this.value || 2;
  
  performAction({ 
    type: "update_global", 
    data: { 
      field: "defaultLinkWidth", 
      from: oldVal, 
      to: newVal, 
      label: `Change default link width (${oldVal} ? ${newVal})` 
    }
  });
  
  globalSettings.defaultLinkWidth = newVal;
  updateLinkWidths(newVal);
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

// Réexporter performAction depuis undo_redo pour faciliter l'import
export { performAction } from './undo_redo.js';
