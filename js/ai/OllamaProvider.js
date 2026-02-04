/**
 * Fournisseur pour l'API Ollama
 */
import { aiConfig } from '../config/index.js';

export class OllamaProvider {
  constructor() {
    this.config = aiConfig.ollama;
  }
  
  /**
   * Récupère les modèles disponibles sur Ollama
   */
  async fetchModels() {
    try {
      const response = await fetch(this.config.api.modelsUrl);
      
      if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Extraire les noms des modèles de la réponse
      if (data && Array.isArray(data.models)) {
        return data.models.map(model => model.name);
      } else {
        // Fallback à un tableau simple s'il y a une réponse différente
        const modelList = Array.isArray(data) ? data : [];
        return modelList.map(model => model.name || model.model || model);
      }
    } catch (error) {
      console.error("Error fetching Ollama models:", error);
      // Retourner un modèle par défaut en cas d'erreur
      return [this.config.api.defaultModel];
    }
  }
  
  /**
   * Lit un flux depuis la réponse d'Ollama
   */
  async readStream(reader, processChunk) {
    const decoder = new TextDecoder();
    let responseText = '';
    
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        responseText += chunk;
        
        if (processChunk) {
          processChunk(chunk, responseText);
        }
      }
      return responseText;
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error("Error reading stream:", error);
      }
      throw error;
    }
  }
  
  /**
   * Parse une réponse JSON avec mécanismes de fallback
   */
  parseJsonResponse(text) {
    try {
      return JSON.parse(text);
    } catch (err) {
      // Tenter d'extraire JSON du texte qui pourrait avoir d'autres parties
      const jsonMatch = text.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      throw new Error("Could not find valid JSON in the response");
    }
  }
  
  /**
   * Envoie une requête à l'API Ollama
   */
  async sendRequest(options) {
    const {
      prompt,
      model = this.config.api.defaultModel,
      abortController = new AbortController(),
      onChunk = null,
      onComplete = null,
      onError = null
    } = options;
    
    let responseText = '';
    
    try {
      const response = await fetch(this.config.api.url, {
        method: "POST",
        mode: "cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          model, 
          prompt,
          ...this.config.api.requestOptions
        }),
        signal: abortController.signal
      });
      
      if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status}`);
      }
      
      const reader = response.body.getReader();
      
      // Traiter chaque fragment du flux
      const processFragment = (chunk) => {
        chunk.split("\n").forEach(line => {
          if (line.trim()) {
            try {
              const parsed = JSON.parse(line);
              if (parsed.response) {
                responseText += parsed.response;
                if (onChunk) onChunk(parsed.response, responseText);
              }
            } catch (err) {
              console.error("Error parsing line:", err, line);
            }
          }
        });
      };
      
      await this.readStream(reader, processFragment);
      
      // Traiter la réponse complète
      if (onComplete) {
        try {
          const result = this.parseJsonResponse(responseText);
          onComplete(result, responseText);
        } catch (err) {
          console.error("Final parsing error:", err);
          console.log("Raw response:", responseText);
          if (onError) onError(new Error("Invalid JSON format in response: " + err.message));
        }
      }
      
      return { success: true, text: responseText };
      
    } catch (error) {
      console.error("Request error:", error);
      if (onError) {
        onError(error.name === 'AbortError' 
          ? new Error("Request canceled by user") 
          : error);
      }
      return { success: false, error };
    }
  }
}
