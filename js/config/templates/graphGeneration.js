/**
 * Templates pour les prompts de génération de graphes
 */

/**
 * Template pour générer un graphe à partir d'un prompt
 * @param {string} userPrompt - Prompt utilisateur
 * @returns {string} Prompt formaté pour l'IA
 */
export function getGraphGenerationPrompt(userPrompt) {
  return `
Pour la requête : "${userPrompt}", créer un graph network en JSON.
Le JSON doit contenir "nodes" et "links" avec les propriétés nécessaires.
Répondez uniquement avec un JSON valide sans texte additionnel.
Chaque node doit avoir: id, name, description, size, x, y.
Chaque link doit avoir: id, source (id d'un node), target (id d'un autre node), name, description.

Exemple :
{
  "nodes": [ 
    { "id": "1", "name": "Node1", "description": "Description1", "x": 100, "y": 300, "size": 30 },
    { "id": "2", "name": "Node2", "description": "Description2", "x": 200, "y": 200, "size": 30 }
  ],
  "links": [ 
    { "id": "1", "source": "1", "target": "2", "name": "Link1", "description": "Description1", "width": 2 }
  ]
}`;
}

/**
 * Template pour générer un graphe plus détaillé
 * @param {string} userPrompt - Prompt utilisateur
 * @param {Object} options - Options additionnelles
 * @returns {string} Prompt formaté pour l'IA
 */
export function getDetailedGraphPrompt(userPrompt, options = {}) {
  const { minNodes = 5, maxNodes = 15, theme = "", style = "" } = options;
  
  return `
Pour la requête : "${userPrompt}", créer un graph network JSON structuré et cohérent.
${theme ? `Le thème principal est : ${theme}.` : ""}
${style ? `Le style demandé est : ${style}.` : ""}

- Générez entre ${minNodes} et ${maxNodes} nodes.
- Établissez des liens logiques entre les nodes.
- Assurez-vous que le graphe soit connecté.

Votre réponse doit contenir uniquement un JSON valide avec cette structure:
{
  "nodes": [
    { 
      "id": "string unique",
      "name": "nom court", 
      "description": "description détaillée", 
      "x": nombre entre 0 et 1000, 
      "y": nombre entre 0 et 1000, 
      "size": nombre entre 15 et 50
    }
  ],
  "links": [
    {
      "id": "string unique",
      "source": "id d'un node existant", 
      "target": "id d'un autre node existant", 
      "name": "nom de la relation", 
      "description": "description de la relation",
      "width": nombre entre 1 et 5
    }
  ]
}`;
}
