/**
 * User interface configuration.
 */

export const uiConfig = {
  // Bottom panel configuration.
  bottomPanel: {
    defaultTab: "#tab1",
    collapsed: false
  },
  
  // Form configuration.
  forms: {
    nodeLabelDefault: "name",
    linkLabelDefault: "",
    focusDelay: 100
  },
  
  // Fields excluded from forms.
  excludedFields: {
    nodes: ["vx", "vy", "fx", "fy", "index"],
    links: ["index"]
  },
  
  // JSON model configuration.
  jsonModels: {
    directoryPath: 'json/',
    defaultFile: 'default.json'
  }
};
