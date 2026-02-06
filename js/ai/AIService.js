/**
 * Service central pour selectionner le fournisseur IA et les parametres
 */
import eventBus from '../services/EventBus.js';
import { aiConfig } from '../config/index.js';
import { OllamaProvider } from './OllamaProvider.js';

const STORAGE_KEY = 'graphCreator.aiSettings';

const providers = {
  ollama: new OllamaProvider()
};

const defaultState = {
  provider: aiConfig?.ollama?.providerId || 'ollama',
  model: aiConfig?.ollama?.api?.defaultModel || 'mistral'
};

const state = { ...defaultState, ...loadStoredState() };
const bindings = new Set();

function loadStoredState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return {
      provider: parsed?.provider || undefined,
      model: parsed?.model || undefined
    };
  } catch (e) {
    return {};
  }
}

function persistState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      provider: state.provider,
      model: state.model
    }));
  } catch (e) {
    // ignore storage failures
  }
}

function appendLog(text) {
  try {
    const area = document.getElementById('ai-log');
    if (!area) return;
    const next = `${area.value}${area.value ? '\n' : ''}${text}`;
    area.value = next;
    area.scrollTop = area.scrollHeight;
  } catch (e) {
    // no-op
  }
}

function formatTimestamp() {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

function updateModelSelect(modelSelect, models = []) {
  if (!modelSelect) return;
  const isSelect = modelSelect.tagName === 'SELECT';
  if (!isSelect) {
    modelSelect.value = state.model;
    return;
  }

  const list = Array.isArray(models) && models.length ? models.slice() : [];
  if (state.model && !list.includes(state.model)) list.unshift(state.model);
  if (!list.length) list.push(state.model);

  modelSelect.innerHTML = list
    .map(m => `<option value="${m}">${m}</option>`)
    .join('');
  modelSelect.value = state.model || list[0] || '';
}

function updateProviderSelect(providerSelect) {
  if (!providerSelect) return;
  const list = listProviders();
  providerSelect.innerHTML = list
    .map(p => `<option value="${p}">${p}</option>`)
    .join('');
  providerSelect.value = state.provider;
}

async function refreshModelsForBindings() {
  const models = await fetchModels();
  bindings.forEach(binding => {
    updateModelSelect(binding.modelSelect, models);
  });
}

function syncBindings() {
  bindings.forEach(binding => {
    updateProviderSelect(binding.providerSelect);
    updateModelSelect(binding.modelSelect, [state.model]);
  });
}

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
  persistState();
  eventBus.emit('ai-settings-changed', { ...state });
  refreshModelsForBindings();
}

export function setModel(model) {
  if (!model) return;
  state.model = model;
  persistState();
  eventBus.emit('ai-settings-changed', { ...state });
  syncBindings();
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

export function registerSettingsControls(providerSelect, modelSelect) {
  if (!providerSelect && !modelSelect) return;
  const binding = { providerSelect, modelSelect };
  if (!bindings.has(binding)) bindings.add(binding);

  if (providerSelect && !providerSelect.dataset.aiBound) {
    providerSelect.dataset.aiBound = 'true';
    providerSelect.addEventListener('change', () => {
      setProvider(providerSelect.value);
    });
  }

  if (modelSelect && !modelSelect.dataset.aiBound) {
    modelSelect.dataset.aiBound = 'true';
    modelSelect.addEventListener('change', () => {
      setModel(modelSelect.value || modelSelect.textContent || '');
    });
    modelSelect.addEventListener('input', () => {
      setModel(modelSelect.value || '');
    });
  }

  updateProviderSelect(providerSelect);
  updateModelSelect(modelSelect, [state.model]);
  refreshModelsForBindings();
}

export function syncFromUI(providerSelect, modelSelect) {
  if (providerSelect?.value) setProvider(providerSelect.value);
  if (modelSelect?.value) setModel(modelSelect.value);
}

export function applyToUI(providerSelect, modelSelect) {
  updateProviderSelect(providerSelect);
  updateModelSelect(modelSelect, [state.model]);
}

export function sendAiRequest(options) {
  const providerId = getProviderId();
  const model = options?.model || state.model;
  const context = options?.context || 'IA';
  const prompt = options?.prompt || '';
  const started = formatTimestamp();
  appendLog(`[${started}] [${context}] provider=${providerId} model=${model}\nPROMPT:\n${prompt}\n---`);

  return getProvider().sendRequest({
    ...options,
    model,
    onComplete: (result, rawText) => {
      const finished = formatTimestamp();
      const payload = rawText || (typeof result === 'string' ? result : JSON.stringify(result, null, 2));
      appendLog(`[${finished}] [${context}] RESPONSE:\n${payload}\n===`);
      options?.onComplete?.(result, rawText);
    },
    onError: (error) => {
      const finished = formatTimestamp();
      appendLog(`[${finished}] [${context}] ERROR: ${error.message}\n===`);
      options?.onError?.(error);
    }
  });
}
