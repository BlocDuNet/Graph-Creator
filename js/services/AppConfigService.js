import eventBus from './EventBus.js';
import { graphConfig } from '../config/index.js';
import { getProviderId, getModel, setProvider, setModel } from '../ai/AIService.js';

const CONFIG_TYPE = 'graph-creator-config';
const CONFIG_VERSION = 1;

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

export function buildAppConfig(options = {}) {
  const includeAi = options.includeAi !== false;
  const includeStyle = options.includeStyle !== false;
  const includePie = options.includePie !== false;

  const sections = {};
  if (includeAi) {
    sections.ai = {
      provider: getProviderId(),
      model: getModel()
    };
  }
  if (includeStyle) {
    sections.styleRules = graphConfig.styleRules;
  }
  if (includePie) {
    sections.pieRules = graphConfig.pieRules;
  }

  return {
    type: CONFIG_TYPE,
    version: CONFIG_VERSION,
    sections
  };
}

export function applyAppConfig(config = {}) {
  const sections = config.sections || config.data || config;
  if (!sections || typeof sections !== 'object') return;

  if (sections.ai) {
    if (sections.ai.provider) setProvider(sections.ai.provider);
    if (sections.ai.model) setModel(sections.ai.model);
  }

  if (sections.styleRules) {
    graphConfig.styleRules = normalizeStyleRules(sections.styleRules);
    eventBus.emit('style-rules-updated', { rules: graphConfig.styleRules });
  }

  if (sections.pieRules) {
    graphConfig.pieRules = normalizePieRules(sections.pieRules);
    eventBus.emit('pie-rules-updated', { rules: graphConfig.pieRules });
  }
}
