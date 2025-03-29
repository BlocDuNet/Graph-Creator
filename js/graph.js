// graph.js
// ===== IMPORTS =====
import { getForceConfiguration, getLinkStyle } from './config_graph.js';
import {
  performAction,
  undo,
  redo,
  jumpToHistory,
  registerGraphState,
  registerUpdateCallback
} from './undo_redo.js';

// Tentative d'importation de l'utilitaire, mais avec un plan de secours
let initDropdownUtil;
try {
  import('./utils.js').then(module => {
    initDropdownUtil = module.initDropdown;
    console.log("Utilitaire initDropdown chargé");
  }).catch(error => {
    console.warn("Erreur lors du chargement de utils.js:", error);
  });
} catch (error) {
  console.warn("Import dynamique non supporté, utilisation du fallback pour les dropdowns");
}

// ===== ÉTAT GLOBAL DU GRAPHE =====
const defaultNodeRadius = 30; // Valeur par défaut

// Configuration pour les modèles JSON
const jsonModelsConfig = {
  directoryPath: 'json/',  // Chemin vers le dossier contenant les modèles
  defaultFile: 'default.json'     // Fichier par défaut (optionnel)
};

// Données initiales
const initialNodes = [
  { id: '1', name: 'Node1', description: 'Description1', x: 100, y: 300, size: defaultNodeRadius },
  { id: '2', name: 'Node2', description: 'Description2', x: 200, y: 200, size: defaultNodeRadius },
  { id: '3', name: 'Node3', description: 'Description3', x: 300, y: 300, size: defaultNodeRadius }
];
const initialLinks = [
  { id: '1', name: 'Link1', description: 'Description1', source: '1', target: '2', width: 2 },
  { id: '2', name: 'Link2', description: 'Description2', source: '2', target: '3', width: 2 }
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

// ===== UTILITAIRES =====

/**
 * Initialise et configure une liste déroulante
 * @param {string|d3.Selection} selector - Sélecteur ou objet d3 pour la liste déroulante
 * @param {Array} options - Options à ajouter (array de valeurs ou d'objets {value, text})
 * @param {string|null} selectedValue - Valeur pré-sélectionnée (null pour aucune)
 * @param {Function|null} onChange - Fonction à appeler lors du changement
 * @param {boolean} includeEmptyOption - Inclure une option vide au début
 * @param {string} emptyOptionText - Texte pour l'option vide
 * @returns {d3.Selection} Sélection D3 de la liste déroulante
 */
function initDropdown(selector, options, selectedValue = null, onChange = null, includeEmptyOption = true, emptyOptionText = '') {
  // Obtenir la sélection D3
  const select = typeof selector === 'string' ? d3.select(selector) : selector;
  
  // Supprimer les options existantes
  select.selectAll('option').remove();
  
  // Ajouter une option vide si demandé
  if (includeEmptyOption) {
    select.append('option')
      .attr('value', '')
      .text(emptyOptionText);
  }
  
  // Ajouter les options
  options.forEach(opt => {
    const value = typeof opt === 'object' ? opt.value : opt;
    const text = typeof opt === 'object' ? opt.text : opt;
    
    select.append('option')
      .attr('value', value)
      .text(text);
  });
  
  // Définir la valeur sélectionnée si fournie
  if (selectedValue !== null) {
    select.property('value', selectedValue);
  }
  
  // Ajouter le gestionnaire d'événement onChange si fourni
  if (onChange) {
    select.on('change', onChange);
  }
  
  return select;
}

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
  // Sauvegarder les valeurs actuellement sélectionnées
  const currentNodeLabel = d3.select('#node-label').property('value');
  const currentLinkLabel = d3.select('#link-label').property('value');
  const currentNodeSizeField = d3.select('#node-size-field').property('value');
  
  const nodeFields = getFieldOptions(graphState.nodes);
  const linkFields = getFieldOptions(graphState.links);
  
  // Utiliser la méthode sûre pour mettre à jour les listes déroulantes
  updateSelectOptions(d3.select('#node-id-field'), nodeFields, globalSettings.nodeIdField);
  updateSelectOptions(d3.select('#x-field'), nodeFields, globalSettings.xField);
  updateSelectOptions(d3.select('#y-field'), nodeFields, globalSettings.yField);
  updateSelectOptions(
    d3.select('#node-label'), 
    nodeFields, 
    currentNodeLabel !== undefined ? currentNodeLabel : globalSettings.nodeLabelField
  );
  updateSelectOptions(
    d3.select('#link-label'), 
    linkFields, 
    currentLinkLabel !== undefined ? currentLinkLabel : globalSettings.linkLabelField
  );
  updateSelectOptions(
    d3.select('#node-size-field'), 
    nodeFields, 
    currentNodeSizeField !== undefined ? currentNodeSizeField : globalSettings.nodeSizeField
  );
}

