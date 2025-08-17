/**
 * Configuration pour l'interaction avec les API d'IA
 */

export const aiConfig = {
  // Configuration de l'API Ollama
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
    
    // États de chargement pour l'interface
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
