/**
 * Configuration du graphe (forces, styles des liens)
 */

import { listJsonFiles } from '../services/fileService.js';
import eventBus from '../services/EventBus.js';

export const graphConfig = {
  // Configuration des chemins des fichiers de configuration
  paths: {
    configDirectory: 'json_config/',
    defaultFile: 'manual_without_force.json'
  },
  
  // Configuration des forces de la simulation
  forces: {
    linkStrength: 0,
    linkDistance: 200,
    chargeStrength: -300, // Valeur nÃ©gative par dÃ©faut pour une rÃ©pulsion entre nÅ“uds
    centerStrength: 0.3   // Force de centrage modÃ©rÃ©e
  },
  
  // Style des liens
  linkStyle: {
    curvedLinks: true,   // Valeur par dÃ©faut: liens courbes
    baseCurvature: 0.2,
    loopCurvature: 1.5,
    curvatureStep: 0.1
  },
  
  // Option pour forcer la recrÃ©ation des liens
  forceRecreateLinks: true,
  
  // Configuration des marqueurs (flÃ¨ches)
  markers: {
    arrowWidth: 8,
    arrowHeight: 8,
    markerAdjustment: 1
  },

  // Regles de style pour noeuds/liens (conditions + styles)
  styleRules: {
    nodes: [],
    links: []
  },

  // Regles de pie chart pour noeuds
  pieRules: {
    nodes: []
  }
};

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
  return { nodes: Array.isArray(data.nodes) ? data.nodes : [] };
}

/**
 * Charge un fichier de configuration JSON
 * @param {string} filePath - Chemin du fichier Ã  charger
 * @returns {Promise<Object>} - DonnÃ©es de configuration JSON
 */
async function loadConfigFile(filePath) {
  try {
    console.log(`Tentative de chargement du fichier: ${filePath}`);
    const response = await fetch(filePath);
    if (!response.ok) throw new Error(`Erreur HTTP: ${response.status}`);
    const jsonObj = await response.json();
    console.log(`Fichier chargÃ© avec succÃ¨s: ${filePath}`, jsonObj);
    return jsonObj;
  } catch (error) {
    console.error(`Erreur lors du chargement du fichier ${filePath}:`, error);
    throw error;
  }
}

/**
 * Initialise la liste des fichiers de configuration disponibles
 * @param {Function} updateCallback - Fonction Ã  appeler lors du changement de configuration
 */
export async function initConfigFilesList(updateCallback) {
  try {
    const jsonFiles = await listJsonFiles(graphConfig.paths.configDirectory);
    if (jsonFiles.length === 0) {
      console.log('Aucun fichier JSON de configuration trouvÃ©!');
      return;
    }
    console.log(`Fichiers JSON trouvÃ©s: ${jsonFiles.join(', ')}`);
    
    // Obtenir le conteneur
    const container = document.getElementById("import-config-json");
    if (!container) {
      console.error("Conteneur import-config-json non trouvÃ©!");
      return;
    }
    
    // VÃ©rifier si la liste dÃ©roulante existe dÃ©jÃ 
    let select = document.getElementById('json-files');
    if (select) {
      // Vider la liste existante
      while (select.firstChild) {
        select.removeChild(select.firstChild);
      }
    } else {
      // CrÃ©er la liste dÃ©roulante
      select = document.createElement('select');
      select.id = 'json-files';
      select.className = 'form-control form-control-sm';
      
      // Ajouter la liste aprÃ¨s le texte "Config:"
      container.appendChild(document.createTextNode(' '));
      container.appendChild(select);
    }
    
    // Ajouter les options
    jsonFiles.forEach(file => {
      const option = document.createElement('option');
      option.value = file;
      option.textContent = file.split(".")[0];
      select.appendChild(option);
    });
    
    // DÃ©finir la valeur par dÃ©faut
    select.value = graphConfig.paths.defaultFile;
    
    // Ajouter l'Ã©couteur d'Ã©vÃ©nement
    select.addEventListener('change', async function() {
      const selectedFile = this.value;
      if (selectedFile) {
        console.log(`Chargement du fichier de configuration: ${selectedFile}`);
        try {
          const configData = await loadConfigFile(graphConfig.paths.configDirectory + selectedFile);
          if (configData && updateCallback) {
            updateCallback(configData);
          }
        } catch (error) {
          console.error(`Erreur lors du chargement de la configuration ${selectedFile}:`, error);
        }
      }
    });
    
    // Charger le fichier par dÃ©faut au dÃ©marrage
    loadConfigFile(graphConfig.paths.configDirectory + graphConfig.paths.defaultFile)
      .then(configData => {
        if (configData && updateCallback) {
          updateCallback(configData);
        }
      })
      .catch(error => {
        console.error(`Erreur lors du chargement du fichier par dÃ©faut:`, error);
      });
    
    console.log(`Liste dÃ©roulante de configuration initialisÃ©e avec ${jsonFiles.length} fichiers`);
    
  } catch (error) {
    console.error('Erreur lors de la rÃ©cupÃ©ration des fichiers JSON de configuration:', error);
  }
}

