export function getForceConfiguration() {
  return { // Tout en .strength(0) pour désactiver, à activer  avec bouton en remplaçant par .strength(1)
      link: d3.forceLink().id(d => d.id).distance(200).strength(0),
      charge: d3.forceManyBody().strength(-5).strength(0),
      center: d3.forceCenter(width / 2, height / 2).strength(0)
  };
}

// Manuel pur debug "center", à récupérer proprement depuis SVG, ce n'est pas exporté pour le moment non plus!
export const width = 100
export const height = 100


