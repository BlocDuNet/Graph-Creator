/**
 * Configuration de l'interface utilisateur
 */

export const uiConfig = {
  // Configuration du panneau inférieur
  bottomPanel: {
    defaultTab: "#tab1",
    collapsed: false
  },
  
  // Configuration des formulaires
  forms: {
    nodeLabelDefault: "name",
    linkLabelDefault: "",
    focusDelay: 100
  },
  
  // Champs exclus des formulaires
  excludedFields: {
    nodes: ["vx", "vy", "fx", "fy", "index"],
    links: ["index"]
  },
  
  // Configuration des modèles JSON
  jsonModels: {
    directoryPath: 'json/',
    defaultFile: 'default.json'
  }
};
