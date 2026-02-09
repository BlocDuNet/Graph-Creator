import eventBus from './EventBus.js';
import { graphConfig } from '../config/index.js';
import { getProviderId, getModel, setProvider, setModel } from '../ai/AIService.js';
import { sanitizeContextMenuConfig } from './ContextMenuConfigService.js';

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

function normalizeGroups(data) {
  if (!data) return { nodes: [], links: [] };
  if (Array.isArray(data)) return { nodes: data, links: [] };
  return {
    nodes: Array.isArray(data.nodes) ? data.nodes : [],
    links: Array.isArray(data.links) ? data.links : []
  };
}

function sanitizeGroups(data) {
  const normalized = normalizeGroups(data);
  const sanitize = (group, target) => ({
    id: String(group?.id || ''),
    name: String(group?.name || ''),
    enabled: group?.enabled !== false,
    target,
    priority: Number(group?.priority ?? 0),
    when: String(group?.when || ''),
    manualIds: Array.isArray(group?.manualIds) ? group.manualIds.map(v => String(v)) : []
  });
  return {
    nodes: (normalized.nodes || []).map(group => sanitize(group, 'node')),
    links: (normalized.links || []).map(group => sanitize(group, 'link'))
  };
}

export function buildAppConfig(options = {}) {
  const includeAi = options.includeAi !== false;
  const includeStyle = options.includeStyle !== false;
  const includePie = options.includePie !== false;
  const includeGroups = options.includeGroups !== false;
  const includeContextMenu = options.includeContextMenu !== false;

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
  if (includeGroups) {
    sections.groups = sanitizeGroups(graphConfig.groups);
  }
  if (includeContextMenu) {
    sections.contextMenu = sanitizeContextMenuConfig(graphConfig.contextMenu);
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

  if (sections.groups) {
    graphConfig.groups = normalizeGroups(sections.groups);
    eventBus.emit('group-rules-updated', { rules: graphConfig.groups });
  }

  if (sections.contextMenu) {
    graphConfig.contextMenu = sanitizeContextMenuConfig(sections.contextMenu);
    eventBus.emit('context-menu-config-updated', { config: graphConfig.contextMenu });
  }
}
