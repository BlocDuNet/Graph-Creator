/**
 * Configuration for interacting with AI APIs.
 */

export const aiConfig = {
  // Ollama API configuration.
  ollama: {
    api: {
      url: "http://localhost:11434/api/generate",
      modelsUrl: "http://localhost:11434/api/tags",
      defaultModel: "mistral",
      requestOptions: {
        format: "json",
        stream: true
      }
    },
    
    // UI loading states.
    ui: {
      loadingStates: {
        generation: {
          loading: "Génération en cours...",
          default: "Envoyer la requête"
        },
        proposals: {
          loading: "Génération en cours...",
          default: "Envoyer le graph actuel pour propositions"
        }
      },
      initDelay: 100
    }
  }
};
