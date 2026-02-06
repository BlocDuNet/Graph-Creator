/**
 * Point d'entrée centralisant les configurations
 */
import { graphConfig } from './graph.js';
import { aiConfig } from './ai.js';
import { uiConfig } from './ui.js';
import * as graphGeneration from './templates/graphGeneration.js';
import * as proposals from './templates/proposals.js';
import * as expressions from './templates/expressions.js';

// Exporter les configurations pour faciliter l'import
export {
  graphConfig,
  aiConfig,
  uiConfig,
  graphGeneration,
  proposals,
  expressions
};

// Exporter une structure unifiée pour la compatibilité avec le code existant
export default {
  graph: graphConfig,
  ai: aiConfig,
  ui: uiConfig,
  templates: {
    graphGeneration,
    proposals,
    expressions
  }
};
