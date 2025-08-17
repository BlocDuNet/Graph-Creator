/**
 * Configuration du graphe (forces, styles des liens)
 */

import { listJsonFiles } from '../services/fileService.js';

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
    chargeStrength: -300, // Valeur négative par défaut pour une répulsion entre nœuds
    centerStrength: 0.3   // Force de centrage modérée
  },
  
  // Style des liens
  linkStyle: {
    curvedLinks: true,   // Valeur par défaut: liens courbes
    baseCurvature: 0.2,
    loopCurvature: 1.5,
    curvatureStep: 0.1
  },
  
  // Option pour forcer la recréation des liens
  forceRecreateLinks: true,
  
  // Configuration des marqueurs (flèches)
  markers: {
    arrowWidth: 8,
    arrowHeight: 8,
    markerAdjustment: 1
  }
};

/**
 * Charge un fichier de configuration JSON
 * @param {string} filePath - Chemin du fichier à charger
 * @returns {Promise<Object>} - Données de configuration JSON
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
 * Initialise la liste des fichiers de configuration disponibles
 * @param {Function} updateCallback - Fonction à appeler lors du changement de configuration
 */
export async function initConfigFilesList(updateCallback) {
  try {
    const jsonFiles = await listJsonFiles(graphConfig.paths.configDirectory);
    if (jsonFiles.length === 0) {
      console.log('Aucun fichier JSON de configuration trouvé!');
      return;
    }
    console.log(`Fichiers JSON trouvés: ${jsonFiles.join(', ')}`);
    
    // Obtenir le conteneur
    const container = document.getElementById("import-config-json");
    if (!container) {
      console.error("Conteneur import-config-json non trouvé!");
      return;
    }
    
    // Vérifier si la liste déroulante existe déjà
    let select = document.getElementById('json-files');
    if (select) {
      // Vider la liste existante
      while (select.firstChild) {
        select.removeChild(select.firstChild);
      }
    } else {
      // Créer la liste déroulante
      select = document.createElement('select');
      select.id = 'json-files';
      select.className = 'form-control form-control-sm';
      
      // Ajouter la liste après le texte "Config:"
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
    
    // Définir la valeur par défaut
    select.value = graphConfig.paths.defaultFile;
    
    // Ajouter l'écouteur d'événement
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
    
    // Charger le fichier par défaut au démarrage
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
 * Met à jour la configuration du graphe à partir des données JSON
 * @param {Object} configData - Données de configuration
 * @param {Object} renderer - Renderer du graphe pour la mise à jour
 */
export function updateGraphConfig(configData, renderer) {
  if (!configData) {
    console.error("Données de configuration invalides ou manquantes");
    return;
  }
  
  console.log("Mise à jour de la configuration:", configData);
  
  // Mettre à jour la configuration des forces
  if (configData.linkStrength !== undefined) graphConfig.forces.linkStrength = configData.linkStrength;
  if (configData.linkDistance !== undefined) graphConfig.forces.linkDistance = configData.linkDistance;
  if (configData.chargeStrength !== undefined) graphConfig.forces.chargeStrength = configData.chargeStrength;
  if (configData.centerStrength !== undefined) graphConfig.forces.centerStrength = configData.centerStrength;
  
  // Mettre à jour la configuration du style des liens
  if (configData.curvedLinks !== undefined) {
    graphConfig.linkStyle.curvedLinks = configData.curvedLinks;
    console.log(`Mise à jour curvedLinks à: ${configData.curvedLinks}`);
  }
  if (configData.baseCurvature !== undefined) graphConfig.linkStyle.baseCurvature = configData.baseCurvature;
  if (configData.loopCurvature !== undefined) graphConfig.linkStyle.loopCurvature = configData.loopCurvature;
  if (configData.curvatureStep !== undefined) graphConfig.linkStyle.curvatureStep = configData.curvatureStep;
  
  // Mettre à jour la simulation de forces si le renderer est fourni
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
  
  // Mettre à jour les contrôles HTML
  updateConfigControls();
  
  // Mettre à jour le graphe si le renderer est fourni
  if (renderer) {
    renderer.updateGraph();
  }
  
  console.log("Configuration mise à jour avec succès, curvedLinks =", graphConfig.linkStyle.curvedLinks);
}

/**
 * Met à jour les contrôles HTML avec les valeurs actuelles de la configuration
 */
function updateConfigControls() {
  console.log("Mise à jour des contrôles HTML...");
  
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
  
  // Liens courbés
  const curvedLinksCheckbox = document.getElementById('curved-links');
  if (curvedLinksCheckbox) {
    curvedLinksCheckbox.checked = graphConfig.linkStyle.curvedLinks;
    console.log("Mise à jour de la case à cocher curvedLinks:", graphConfig.linkStyle.curvedLinks);
  }
  
  // Paramètres de courbure
  const baseCurvatureInput = document.getElementById('base-curvature');
  const loopCurvatureInput = document.getElementById('loop-curvature');
  const curvatureStepInput = document.getElementById('curvature-step');
  
  if (baseCurvatureInput) baseCurvatureInput.value = graphConfig.linkStyle.baseCurvature;
  if (loopCurvatureInput) loopCurvatureInput.value = graphConfig.linkStyle.loopCurvature;
  if (curvatureStepInput) curvatureStepInput.value = graphConfig.linkStyle.curvatureStep;
  
  // Recréation des liens
  const forceRecreateLinksCheckbox = document.getElementById('forceRecreateLinks');
  if (forceRecreateLinksCheckbox) {
    forceRecreateLinksCheckbox.checked = graphConfig.forceRecreateLinks;
  }
  
  // Mise à jour des étiquettes d'affichage pour les sliders
  updateRangeValues();
  
  // Afficher/masquer les contrôles de courbure selon l'état
  updateCurvatureControlsVisibility();
  
  console.log("Contrôles HTML mis à jour avec succès");
}

/**
 * Met à jour les valeurs affichées pour les contrôles de plage
 */
function updateRangeValues() {
  // Mise à jour des affichages de valeur
  const baseCurvatureValue = document.getElementById('base-curvature-value');
  const loopCurvatureValue = document.getElementById('loop-curvature-value');
  const curvatureStepValue = document.getElementById('curvature-step-value');
  
  if (baseCurvatureValue) baseCurvatureValue.textContent = graphConfig.linkStyle.baseCurvature;
  if (loopCurvatureValue) loopCurvatureValue.textContent = graphConfig.linkStyle.loopCurvature;
  if (curvatureStepValue) curvatureStepValue.textContent = graphConfig.linkStyle.curvatureStep;
}

/**
 * Met à jour la visibilité des contrôles de courbure
 */
function updateCurvatureControlsVisibility() {
  const curvatureControls = document.getElementById('curvature-controls');
  if (curvatureControls) {
    curvatureControls.style.display = graphConfig.linkStyle.curvedLinks ? 'block' : 'none';
  }
}

// Ajouter une fonction d'initialisation pour synchroniser les contrôles d'UI
export function initGraphControls() {
  // Synchroniser les contrôles d'UI avec la configuration actuelle
  document.addEventListener('DOMContentLoaded', () => {
    // Force controls
    const linkForceCheck = document.getElementById('link-force');
    const linkDistanceInput = document.getElementById('link-distance');
    const chargeStrengthInput = document.getElementById('charge-strength');
    const centerForceCheck = document.getElementById('center-force');
    
    if (linkForceCheck) linkForceCheck.checked = graphConfig.forces.linkStrength > 0;
    if (linkDistanceInput) linkDistanceInput.value = graphConfig.forces.linkDistance;
    if (chargeStrengthInput) chargeStrengthInput.value = graphConfig.forces.chargeStrength;
    if (centerForceCheck) centerForceCheck.checked = graphConfig.forces.centerStrength > 0;
    
    // Link style controls
    const curvedLinksCheck = document.getElementById('curved-links');
    const baseCurvatureInput = document.getElementById('base-curvature');
    const loopCurvatureInput = document.getElementById('loop-curvature');
    const curvatureStepInput = document.getElementById('curvature-step');
    
    if (curvedLinksCheck) curvedLinksCheck.checked = graphConfig.linkStyle.curvedLinks;
    if (baseCurvatureInput) baseCurvatureInput.value = graphConfig.linkStyle.baseCurvature;
    if (loopCurvatureInput) loopCurvatureInput.value = graphConfig.linkStyle.loopCurvature;
    if (curvatureStepInput) curvatureStepInput.value = graphConfig.linkStyle.curvatureStep;
    
    // Force recreate links
    const forceRecreateLinksCheck = document.getElementById('forceRecreateLinks');
    if (forceRecreateLinksCheck) forceRecreateLinksCheck.checked = graphConfig.forceRecreateLinks;
    
    // Mettre à jour les affichages de valeur pour les sliders
    updateCurvatureDisplays();
    
    // Ajouter les écouteurs d'événements si nécessaire
    addGraphConfigListeners();
  });
}

// Mettre à jour les affichages de valeur pour les contrôles de courbure
function updateCurvatureDisplays() {
  const baseCurvatureValue = document.getElementById('base-curvature-value');
  const loopCurvatureValue = document.getElementById('loop-curvature-value');
  const curvatureStepValue = document.getElementById('curvature-step-value');
  
  if (baseCurvatureValue) baseCurvatureValue.textContent = graphConfig.linkStyle.baseCurvature;
  if (loopCurvatureValue) loopCurvatureValue.textContent = graphConfig.linkStyle.loopCurvature;
  if (curvatureStepValue) curvatureStepValue.textContent = graphConfig.linkStyle.curvatureStep;
}

// Ajouter les écouteurs d'événements pour les contrôles de configuration
export function addGraphConfigListeners() {
  // Force controls
  const linkForceCheck = document.getElementById('link-force');
  const linkDistanceInput = document.getElementById('link-distance');
  const chargeStrengthInput = document.getElementById('charge-strength');
  const centerForceCheck = document.getElementById('center-force');
  
  if (linkForceCheck) {
    linkForceCheck.addEventListener('change', (event) => {
      graphConfig.forces.linkStrength = event.target.checked ? 1 : 0;
      updateGraphFromConfig();
    });
  }
  
  if (linkDistanceInput) {
    linkDistanceInput.addEventListener('change', (event) => {
      graphConfig.forces.linkDistance = parseFloat(event.target.value);
      updateGraphFromConfig();
    });
  }
  
  if (chargeStrengthInput) {
    chargeStrengthInput.addEventListener('change', (event) => {
      graphConfig.forces.chargeStrength = parseFloat(event.target.value);
      updateGraphFromConfig();
    });
  }
  
  if (centerForceCheck) {
    centerForceCheck.addEventListener('change', (event) => {
      graphConfig.forces.centerStrength = event.target.checked ? 1 : 0;
      updateGraphFromConfig();
    });
  }
  
  // Force recreate links
  const forceRecreateLinksCheck = document.getElementById('forceRecreateLinks');
  if (forceRecreateLinksCheck) {
    forceRecreateLinksCheck.addEventListener('change', (event) => {
      graphConfig.forceRecreateLinks = event.target.checked;
      updateGraphFromConfig();
    });
  }
}

// Ajouter une fonction directe pour basculer entre liens droits et courbes
export function toggleCurvedLinks() {
  graphConfig.linkStyle.curvedLinks = !graphConfig.linkStyle.curvedLinks;
  console.log("Toggle curvedLinks:", graphConfig.linkStyle.curvedLinks);
  updateCurvatureControlsVisibility();
  return graphConfig.linkStyle.curvedLinks;
}

// Fonction pour déclencher la mise à jour du graphe après un changement de configuration
function updateGraphFromConfig() {
  // Émettre un événement personnalisé que le app.js peut écouter
  window.dispatchEvent(new CustomEvent('graph-config-changed', { 
    detail: { graphConfig }
  }));
}
