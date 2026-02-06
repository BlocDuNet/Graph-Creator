/**
 * Templates pour l'assistance IA sur les expressions
 */

export function getExpressionAssistantPrompt(options = {}) {
  const {
    request = '',
    target = '',
    field = '',
    fields = [],
    desiredType = 'auto'
  } = options;
  const list = (fields || []).map(f => `"${f}"`).join(', ');

  return `
Tu es un assistant pour construire des expressions.
Tu dois repondre uniquement avec un JSON valide de la forme:
{"expression":"...","resultType":"text|number|number_comma|boolean|date","notes":"..."}

Rappels:
- Utilise les champs disponibles. Pour un nom non valide, utilise field("nom_du_champ").
- Fonctions: if, concat, add, sub, mul, div, contains, startsWith, endsWith, replace, regex, substring, dateDiff, formatNumber, gt, gte, lt, lte, eq, neq, and, or, not, len, upper, lower, trim, coalesce, round, min, max, toNumber, toText, toBool, field.

Contexte: ${target}.${field}
Type souhaite: ${desiredType}
Champs disponibles: ${list}
Demande utilisateur: ${request}

Ne renvoie rien d'autre que le JSON.
`;
}
