import { updateGraph } from './graph.js';

// Tentative d'importation de l'utilitaire, mais avec un plan de secours
let initDropdownUtil;
try {
  import('./utils.js').then(module => {
    initDropdownUtil = module.initDropdown;
    console.log("Utilitaire initDropdown chargé dans config_graph.js");
  }).catch(error => {
    console.warn("Erreur lors du chargement de utils.js dans config_graph:", error);
  });
} catch (error) {
  console.warn("Import dynamique non supporté dans config_graph, utilisation du fallback");
}

// Centraliser les constantes de configuration
const CONFIG = {
  directoryPath: 'json_config/',
  defaultFile: 'manual_without_force.json',
  defaults: {
    linkStrength: 0,
    linkDistance: 200,
    chargeStrength: 0,
    centerStrength: 0,
    curvedLinks: true,
    baseCurvature: 0.2,
    loopCurvature: 1.5,
    curvatureStep: 0.1
  }
};

// Initialiser l'état avec les valeurs par défaut
let { linkStrength, linkDistance, chargeStrength, centerStrength, 
      curvedLinks, baseCurvature, loopCurvature, curvatureStep } = CONFIG.defaults;

// Initialiser la taille du SVG une seule fois
const svgElement = d3.select('svg');
const width = svgElement.node().getBoundingClientRect().width;
const height = svgElement.node().getBoundingClientRect().height;

// Configuration des forces
const forceConfig = {
  link: d3.forceLink().id(d => d.id).distance(linkDistance).strength(linkStrength),
  charge: d3.forceManyBody().strength(chargeStrength),
  center: d3.forceCenter(width / 2, height / 2).strength(centerStrength)
};

/**
 * Initialise les écouteurs d'événements pour les contrôles de configuration
 */
function initEventListeners() {
  // Utiliser une fonction générique pour les contrôles simples
  function setupControl(selector, property, transform = x => x, callback) {
    d3.select(selector).on('change', function() {
      const value = this.type === 'checkbox' ? this.checked : transform(this.value);
      window[property] = value;
      
      // Mettre à jour les forces si nécessaire
      if (property === 'linkStrength') forceConfig.link.strength(value);
      if (property === 'linkDistance') forceConfig.link.distance(value);
      if (property === 'chargeStrength') forceConfig.charge.strength(value);
      if (property === 'centerStrength') forceConfig.center.strength(value);
      
      // Appeler le callback si fourni (par exemple pour updateGraph)
      if (callback) callback();
    });
  }

  // Configurer tous les contrôles avec la même fonction
  setupControl('#link-force', 'linkStrength', x => x ? 1 : 0);
  setupControl('#link-distance', 'linkDistance', Number);
  setupControl('#charge-strength', 'chargeStrength', Number);
  setupControl('#center-force', 'centerStrength', x => x ? 1 : 0);
  setupControl('#curved-links', 'curvedLinks', x => x, updateGraph);
  setupControl('#base-curvature', 'baseCurvature', parseFloat);
  setupControl('#loop-curvature', 'loopCurvature', parseFloat);
  setupControl('#curvature-step', 'curvatureStep', parseFloat);

  // Corriger la configuration du toggle curved-links
  d3.select('#curved-links').on('change', function() {
    curvedLinks = this.checked;
    console.log(`Liens courbés: ${curvedLinks ? "activés" : "désactivés"}`);
    
    // Activer/désactiver les contrôles de courbure selon l'état
    updateCurvatureControlsVisibility();
    
    // Mettre à jour le graphe immédiatement
    updateGraph();
  });

  // Ajouter des écouteurs pour les paramètres de courbure qui mettent à jour le graphe
  d3.select('#base-curvature').on('input', function() {
    baseCurvature = parseFloat(this.value);
    updateGraph();
  });

  d3.select('#loop-curvature').on('input', function() {
    loopCurvature = parseFloat(this.value);
    updateGraph();
  });

  d3.select('#curvature-step').on('input', function() {
    curvatureStep = parseFloat(this.value);
    updateGraph();
  });
}

/**
 * Met à jour les contrôles HTML avec les valeurs actuelles
 */
function updateHTMLInputs() {
  // Utiliser une fonction générique pour éviter la répétition
  function updateControl(selector, value, isCheckbox = false) {
    d3.select(selector).property(isCheckbox ? 'checked' : 'value', value);
  }
  
  updateControl('#link-force', linkStrength === 1, true);
  updateControl('#link-distance', linkDistance);
  updateControl('#charge-strength', chargeStrength);
  updateControl('#center-force', centerStrength === 1, true);
  updateControl('#curved-links', curvedLinks, true);
  updateControl('#base-curvature', baseCurvature);
  updateControl('#loop-curvature', loopCurvature);
  updateControl('#curvature-step', curvatureStep);

  // Mise à jour du toggle pour les liens courbés
  d3.select('#curved-links').property('checked', curvedLinks);
  
  // Mise à jour des valeurs de courbure
  d3.select('#base-curvature').property('value', baseCurvature);
  d3.select('#loop-curvature').property('value', loopCurvature);
  d3.select('#curvature-step').property('value', curvatureStep);
  
  // Mise à jour de la visibilité des contrôles de courbure
  updateCurvatureControlsVisibility();
}