/**
 * Met Ã  jour la configuration du graphe Ã  partir des donnÃ©es JSON
 * @param {Object} configData - DonnÃ©es de configuration
 * @param {Object} renderer - Renderer du graphe pour la mise Ã  jour
 */
export function updateGraphConfig(configData, renderer) {
  if (!configData) {
    console.error("DonnÃ©es de configuration invalides ou manquantes");
    return;
  }
  
  console.log("Mise Ã  jour de la configuration:", configData);
  
  // Mettre Ã  jour la configuration des forces
  if (configData.linkStrength !== undefined) graphConfig.forces.linkStrength = configData.linkStrength;
  if (configData.linkDistance !== undefined) graphConfig.forces.linkDistance = configData.linkDistance;
  if (configData.chargeStrength !== undefined) graphConfig.forces.chargeStrength = configData.chargeStrength;
  if (configData.centerStrength !== undefined) graphConfig.forces.centerStrength = configData.centerStrength;
  
  // Mettre Ã  jour la configuration du style des liens
  if (configData.curvedLinks !== undefined) {
    graphConfig.linkStyle.curvedLinks = configData.curvedLinks;
    console.log(`Mise Ã  jour curvedLinks Ã : ${configData.curvedLinks}`);
  }
  if (configData.baseCurvature !== undefined) graphConfig.linkStyle.baseCurvature = configData.baseCurvature;
  if (configData.loopCurvature !== undefined) graphConfig.linkStyle.loopCurvature = configData.loopCurvature;
  if (configData.curvatureStep !== undefined) graphConfig.linkStyle.curvatureStep = configData.curvatureStep;

  if (configData.styleRules !== undefined) {
    graphConfig.styleRules = normalizeStyleRules(configData.styleRules);
    eventBus.emit('style-rules-updated', { rules: graphConfig.styleRules });
  }

  if (configData.pieRules !== undefined) {
    graphConfig.pieRules = normalizePieRules(configData.pieRules);
    eventBus.emit('pie-rules-updated', { rules: graphConfig.pieRules });
  }
  
  // Mettre Ã  jour la simulation de forces si le renderer est fourni
  if (renderer && renderer.simulation) {
    const { linkStrength, linkDistance, chargeStrength, centerStrength } = graphConfig.forces;
    
    if (renderer.simulation.force('link')) {
      renderer.simulation.force('link')
        .strength(linkStrength)
        .distance(linkDistance);
    }
    
    if (renderer.simulation.force('charge')) {
      renderer.simulation.force('charge').strength(chargeStrength);
    }
    
    if (renderer.simulation.force('center')) {
      renderer.simulation.force('center').strength(centerStrength);
    }
  }
  
  // Mettre Ã  jour les contrÃ´les HTML
  updateConfigControls();
  
  // Mettre Ã  jour le graphe si le renderer est fourni
  if (renderer) {
    renderer.updateGraph();
  }
  
  console.log("Configuration mise Ã  jour avec succÃ¨s, curvedLinks =", graphConfig.linkStyle.curvedLinks);
}

