/**
 * Point d'entrée principal de l'application Graph-Creator
 * Initialise tous les composants et coordonne leur interaction
 */
import { GraphState } from './state/GraphState.js';
import { GraphRenderer } from './graph/renderer.js';
import { InteractionManager } from './graph/interactions.js';
import { UIManager } from './ui/UIManager.js';
import { AIManager } from './ai/AIManager.js';
import { registerGraphState, registerUpdateCallback } from './state/undo_redo.js';
import { initLayoutManager } from './services/layoutManager.js';
import { initIOServices } from './services/io.js';
import { graphConfig, initConfigFilesList, updateGraphConfig, toggleCurvedLinks } from './config/graph.js';

// Attend que le DOM soit complètement chargé pour initialiser l'application
document.addEventListener('DOMContentLoaded', () => {
  console.log('Initialisation de Graph-Creator...');

  // 1. Création de l'état du graphe
  const graphState = new GraphState();
  
  // 2. Enregistrement de l'état pour le système undo/redo
  registerGraphState(graphState);
  
  // 3. Création du renderer pour afficher le graphe
  const renderer = new GraphRenderer(graphState, d3.select('svg'));
  
  // 4. Enregistrement de la fonction de mise à jour du graphe
  registerUpdateCallback(() => renderer.updateGraph());
  
  // 5. Initialisation du gestionnaire d'interactions
  const interactionManager = new InteractionManager(graphState, renderer, d3.select('svg'));
  
  // 6. Initialisation du gestionnaire d'interface utilisateur
  const uiManager = new UIManager(graphState, renderer);
  
  // 7. Initialisation du gestionnaire d'IA
  const aiManager = new AIManager(graphState, renderer);
  
  // 8. Initialisation des services
  initIOServices(graphState, renderer);
  initLayoutManager(graphState, renderer);
  
  // 9. Initialisation de la liste des fichiers de configuration
  initConfigFilesList((configData) => {
    updateGraphConfig(configData, renderer);
  });
  
  // 10. Configurer l'écouteur d'événement pour le toggle de liens courbes
  const curvedLinksToggle = document.getElementById('curved-links');
  if (curvedLinksToggle) {
    curvedLinksToggle.addEventListener('change', () => {
      graphConfig.linkStyle.curvedLinks = curvedLinksToggle.checked;
      console.log("Change curvedLinks to:", graphConfig.linkStyle.curvedLinks);
      // Mettre à jour la visibilité des contrôles
      const curvatureControls = document.getElementById('curvature-controls');
      if (curvatureControls) {
        curvatureControls.style.display = graphConfig.linkStyle.curvedLinks ? 'block' : 'none';
      }
      renderer.updateGraph();
    });
    
    // S'assurer que la valeur initiale est correcte
    curvedLinksToggle.checked = graphConfig.linkStyle.curvedLinks;
  }
  
  // 11. Écouter les événements de changement de configuration
  window.addEventListener('graph-config-changed', (event) => {
    console.log('Configuration du graphe mise à jour manuellement:', event.detail);
    if (event.detail && event.detail.config) {
      updateGraphConfig(event.detail.config, renderer);
    } else {
      // Si aucune configuration n'est fournie, mettre à jour avec la configuration actuelle
      updateGraphConfig(graphConfig, renderer);
    }
  });
  
  // 12. Initialisation des boutons d'export/import de configuration
  setupConfigButtons(renderer);
  
  // 13. Affichage initial du graphe
  renderer.updateGraph();
  
  // 14. Exporter les objets clés dans window pour le débogage
  const isDebugMode = window.location.search.includes('debug=true');
  if (isDebugMode) {
    window.app = {
      graphState,
      renderer,
      interactionManager,
      uiManager,
      aiManager
    };
  }
  
  console.log('Graph-Creator a été initialisé avec succès');
});

/**
 * Configure les boutons d'export et d'import de configuration
 * @param {GraphRenderer} renderer - Le renderer du graphe
 */
function setupConfigButtons(renderer) {
  // Bouton d'export de configuration
  const exportConfigBtn = document.getElementById('export-config');
  if (exportConfigBtn) {
    exportConfigBtn.addEventListener('click', () => {
      const config = {
        linkStrength: graphConfig.forces.linkStrength,
        linkDistance: graphConfig.forces.linkDistance,
        chargeStrength: graphConfig.forces.chargeStrength,
        centerStrength: graphConfig.forces.centerStrength,
        curvedLinks: graphConfig.linkStyle.curvedLinks,
        baseCurvature: graphConfig.linkStyle.baseCurvature,
        loopCurvature: graphConfig.linkStyle.loopCurvature,
        curvatureStep: graphConfig.linkStyle.curvatureStep
      };
      
      const jsonStr = JSON.stringify(config, null, 2);
      const blob = new Blob([jsonStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = "config.json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }
  
  // Input d'import de configuration
  const importConfigInput = document.getElementById('import-config');
  if (importConfigInput) {
    importConfigInput.addEventListener('change', function() {
      const file = this.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const configData = JSON.parse(e.target.result);
            updateGraphConfig(configData, renderer);
          } catch (error) {
            console.error("Erreur lors de l'analyse du fichier de configuration:", error);
          }
        };
        reader.readAsText(file);
      }
    });
  }
}
