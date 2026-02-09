/**
 * Templates for prompts proposing graph additions.
 */

/**
 * Generates a prompt to get proposals for graph additions.
 * Current graph state.
 * Prompt formatted for the AI.
 */
export function getProposalPrompt(currentGraph) {
  // Prepare a clean JSON version of current data.
  const currentGraphJSON = JSON.stringify({
    nodes: currentGraph.nodes.map(node => {
      const { vx, vy, fx, fy, index, ...rest } = node;
      return rest;
    }),
    links: currentGraph.links.map(link => ({
      id: link.id,
      source: link.source.id,
      target: link.target.id,
      name: link.name || "",
      description: link.description || ""
    }))
  }, null, 2);
  
  return `
Voici le graph network actuel en JSON :
${currentGraphJSON}

Propose uniquement des ajouts au graph sous forme de nouveaux nodes et links au format JSON.
Assure-toi que les nouveaux nodes ont des ids uniques et que les liens référencent des ids valides.
Ton format de réponse DOIT être un objet JSON valide avec les propriétés "nodes" et "links" qui sont des tableaux.
Ne retourne AUCUN texte explicatif avant ou après le JSON.`;
}

/**
 * Generates a prompt to get more contextual addition proposals.
 * Current graph state.
 * Additional options.
 * Prompt formatted for the AI.
 */
export function getContextualProposalPrompt(currentGraph, options = {}) {
  const { focus = "", maxProposals = 5, objective = "" } = options;
  
  // Filter graph data for JSON serialization.
  const filteredGraph = {
    nodes: currentGraph.nodes.map(node => {
      const { vx, vy, fx, fy, index, ...rest } = node;
      return rest;
    }),
    links: currentGraph.links.map(link => ({
      id: link.id,
      source: link.source.id,
      target: link.target.id,
      name: link.name || "",
      description: link.description || ""
    }))
  };
  
  return `
Analyse ce graph network:
${JSON.stringify(filteredGraph, null, 2)}

${focus ? `Concentre-toi sur l'aspect: ${focus}.` : ""}
${objective ? `Objectif du graphe: ${objective}.` : ""}

Propose maximum ${maxProposals} ajouts pertinents (nodes et/ou links).
Pour chaque proposition:
- Les nodes doivent avoir des ids uniques
- Les links doivent référencer des ids valides
- Assure la cohérence sémantique avec le graphe actuel

Format de réponse (JSON uniquement):
{
  "nodes": [
    { "id": "...", "name": "...", "description": "...", "x": 0, "y": 0, "size": 30 }
  ],
  "links": [
    { "id": "...", "source": "...", "target": "...", "name": "...", "description": "..." }
  ]
}`;
}
