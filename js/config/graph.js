/**
 * Graph configuration (forces, link styles).
 */

import { listJsonFiles } from '../services/fileService.js';
import eventBus from '../services/EventBus.js';
import { createDefaultContextMenuConfig, sanitizeContextMenuConfig } from '../services/ContextMenuConfigService.js';

export const graphConfig = {
  // Configuration file path settings.
  paths: {
    configDirectory: 'json_config/',
    defaultFile: 'manual_without_force.json'
  },
  
  // Simulation force configuration.
  forces: {
    linkStrength: 0,
    linkDistance: 200,
    chargeStrength: 0, // Charge force.
    centerStrength: 0  // Centering force.
  },
  
  // Link style.
  linkStyle: {
    curvedLinks: true,   // Default value: curved links.
    baseCurvature: 0.2,
    loopCurvature: 1.5,
    curvatureStep: 0.1
  },
  
  // Option to force link recreation.
  forceRecreateLinks: true,
  
  // Marker configuration (arrows).
  markers: {
    arrowWidth: 8,
    arrowHeight: 8,
    markerAdjustment: 1
  },

  // Style rules for nodes/links (conditions + styles).
  styleRules: {
    nodes: [],
    links: []
  },

  // Pie chart rules for nodes.
  pieRules: {
    nodes: []
  },

  // Dynamic groups for nodes/links (rules + manual ids).
  groups: {
    nodes: [],
    links: []
  },

  // Contextual menu configuration.
  contextMenu: createDefaultContextMenuConfig()
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

function normalizeGroups(data) {
  if (!data) return { nodes: [], links: [] };
  if (Array.isArray(data)) return { nodes: data, links: [] };
  return {
    nodes: Array.isArray(data.nodes) ? data.nodes : [],
    links: Array.isArray(data.links) ? data.links : []
  };
}

/**
 * Loads a JSON configuration file.
 * Path to the file to load.
 * JSON configuration data.
 */
async function loadConfigFile(filePath) {
  try {
    console.log(`Tentative de chargement du fichier: ${filePath}`);
    const response = await fetch(filePath);
    if (!response.ok) throw new Error(`Erreur HTTP: ${response.status}`);
    const jsonObj = await response.json();
    console.log(`Fichier chargé avec succès: ${filePath}`, jsonObj);
    return jsonObj;
  } catch (error) {
    console.error(`Erreur lors du chargement du fichier ${filePath}:`, error);
    throw error;
  }
}

/**
 * Initializes the list of available configuration files.
 * Function to call when configuration changes.
 */
export async function initConfigFilesList(updateCallback) {
  try {
    const jsonFiles = await listJsonFiles(graphConfig.paths.configDirectory);
    if (jsonFiles.length === 0) {
      console.log('Aucun fichier JSON de configuration trouvé!');
      return;
    }
    console.log(`Fichiers JSON trouvés: ${jsonFiles.join(', ')}`);
    
    // Get the container.
    const container = document.getElementById("import-config-json");
    if (!container) {
      console.error("Conteneur import-config-json non trouvé!");
      return;
    }
    
    // Check if the dropdown already exists.
    let select = document.getElementById('json-files');
    if (select) {
      // Clear the existing list.
      while (select.firstChild) {
        select.removeChild(select.firstChild);
      }
    } else {
      // Create the dropdown list.
      select = document.createElement('select');
      select.id = 'json-files';
      select.className = 'form-control form-control-sm';
      
      // Add the list after the "Config:" text.
      container.appendChild(document.createTextNode(' '));
      container.appendChild(select);
    }
    
    // Add options.
    jsonFiles.forEach(file => {
      const option = document.createElement('option');
      option.value = file;
      option.textContent = file.split(".")[0];
      select.appendChild(option);
    });
    
    // Set the default value.
    select.value = graphConfig.paths.defaultFile;
    
    // Add the event listener.
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
    
    // Load the default file on startup.
    loadConfigFile(graphConfig.paths.configDirectory + graphConfig.paths.defaultFile)
      .then(configData => {
        if (configData && updateCallback) {
          updateCallback(configData);
        }
      })
      .catch(error => {
        console.error(`Erreur lors du chargement du fichier par défaut:`, error);
      });
    
    console.log(`Liste déroulante de configuration initialisée avec ${jsonFiles.length} fichiers`);
    
  } catch (error) {
    console.error('Erreur lors de la récupération des fichiers JSON de configuration:', error);
  }
}

/**
 * Updates graph configuration from JSON data.
 * Configuration data.
 * Graph renderer for updates.
 */
export function updateGraphConfig(configData, renderer) {
  if (!configData) {
    console.error("Données de configuration invalides ou manquantes");
    return;
  }
  
  console.log("Mise à jour de la configuration:", configData);
  
  // Update force configuration.
  if (configData.linkStrength !== undefined) graphConfig.forces.linkStrength = configData.linkStrength;
  if (configData.linkDistance !== undefined) graphConfig.forces.linkDistance = configData.linkDistance;
  if (configData.chargeStrength !== undefined) graphConfig.forces.chargeStrength = configData.chargeStrength;
  if (configData.centerStrength !== undefined) graphConfig.forces.centerStrength = configData.centerStrength;
  
  // Update link style configuration.
  if (configData.curvedLinks !== undefined) {
    graphConfig.linkStyle.curvedLinks = configData.curvedLinks;
    console.log(`Mise à jour curvedLinks à: ${configData.curvedLinks}`);
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

  if (configData.groups !== undefined) {
    graphConfig.groups = normalizeGroups(configData.groups);
    eventBus.emit('group-rules-updated', { rules: graphConfig.groups });
  }

  if (configData.contextMenu !== undefined) {
    graphConfig.contextMenu = sanitizeContextMenuConfig(configData.contextMenu);
    eventBus.emit('context-menu-config-updated', { config: graphConfig.contextMenu });
  }
  
  // Update force simulation if renderer is provided.
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
  
  // Update HTML controls.
  updateConfigControls();
  
  // Update the graph if renderer is provided.
  if (renderer) {
    renderer.updateGraph();
  }
  
  console.log("Configuration mise à jour avec succès, curvedLinks =", graphConfig.linkStyle.curvedLinks);
}

/**
 * Updates HTML controls with current configuration values.
 */
function updateConfigControls() {
  console.log("Mise à jour des contrôles HTML...");
  
  // Link force.
  const linkForceCheckbox = document.getElementById('link-force');
  if (linkForceCheckbox) {
    linkForceCheckbox.checked = graphConfig.forces.linkStrength > 0;
  }
  
  // Link distance.
  const linkDistanceInput = document.getElementById('link-distance');
  if (linkDistanceInput) {
    linkDistanceInput.value = graphConfig.forces.linkDistance;
  }
  
  // Charge force.
  const chargeStrengthInput = document.getElementById('charge-strength');
  if (chargeStrengthInput) {
    chargeStrengthInput.value = graphConfig.forces.chargeStrength;
  }
  
  // Centering force.
  const centerForceCheckbox = document.getElementById('center-force');
  if (centerForceCheckbox) {
    centerForceCheckbox.checked = graphConfig.forces.centerStrength > 0;
  }
  
  // Curved links.
  const curvedLinksCheckbox = document.getElementById('curved-links');
  if (curvedLinksCheckbox) {
    curvedLinksCheckbox.checked = graphConfig.linkStyle.curvedLinks;
    console.log("Mise à jour de la case à cocher curvedLinks:", graphConfig.linkStyle.curvedLinks);
  }
  
  // Curvature parameters.
  const baseCurvatureInput = document.getElementById('base-curvature');
  const loopCurvatureInput = document.getElementById('loop-curvature');
  const curvatureStepInput = document.getElementById('curvature-step');
  
  if (baseCurvatureInput) baseCurvatureInput.value = graphConfig.linkStyle.baseCurvature;
  if (loopCurvatureInput) loopCurvatureInput.value = graphConfig.linkStyle.loopCurvature;
  if (curvatureStepInput) curvatureStepInput.value = graphConfig.linkStyle.curvatureStep;
  
  // Link recreation.
  const forceRecreateLinksCheckbox = document.getElementById('forceRecreateLinks');
  if (forceRecreateLinksCheckbox) {
    forceRecreateLinksCheckbox.checked = graphConfig.forceRecreateLinks;
  }
  
  // Update display labels for sliders.
  updateRangeValues();
  
  // Show/hide curvature controls based on state.
  updateCurvatureControlsVisibility();
  
  console.log("Contrôles HTML mis à jour avec succès");
}

/**
 * Updates displayed values for range controls.
 */
function updateRangeValues() {
  // Update value displays.
  const baseCurvatureValue = document.getElementById('base-curvature-value');
  const loopCurvatureValue = document.getElementById('loop-curvature-value');
  const curvatureStepValue = document.getElementById('curvature-step-value');
  
  if (baseCurvatureValue) baseCurvatureValue.textContent = graphConfig.linkStyle.baseCurvature;
  if (loopCurvatureValue) loopCurvatureValue.textContent = graphConfig.linkStyle.loopCurvature;
  if (curvatureStepValue) curvatureStepValue.textContent = graphConfig.linkStyle.curvatureStep;
}

/**
 * Updates visibility of curvature controls.
 */
function updateCurvatureControlsVisibility() {
  const curvatureControls = document.getElementById('curvature-controls');
  if (curvatureControls) {
    curvatureControls.style.display = graphConfig.linkStyle.curvedLinks ? 'block' : 'none';
  }
}

// (UI listeners are managed by EventManager to centralize configuration)