// Restaurer la fonction originale pour garantir la compatibilité
function updateSelectOptions(selectElem, optionsArr, selectedValue) {
  if (!selectElem || !selectElem.node()) {
    console.warn(`Élément select non trouvé pour updateSelectOptions`);
    return;
  }
  
  try {
    // Si l'utilitaire est disponible, l'utiliser
    if (initDropdownUtil) {
      return initDropdownUtil(selectElem, optionsArr, selectedValue, () => updateGraph());
    }
    
    // Sinon, utiliser le code d'origine
    selectElem.selectAll('option').remove();
    selectElem.append('option').attr('value', '').text('');
    optionsArr.forEach(opt => {
      selectElem.append('option').attr('value', opt).text(opt);
    });
    
    selectElem.property('value', selectedValue);
    selectElem.on("change", () => updateGraph());
    return selectElem;
  } catch (error) {
    console.error("Erreur dans updateSelectOptions:", error);
    return selectElem;
  }
}

// ===== AFFICHAGE DU GRAPHE =====

// Modify the updateNodes function to respect empty selection
function updateNodes() {
  const sizeField = d3.select("#node-size-field").property("value");
  const nodeLabelField = d3.select('#node-label').property('value');
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
      // Explicitly check if nodeLabelField is empty string - don't use default in this case
      return nodeLabelField === '' ? '' : (d[nodeLabelField] || "");
    });
  const merged = nodeSelection.merge(nodeEnter)
    .classed('selected', d => d === selectedNode);
  merged.select('circle')
    .attr('r', d => (sizeField && d[sizeField]) ? Number(d[sizeField]) : (Number(d.size) || defaultNodeRadius));
  merged.select('text')
    .text(d => {
      // Same check here - empty string means display no label
      return nodeLabelField === '' ? '' : (d[nodeLabelField] || "");
    });
  nodeSelection.exit().remove();
}

// Ajouter une fonction pour calculer l'identifiant unique pour chaque lien
function getLinkId(link) {
  return `${link.source.id}-${link.target.id}-${link.id}`;
}

