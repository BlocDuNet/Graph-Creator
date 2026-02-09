/**
 * Entry point that centralizes configuration.
 */
import { graphConfig } from './graph.js';
import { aiConfig } from './ai.js';
import { uiConfig } from './ui.js';
import * as graphGeneration from './templates/graphGeneration.js';
import * as proposals from './templates/proposals.js';
import * as expressions from './templates/expressions.js';

// Export configurations to simplify imports.
export {
  graphConfig,
  aiConfig,
  uiConfig,
  graphGeneration,
  proposals,
  expressions
};

// Export a unified structure for compatibility with existing code.
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
