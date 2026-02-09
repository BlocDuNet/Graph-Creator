/**
 * Main entry point for the Graph-Creator application.
 * Initializes all components and coordinates their interaction.
 */
import { GraphState } from './state/GraphState.js';
import { GraphRenderer } from './graph/renderer.js';
import { InteractionManager } from './graph/interactions.js';
import { UIManager } from './ui/UIManager.js';
import { AIManager } from './ai/AIManager.js';
import { ConditionalFieldManager } from './expr/ConditionalFieldManager.js';
import { StyleRuleManager } from './style/StyleRuleManager.js';
import { registerGraphState, registerUpdateCallback } from './state/undo_redo.js';
import { initLayoutManager } from './services/layoutManager.js';
import { initIOServices } from './services/io.js';
import { graphConfig, initConfigFilesList, updateGraphConfig } from './config/graph.js';
import { EventManager } from './services/EventManager.js';  // new
import { initI18n } from './i18n.js';

// Wait for the DOM to be fully loaded before initializing the app.
document.addEventListener('DOMContentLoaded', async () => {
  console.log('Initializing Graph-Creator...');

  // 1. Initialize UI translations.
  await initI18n();

  // 2. Create the graph state.
  const graphState = new GraphState();
  
  // 3. Register the state for the undo/redo system.
  registerGraphState(graphState);
  
  // 4. Create the renderer to display the graph.
  const renderer = new GraphRenderer(graphState, d3.select('svg'));
  
  // 5. Register the graph update callback.
  registerUpdateCallback(() => renderer.updateGraph());
  
  // 6. Initialize the interaction manager.
  const interactionManager = new InteractionManager(graphState, renderer, d3.select('svg'));
  
  // 7. Initialize the UI manager.
  const uiManager = new UIManager(graphState, renderer);

  // 8. Custom fields manager.
  const conditionalFieldManager = new ConditionalFieldManager(graphState, renderer);

  // 9. Style rules / pie charts manager.
  const styleRuleManager = new StyleRuleManager(graphState, renderer);
  
  // 10. Initialize the AI manager.
  const aiManager = new AIManager(graphState, renderer);
  
  // 11. Initialize services.
  initIOServices(graphState, renderer);
  initLayoutManager(graphState, renderer);
  
  // 12. Initialize the list of config files.
  initConfigFilesList((configData) => {
    updateGraphConfig(configData, renderer);
  });
  
  // 13. Initial graph render.
  renderer.updateGraph();
  
  // 14. Expose key objects on window for debugging.
  const isDebugMode = window.location.search.includes('debug=true');
  if (isDebugMode) {
    window.app = {
      graphState,
      renderer,
      interactionManager,
      uiManager,
      aiManager,
      conditionalFieldManager,
      styleRuleManager
    };
  }
  
  console.log('Graph-Creator initialized successfully');
  
  // Initialize the event manager.
  EventManager.init(graphState, renderer);
});