// Modifier la fonction calculateLinkCurvature pour utiliser les paramètres configurables
function calculateLinkCurvature(source, target, linkId, links) {
  const { baseCurvature, loopCurvature, curvatureStep } = getLinkStyle();
  
  // Cas spécial pour les auto-liens (boucles)
  if (source.id === target.id) {
    return loopCurvature; // Utiliser la configuration pour les boucles
  }
  
  // Déterminer la direction de ce lien
  const isForward = source.id < target.id;
  
  // Trouver tous les liens entre cette paire de nœuds spécifiquement
  // Attention: nous séparons les liens forward (source.id < target.id) et backward
  const parallelLinks = links.filter(l => 
    (l.source.id === source.id && l.target.id === target.id) || 
    (l.source.id === target.id && l.target.id === source.id)
  );
  
  // Séparer en deux groupes selon la direction
  const forwardLinks = parallelLinks.filter(l => l.source.id < l.target.id);
  const backwardLinks = parallelLinks.filter(l => l.source.id > l.target.id);
  
  // Si c'est le seul lien entre ces nœuds, appliquer la courbure de base
  if (parallelLinks.length === 1) {
    return isForward ? baseCurvature : -baseCurvature; // Courbure de base configurable
  }
  
  // Trouver l'index de ce lien spécifique dans le groupe approprié
  const targetGroup = isForward ? forwardLinks : backwardLinks;
  const linkIndex = targetGroup.findIndex(l => l.id === linkId);
  
  // Utiliser les paramètres configurables pour calculer la courbure
  const calculatedCurvature = baseCurvature + (curvatureStep * linkIndex);
  
  // Assurer que les directions opposées ont des courbures opposées
  return isForward ? calculatedCurvature : -calculatedCurvature;
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

// Modifier updateLinks pour appliquer correctement la largeur des liens avec valeurs décimales
function updateLinks() {
  // Suppression complète des anciens liens pour forcer leur recréation
  if (d3.select("#forceRecreateLinks").property("checked")) {
    g.selectAll('.link').remove();
  }
  
  // Précalculer les courbures pour chaque lien
  graphState.links.forEach(link => {
    // Vérifier si c'est un auto-lien
    link.isLoop = link.source.id === link.target.id;
    link.curvature = calculateLinkCurvature(link.source, link.target, link.id, graphState.links);
    
    // IMPORTANT: Toujours remplacer la largeur par la valeur par défaut si non définie
    if (link.width === undefined) {
      link.width = parseFloat(globalSettings.defaultLinkWidth);
    }
  });
  
  // Sélectionner les liens avec un ID unique pour chaque lien
  const linkSelection = g.selectAll('.link').data(graphState.links, getLinkId);
  
  // Créer les nouveaux liens avec tous les attributs nécessaires dès le départ
  const linkEnter = linkSelection.enter()
    .append('path')
    .attr('class', 'link')
    .attr('fill', 'none')
    .attr('stroke-linecap', 'round')
    .attr('stroke-linejoin', 'round')
    .attr('vector-effect', 'non-scaling-stroke')
    .on('click', selectLink)
    .on('dblclick', event => {
      event.stopPropagation();
      updateGraph();
    });
  
  // Appliquer TOUS les styles à TOUS les liens (nouveaux et existants)
  const allLinks = linkSelection.merge(linkEnter);
  
  // Application explicite et séparée des styles avec support des valeurs décimales
  allLinks
    .attr('stroke-width', d => {
      // Convertir explicitement en nombre flottant pour supporter les valeurs décimales
      const width = parseFloat(d.width) || parseFloat(globalSettings.defaultLinkWidth) || 2;
      return width;
    })
    .attr('stroke', d => d === selectedLink ? '#f00' : '#000')
    .attr('marker-end', d => {
      if (d.isLoop) {
        return d === selectedLink ? 'url(#arrowhead-loop-selected)' : 'url(#arrowhead-loop)';
      } else {
        return d === selectedLink ? 'url(#arrowhead-selected)' : 'url(#arrowhead)';
      }
    });
  
  // Supprimer les liens qui ne sont plus dans les données
  linkSelection.exit().remove();
}

// Modify the updateLinkLabels function
function updateLinkLabels() {
  const linkLabelField = d3.select('#link-label').property('value');
  const linkLabels = g.selectAll('.link-label').data(graphState.links, d => `${d.source.id}-${d.target.id}`);
  linkLabels.enter()
    .append('text')
    .attr('class', 'link-label')
    .attr('dx', 10)
    .merge(linkLabels)
    .classed('selected', d => d === selectedLink)
    .text(d => {
      // Similar check for links - empty string means display no label
      return linkLabelField === '' ? '' : (d[linkLabelField] || "");
    })
    .on('click', selectLink);
  linkLabels.exit().remove();
}

// Modifier ticked pour vérifier curvedLinks
function ticked() {
  const sizeField = d3.select("#node-size-field").property("value");
  // Récupérer la configuration des liens (droits ou courbes)
  const { curvedLinks } = getLinkStyle();
  
  // Mise à jour des liens
  g.selectAll('.link')
    .attr('d', d => {
      // Récupérer les rayons des nœuds - assurer qu'ils sont numériques
      const rSource = (sizeField && d.source[sizeField]) 
                    ? Math.max(1, Number(d.source[sizeField])) 
                    : Number(d.source.size || defaultNodeRadius);
      const rTarget = (sizeField && d.target[sizeField]) 
                    ? Math.max(1, Number(d.target[sizeField])) 
                    : Number(d.target.size || defaultNodeRadius);
      
      // Vérifier s'il s'agit d'un auto-lien (toujours dessiné comme une courbe)
      if (d.isLoop) {
        return drawSelfLoop(d.source.x, d.source.y, rSource);
      }
      
      // Vecteurs et distances avec protection contre les erreurs numériques
      const dx = d.target.x - d.source.x;
      const dy = d.target.y - d.source.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      // Protection améliorée contre division par zéro
      if (dist < 0.1) return `M${d.source.x},${d.source.y}L${d.source.x},${d.source.y}`;
      
      // Vecteur unitaire dans la direction de la ligne - plus robuste
      const unitX = dx / dist;
      const unitY = dy / dist;
      
      // Points de départ et d'arrivée ajustés selon les rayons des cercles
      const adjustedStart = {
        x: d.source.x + unitX * rSource,
        y: d.source.y + unitY * rSource
      };
      
      // Ajuster la fin du lien pour laisser un peu d'espace avant le bord du nœud
      const markerAdjustment = 1; 
      const adjustedEnd = {
        x: d.target.x - unitX * (rTarget + markerAdjustment),
        y: d.target.y - unitY * (rTarget + markerAdjustment)
      };
      
      // Si les liens droits sont sélectionnés, retourner une simple ligne
      if (!curvedLinks) {
        return `M${adjustedStart.x},${adjustedStart.y} L${adjustedEnd.x},${adjustedEnd.y}`;
      }
      
      // Sinon utiliser une courbe de Bézier avec courbure ajustée
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
  
  // Mise à jour des positions des nœuds - inchangé
  g.selectAll('.node')
    .attr('transform', d => `translate(${d.x},${d.y})`);
  
  // Mise à jour des positions des labels de liens - adapter au mode liens droits/courbes
  g.selectAll('.link-label')
    .attr('transform', d => {
      // Pour les auto-liens, position inchangée
      if (d.isLoop) {
        const radius = (sizeField && d.source[sizeField]) 
          ? +d.source[sizeField] 
          : (d.source.size || defaultNodeRadius);
        
        return `translate(${d.source.x},${d.source.y - radius * 2.5})`;
      }
      
      const sx = d.source.x;
      const sy = d.source.y;
      const tx = d.target.x;
      const ty = d.target.y;
      
      // Si les liens sont droits, placer le label au milieu de la ligne
      if (!curvedLinks) {
        return `translate(${(sx + tx) / 2},${(sy + ty) / 2})`;
      }
      
      // Pour les liens courbes, utiliser le calcul pour courbes de Bézier
      const dist = Math.sqrt((tx - sx) * (tx - sx) + (ty - sy) * (ty - sy));
      
      if (dist === 0) return "translate(0,0)";
      
      const curvature = d.curvature || 0.05;
      const t = 0.55; // Paramètre pour la position le long de la courbe
      
      const perpX = -(ty - sy) / dist;
      const perpY = (tx - sx) / dist;
      
      // Calcul du point sur la courbe de Bézier
      const midX = (1-t)*(1-t)*sx + 2*(1-t)*t*((sx + tx)/2 + perpX*dist*curvature) + t*t*tx;
      const midY = (1-t)*(1-t)*sy + 2*(1-t)*t*((sy + ty)/2 + perpY*dist*curvature) + t*t*ty;
      
      return `translate(${midX},${midY})`;
    })
    .attr('text-anchor', 'middle')
    .attr('dominant-baseline', 'central');
}

// Fonction pour dessiner un auto-lien (boucle)
function drawSelfLoop(x, y, radius) {
  const { loopCurvature } = getLinkStyle();
  
  // Dessiner une boucle au-dessus du nœud
  const loopRadius = radius * loopCurvature; // Utiliser le facteur configurable
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
  // Ajouter l'option de recréation des liens s'il n'existe pas déjà
  addRecreateLinksOption();
  
  // Reste du code inchangé
  createArrowDefinitions();
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
// Modify the node-label change handler
d3.select("#node-label").on("change", function() {
  const oldVal = globalSettings.nodeLabelField;
  // Preserve empty string as a valid selection
  const newVal = this.value;
  performAction({ 
    type: "update_global", 
    data: { 
      field: "nodeLabelField", 
      from: oldVal, 
      to: newVal, 
      label: `Change node label (${oldVal || "none"} → ${newVal || "none"})` 
    } 
  });
  globalSettings.nodeLabelField = newVal;
  
  // Update only the text of nodes
  g.selectAll('.node text').text(d => {
    // Empty string means no label
    return newVal === '' ? '' : (d[newVal] || "");
  });
});

// Mêmes modifications pour les autres sélecteurs
// Modify the link-label change handler
d3.select("#link-label").on("change", function() {
  const oldVal = globalSettings.linkLabelField;
  // Preserve empty string as a valid selection
  const newVal = this.value;
  performAction({ 
    type: "update_global", 
    data: { 
      field: "linkLabelField", 
      from: oldVal, 
      to: newVal, 
      label: `Change link label (${oldVal || "none"} → ${newVal || "none"})` 
    } 
  });
  globalSettings.linkLabelField = newVal;
  
  // Update only the link labels
  g.selectAll('.link-label').text(d => {
    // Empty string means no label
    return newVal === '' ? '' : (d[newVal] || "");
  });
});

d3.select("#node-size-field").on("change", function() {
  const oldVal = globalSettings.nodeSizeField;
  const newVal = this.value || "";
  performAction({ type: "update_global", data: { field: "nodeSizeField", from: oldVal, to: newVal, label: `Change node size field (${oldVal} ? ${newVal})` } });
  globalSettings.nodeSizeField = newVal;
  updateGraph(); // Ici, updateGraph est nécessaire pour mettre à jour les tailles des nœuds
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
  console.log("Updating ALL link widths to:", newWidth); 
  
  // Convertir en nombre flottant pour supporter les décimales
  const widthValue = parseFloat(newWidth);
  if (isNaN(widthValue)) return;
  
  // Mettre à jour TOUS les liens
  graphState.links.forEach(link => {
    link.width = widthValue;
  });
  
  // Forcer la recréation si l'option est activée
  if (d3.select("#forceRecreateLinks").property("checked")) {
    g.selectAll('.link').remove();
  }
  
  console.log(`Updated ALL ${graphState.links.length} links width to ${widthValue}`);
  updateGraph();
}

// Améliorer l'événement de changement de largeur de lien par défaut
d3.select("#defaultLinkWidthInput").on("change", function() {
  // Convertir en nombre flottant pour supporter les valeurs décimales
  const oldVal = parseFloat(globalSettings.defaultLinkWidth) || 2;
  const newVal = parseFloat(this.value) || 2;
  
  if (oldVal === newVal) return;
  
  console.log(`Changing default link width from ${oldVal} to ${newVal}`);
  
  performAction({ 
    type: "update_global", 
    data: { 
      field: "defaultLinkWidth", 
      from: oldVal, 
      to: newVal, 
      label: `Change default link width (${oldVal} → ${newVal})` 
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
  } else if (layoutType === "random") {
    // Disposer les nœuds aléatoirement, mais avec une distribution uniforme
    const padding = 50; // Espace de marge autour des bords
    const availWidth = width - (padding * 2);
    const availHeight = height - (padding * 2);
    
    graphState.nodes.forEach(node => {
      // Position aléatoire mais dans une zone utilisable
      node.x = padding + Math.random() * availWidth;
      node.y = padding + Math.random() * availHeight;
    });
  }
  updateGraph();
}

// Gestionnaire d'événement pour le sélecteur de layout
d3.select("#layoutSelect").on("change", function() {
  const layoutType = this.value;
  applyLayout(layoutType);
});

// Nouveau gestionnaire d'événement pour le bouton "Recharger"
d3.select("#reloadLayout").on("click", function() {
  const layoutType = d3.select("#layoutSelect").property("value");
  if (layoutType) {
    applyLayout(layoutType);
  }
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
      loadJSONGraph(event.target.result);
    };
    reader.readAsText(file);
  }
});

/**
 * Initialise la liste des modèles JSON disponibles
 */
async function initJSONModelsList() {
  try {
    const response = await fetch(jsonModelsConfig.directoryPath);
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
    
    // Utiliser la méthode originale pour garantir la compatibilité
    const select = d3.select('#json-models');
    select.selectAll("*").remove();
    
    // Ajouter une option vide au début
    select.append('option')
      .attr('value', '')
      .text('-- Choisir un modèle --');
    
    // Ajouter les options des fichiers
    jsonFiles.forEach(file => {
      select.append('option')
        .attr('value', file)
        .text(file.split(".")[0]);
    });
    
    // Ajouter l'écouteur d'événement
    select.on('change', function() {
      const selectedFile = this.value;
      if (selectedFile) {
        loadJSONModelFile(jsonModelsConfig.directoryPath + selectedFile);
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
    loadJSONGraph(JSON.stringify(jsonData));
  } catch (error) {
    console.error(`Erreur lors du chargement du modèle ${file}:`, error);
    alert(`Erreur lors du chargement du modèle: ${error.message}`);
  }
}

/**
 * Charge un graphe à partir de données JSON
 */
function loadJSONGraph(jsonContent) {
  try {
    const jsonData = typeof jsonContent === 'string' ? JSON.parse(jsonContent) : jsonContent;
    const newState = {
      nodes: jsonData.nodes,
      links: jsonData.links.map(link => ({
        ...link,
        source: jsonData.nodes.find(n => n.id === link.source),
        target: jsonData.nodes.find(n => n.id === link.target)
      }))
    };
    performAction({ 
      type: "import_graph", 
      data: { 
        oldState: { nodes: graphState.nodes, links: graphState.links }, 
        newState, 
        label: "Import graph model" 
      } 
    });
    graphState.nodes = newState.nodes;
    graphState.links = newState.links;
    createFormInputs(graphState.nodes, nodeForm, nodeInputs);
    createFormInputs(graphState.links, linkForm, linkInputs);
    updateGraph();
  } catch (error) {
    console.error("Erreur lors du chargement du graphe:", error);
    alert(`Erreur lors du chargement du graphe: ${error.message}`);
  }
}

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
// Initialiser la liste des modèles JSON au chargement
document.addEventListener("DOMContentLoaded", () => {
  initJSONModelsList();
});

// Réexporter performAction depuis undo_redo pour faciliter l'import
export { performAction } from './undo_redo.js';

// Ajouter une option pour forcer la recréation des liens
function addRecreateLinksOption() {
  const configCard = d3.select("#collapseLinkStyle .card-body");
  
  if (!configCard.select("#forceRecreateLinksDiv").empty()) return; // Éviter les duplications
  
  const div = configCard.append("div")
    .attr("id", "forceRecreateLinksDiv")
    .attr("class", "form-group mt-3");
  
  div.append("label")
    .attr("for", "forceRecreateLinks")
    .html("<input type='checkbox' id='forceRecreateLinks'> Recréer les liens à chaque mise à jour (peut résoudre les problèmes d'affichage)");
  
  // Par défaut, activer cette option
  d3.select("#forceRecreateLinks").property("checked", true);
}
