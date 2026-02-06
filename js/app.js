/**
 * Point d'entrée principal de l'application Graph-Creator
 * Initialise tous les composants et coordonne leur interaction
 */
import { GraphState } from './state/GraphState.js';
import { GraphRenderer } from './graph/renderer.js';
import { InteractionManager } from './graph/interactions.js';
import { UIManager } from './ui/UIManager.js';
import { AIManager } from './ai/AIManager.js';
import { ConditionalFieldManager } from './expr/ConditionalFieldManager.js';
import { registerGraphState, registerUpdateCallback } from './state/undo_redo.js';
import { initLayoutManager } from './services/layoutManager.js';
import { initIOServices } from './services/io.js';
import { graphConfig, initConfigFilesList, updateGraphConfig } from './config/graph.js';
import { EventManager } from './services/EventManager.js';  // ← nouveau

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

  // 6bis. Gestionnaire des champs personnalises
  const conditionalFieldManager = new ConditionalFieldManager(graphState, renderer);
  
  // 7. Initialisation du gestionnaire d'IA
  const aiManager = new AIManager(graphState, renderer);
  
  // 8. Initialisation des services
  initIOServices(graphState, renderer);
  initLayoutManager(graphState, renderer);
  
  // 9. Initialisation de la liste des fichiers de configuration
  initConfigFilesList((configData) => {
    updateGraphConfig(configData, renderer);
  });
  
  // 11. Affichage initial du graphe
  renderer.updateGraph();
  
  // 12. Exporter les objets clés dans window pour le débogage
  const isDebugMode = window.location.search.includes('debug=true');
  if (isDebugMode) {
    window.app = {
      graphState,
      renderer,
      interactionManager,
      uiManager,
      aiManager,
      conditionalFieldManager
    };
  }
  
  console.log('Graph-Creator a été initialisé avec succès');
  
  // Initialiser le gestionnaire d'événements
  EventManager.init(graphState, renderer);
});
