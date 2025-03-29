/**
 * Utilitaires partagés pour l'application
 */

/**
 * Initialise et configure une liste déroulante
 * @param {string|d3.Selection} selector - Sélecteur ou objet d3 pour la liste déroulante
 * @param {Array} options - Options à ajouter (array de valeurs ou d'objets {value, text})
 * @param {string|null} selectedValue - Valeur pré-sélectionnée (null pour aucune)
 * @param {Function|null} onChange - Fonction à appeler lors du changement
 * @param {boolean} includeEmptyOption - Inclure une option vide au début
 * @param {string} emptyOptionText - Texte pour l'option vide
 * @returns {d3.Selection} Sélection D3 de la liste déroulante
 */
export function initDropdown(selector, options, selectedValue = null, onChange = null, includeEmptyOption = true, emptyOptionText = '') {
  try {
    // Obtenir la sélection D3
    const select = typeof selector === 'string' ? d3.select(selector) : selector;
    
    if (!select || !select.node()) {
      console.error(`Élément introuvable pour le sélecteur: ${typeof selector === 'string' ? selector : 'objet d3'}`);
      return null;
    }
    
    // Supprimer les options existantes
    select.selectAll('option').remove();
    
    // Ajouter une option vide si demandé
    if (includeEmptyOption) {
      select.append('option')
        .attr('value', '')
        .text(emptyOptionText);
    }
    
    // Ajouter les options
    if (Array.isArray(options)) {
      options.forEach(opt => {
        const value = typeof opt === 'object' ? opt.value : opt;
        const text = typeof opt === 'object' ? opt.text : opt;
        
        select.append('option')
          .attr('value', value)
          .text(text);
      });
    } else {
      console.warn('Options non valides pour initDropdown:', options);
    }
    
    // Définir la valeur sélectionnée si fournie
    if (selectedValue !== null) {
      select.property('value', selectedValue);
    }
    
    // Ajouter le gestionnaire d'événement onChange si fourni
    if (onChange) {
      select.on('change', onChange);
    }
    
    return select;
  } catch (error) {
    console.error('Erreur dans initDropdown:', error);
    return null;
  }
}
