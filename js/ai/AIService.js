/**
 * Service central pour selectionner le fournisseur IA et les parametres
 */
import eventBus from '../services/EventBus.js';
import { aiConfig } from '../config/index.js';
import { OllamaProvider } from './OllamaProvider.js';

const providers = {
  ollama: new OllamaProvider()
};

const state = {
  provider: aiConfig?.ollama?.providerId || 'ollama',
  model: aiConfig?.ollama?.api?.defaultModel || 'mistral'
};

export function listProviders() {
  return Object.keys(providers);
}

export function getProviderId() {
  return state.provider;
}

export function getProvider() {
  return providers[state.provider] || providers.ollama;
}

export function getModel() {
  return state.model;
}

export function setProvider(providerId) {
  if (!providerId || !providers[providerId]) return;
  state.provider = providerId;
  eventBus.emit('ai-settings-changed', { ...state });
}

export function setModel(model) {
  if (!model) return;
  state.model = model;
  eventBus.emit('ai-settings-changed', { ...state });
}

export async function fetchModels() {
  const provider = getProvider();
  if (provider?.fetchModels) {
    try {
      return await provider.fetchModels();
    } catch (e) {
      return [state.model];
    }
  }
  return [state.model];
}

export function syncFromUI(providerSelect, modelSelect) {
  if (providerSelect?.value) setProvider(providerSelect.value);
  if (modelSelect?.value) setModel(modelSelect.value);
}

export function applyToUI(providerSelect, modelSelect) {
  if (providerSelect) providerSelect.value = state.provider;
  if (modelSelect) modelSelect.value = state.model;
}