/**
 * Affiche ou masque les contrôles de courbure selon l'état de curvedLinks
 */
function updateCurvatureControlsVisibility() {
  // Afficher/masquer les contrôles de courbure selon l'état du toggle
  d3.select('#curvature-controls').style('display', curvedLinks ? 'block' : 'none');
}

/**
 * Met à jour la configuration à partir d'un objet JSON
 */
function updateConfigAndInputs(jsonObj) {
  // Utiliser l'opérateur nullish coalescing pour des valeurs par défaut plus claires
  linkStrength = jsonObj.linkStrength ?? CONFIG.defaults.linkStrength;
  linkDistance = jsonObj.linkDistance ?? CONFIG.defaults.linkDistance;
  chargeStrength = jsonObj.chargeStrength ?? CONFIG.defaults.chargeStrength;
  centerStrength = jsonObj.centerStrength ?? CONFIG.defaults.centerStrength;
  curvedLinks = jsonObj.curvedLinks ?? CONFIG.defaults.curvedLinks;
  baseCurvature = jsonObj.baseCurvature ?? CONFIG.defaults.baseCurvature;
  loopCurvature = jsonObj.loopCurvature ?? CONFIG.defaults.loopCurvature;
  curvatureStep = jsonObj.curvatureStep ?? CONFIG.defaults.curvatureStep;
  
  // Mettre à jour les forces
  forceConfig.link.distance(linkDistance).strength(linkStrength);
  forceConfig.charge.strength(chargeStrength);
  forceConfig.center.strength(centerStrength);
  
  updateHTMLInputs();
}

/**
 * Exporte la configuration actuelle
 */
function exportConfig() {
  const config = { 
    linkStrength, linkDistance, chargeStrength, centerStrength,
    curvedLinks, baseCurvature, loopCurvature, curvatureStep
  };
  
  // Utiliser URL.createObjectURL pour plus de clarté
  const jsonStr = JSON.stringify(config, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = "config.json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);  // Nettoyer l'URL après utilisation
}

/**
 * Fonction générique pour charger un fichier JSON
 */
async function loadConfigFile(file) {
  try {
    const response = await fetch(file);
    if (!response.ok) throw new Error(`Erreur HTTP: ${response.status}`);
    const jsonObj = await response.json();
    updateConfigAndInputs(jsonObj);
    return jsonObj;
  } catch (error) {
    console.error(`Erreur lors du chargement du fichier ${file}:`, error);
    return null;
  }
}

/**
 * Initialise la liste des fichiers de configuration disponibles
 */
async function initConfigFilesList() {
  try {
    const response = await fetch(CONFIG.directoryPath);
    const text = await response.text();
    const parser = new DOMParser();
    const html = parser.parseFromString(text, 'text/html');
    
    const jsonFiles = Array.from(html.querySelectorAll('a'))
      .filter(link => link.href.endsWith('.json'))
      .map(link => link.textContent);
      
    if (jsonFiles.length === 0) {
      console.log('Aucun fichier JSON trouvé!');
      return;
    }
    
    // Utiliser la méthode originale pour garantir la compatibilité
    const container = document.getElementById("import-config-json");
    if (container) {
      container.innerHTML = "Config:";
      
      const select = d3.select(container)
        .append('select')
        .attr('id', 'json-files');
        
      select.append('option')
        .attr('value', '')
        .text('-- Sélectionner --');
        
      jsonFiles.forEach(file => {
        select.append('option')
          .attr('value', file)
          .text(file.split(".")[0]);
      });
      
      select.property('value', CONFIG.defaultFile);
      
      select.on('change', function() {
        const selectedFile = this.value;
        if (selectedFile) {
          loadConfigFile(CONFIG.directoryPath + selectedFile);
        }
      });
    }
  } catch (error) {
    console.error('Erreur lors de la récupération des fichiers JSON:', error);
  }
}

// Initialisation des fonctionnalités
document.addEventListener('DOMContentLoaded', () => {
  initEventListeners();
  initConfigFilesList();
  loadConfigFile(CONFIG.directoryPath + CONFIG.defaultFile);
  
  // Configurer les boutons export/import
  d3.select('#export-config').on('click', exportConfig);
  d3.select('#import-config').on('change', function() {
    const file = this.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = e => {
        updateConfigAndInputs(JSON.parse(e.target.result));
        updateGraph(); // Mettre à jour le graphe après l'importation
      };
      reader.readAsText(file);
    }
  });
  
  // Initialiser la visibilité des contrôles de courbure
  updateCurvatureControlsVisibility();
});

export function getForceConfiguration() {
  return forceConfig;
}

export function getLinkStyle() {
  return { curvedLinks, baseCurvature, loopCurvature, curvatureStep };
}