/**
 * Met Ã  jour les contrÃ´les HTML avec les valeurs actuelles de la configuration
 */
function updateConfigControls() {
  console.log("Mise Ã  jour des contrÃ´les HTML...");
  
  // Force de lien
  const linkForceCheckbox = document.getElementById('link-force');
  if (linkForceCheckbox) {
    linkForceCheckbox.checked = graphConfig.forces.linkStrength > 0;
  }
  
  // Distance de lien
  const linkDistanceInput = document.getElementById('link-distance');
  if (linkDistanceInput) {
    linkDistanceInput.value = graphConfig.forces.linkDistance;
  }
  
  // Force de charge
  const chargeStrengthInput = document.getElementById('charge-strength');
  if (chargeStrengthInput) {
    chargeStrengthInput.value = graphConfig.forces.chargeStrength;
  }
  
  // Force de centrage
  const centerForceCheckbox = document.getElementById('center-force');
  if (centerForceCheckbox) {
    centerForceCheckbox.checked = graphConfig.forces.centerStrength > 0;
  }
  
  // Liens courbÃ©s
  const curvedLinksCheckbox = document.getElementById('curved-links');
  if (curvedLinksCheckbox) {
    curvedLinksCheckbox.checked = graphConfig.linkStyle.curvedLinks;
    console.log("Mise Ã  jour de la case Ã  cocher curvedLinks:", graphConfig.linkStyle.curvedLinks);
  }
  
  // ParamÃ¨tres de courbure
  const baseCurvatureInput = document.getElementById('base-curvature');
  const loopCurvatureInput = document.getElementById('loop-curvature');
  const curvatureStepInput = document.getElementById('curvature-step');
  
  if (baseCurvatureInput) baseCurvatureInput.value = graphConfig.linkStyle.baseCurvature;
  if (loopCurvatureInput) loopCurvatureInput.value = graphConfig.linkStyle.loopCurvature;
  if (curvatureStepInput) curvatureStepInput.value = graphConfig.linkStyle.curvatureStep;
  
  // RecrÃ©ation des liens
  const forceRecreateLinksCheckbox = document.getElementById('forceRecreateLinks');
  if (forceRecreateLinksCheckbox) {
    forceRecreateLinksCheckbox.checked = graphConfig.forceRecreateLinks;
  }
  
  // Mise Ã  jour des Ã©tiquettes d'affichage pour les sliders
  updateRangeValues();
  
  // Afficher/masquer les contrÃ´les de courbure selon l'Ã©tat
  updateCurvatureControlsVisibility();
  
  console.log("ContrÃ´les HTML mis Ã  jour avec succÃ¨s");
}

/**
 * Met Ã  jour les valeurs affichÃ©es pour les contrÃ´les de plage
 */
function updateRangeValues() {
  // Mise Ã  jour des affichages de valeur
  const baseCurvatureValue = document.getElementById('base-curvature-value');
  const loopCurvatureValue = document.getElementById('loop-curvature-value');
  const curvatureStepValue = document.getElementById('curvature-step-value');
  
  if (baseCurvatureValue) baseCurvatureValue.textContent = graphConfig.linkStyle.baseCurvature;
  if (loopCurvatureValue) loopCurvatureValue.textContent = graphConfig.linkStyle.loopCurvature;
  if (curvatureStepValue) curvatureStepValue.textContent = graphConfig.linkStyle.curvatureStep;
}

/**
 * Met Ã  jour la visibilitÃ© des contrÃ´les de courbure
 */
function updateCurvatureControlsVisibility() {
  const curvatureControls = document.getElementById('curvature-controls');
  if (curvatureControls) {
    curvatureControls.style.display = graphConfig.linkStyle.curvedLinks ? 'block' : 'none';
  }
}

// (Les Ã©couteurs UI sont gÃ©rÃ©s par EventManager pour centraliser la configuration)


