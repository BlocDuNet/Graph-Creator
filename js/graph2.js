const graph = d3.select("#graph");
const width = 200; // 200 pour test. 800
const height = 300; // 300 pour test. 600
const colors = d3.scaleOrdinal(d3.schemeCategory10);

const svg = graph.append("svg")
  .attr("width", width)
  .attr("height", height);

// Création du menu de configuration
const configMenu = d3.select("#config-menu");
const forceFieldCheckbox = configMenu.append("input")
  .attr("type", "checkbox")
  .attr("id", "forceField")
  .property("checked", true);
configMenu.append("label")
  .attr("for", "forceField")
  .text("Activer le champ de force");

// Définition des champs par défaut
const defaultNodeFields = ["id", "node name", "description"];
const defaultLinkFields = ["id", "edge name", "description"];

// Gestion des données
let nodesData = [];
let linksData = [];

// Force simulation
const simulation = d3.forceSimulation(nodesData)
  .force("link", d3.forceLink(linksData).id(d => d.id))
  .force("charge", d3.forceManyBody())
  .force("center", d3.forceCenter(width / 2, height / 2))
  .on("tick", ticked);

// Ajouter les liens et les nœuds
const link = svg.append("g")
  .attr("class", "links")
  .selectAll("line");

const node = svg.append("g")
  .attr("class", "nodes")
  .selectAll("circle");

// Fonction pour mettre à jour le graphique
function updateGraph() {
  const nodes = node.data(nodesData).join("circle")
    .attr("r", 5)
    .attr("fill", (d, i) => colors(i))
    .call(drag(simulation));

  const links = link.data(linksData).join("line")
    .attr("stroke", "#999")
    .attr("stroke-opacity", 0.6)
    .attr("stroke-width", d => Math.sqrt(d.value));
  
  simulation.on("tick", () => {
    nodes.attr("cx", d => d.x)
         .attr("cy", d => d.y);

    links.attr("x1", d => d.source.x)
         .attr("y1", d => d.source.y)
         .attr("x2", d => d.target.x)
         .attr("y2", d => d.target.y);
  });
  createLabels();
}

// Fonction pour gérer le mouvement des nœuds
function ticked() {
  node.attr("cx", d => d.x)
      .attr("cy", d => d.y);

  node.selectAll(".node-label")
      .attr("x", d => d.x)
      .attr("y", d => d.y);

  link.attr("x1", d => d.source.x)
      .attr("y1", d => d.source.y)
      .attr("x2", d => d.target.x)
      .attr("y2", d => d.target.y);

  link.selectAll(".link-label")
      .attr("x", d => (d.source.x + d.target.x) / 2)
      .attr("y", d => (d.source.y + d.target.y) / 2);
}


// Drag behavior
const drag = simulation => {
  function dragstarted(event, d) {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
  }

  function dragged(event, d) {
    d.fx = event.x;
    d.fy = event.y;
  }

  function dragended(event, d) {
    if (!event.active) simulation.alphaTarget(0);
    d.fx = null;
    d.fy = null;
  }

  return d3.drag()
    .on("start", dragstarted)
    .on("drag", dragged)
    .on("end", dragended);
}

// Importer un graph JSON
function importGraph(jsonData) {
  nodesData = jsonData.nodes;
  linksData = jsonData.links;
  

  // Créez un index des nœuds par ID pour faciliter la recherche
  const nodeById = new Map(nodesData.map(d => [d.id, d]));

  // Initialisez les positions x et y des nœuds
  nodesData.forEach(node => {
    node.x = Math.random() * width;
    node.y = Math.random() * height;
  });

  // Mettez à jour les liens pour utiliser les objets de nœuds
  linksData = linksData.filter(link => {
    link.source = nodeById.get(link.source);
    link.target = nodeById.get(link.target);

  // Filtrer les liens avec des nœuds source et cible valides
  return link.source !== undefined && link.target !== undefined;
});


  simulation.nodes(nodesData);
  simulation.force("link").links(linksData);

  updateGraph();

  // Redémarrez la simulation avec les nouvelles données et réinitialisez l'alpha
  simulation.alpha(1).restart();
}

  // Exporter un graph JSON
  function exportGraph() {
  const jsonData = {
  nodes: nodesData,
  links: linksData
  };
  
  return JSON.stringify(jsonData);
  }
  
  // Gestion du menu de configuration (je pense non)
  forceFieldCheckbox.on("change", function () {
  if (this.checked) {
  simulation.force("charge", d3.forceManyBody());
  } else {
  simulation.force("charge", null);
  }
  simulation.alpha(0.3).restart();
  });

  function createLabels() {
    // Création des labels pour les nœuds
    node.append("text")
      .attr("class", "node-label")
      .attr("dx", 10)
      .attr("dy", ".35em")
      .text(d => d.id);
  
    // Création des labels pour les liens
    link.append("text")
      .attr("class", "link-label")
      .attr("dy", ".35em")
      .attr("text-anchor", "middle")
      .text(d => d.id);
  }

  
// ####################### IMPORT #######################
// Importer un graph JSON à partir d'un fichier

/*
function importGraphFromFile(file) {
  const reader = new FileReader();
  reader.onload = function(event) {
    const jsonData = JSON.parse(event.target.result);
    importGraph(jsonData);
  };
  reader.readAsText(file);
}

// Exporter un graph JSON dans un fichier
function exportGraphToFile() {
  const jsonData = exportGraph();
  const blob = new Blob([jsonData], {type: "application/json;charset=utf-8"});
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "graph.json";
  link.click();
  URL.revokeObjectURL(url);
}

// Liez les boutons d'importation et d'exportation aux fonctions
const importButton = d3.select("#importButton");
const importFile = d3.select("#importFile");
const exportButton = d3.select("#exportButton");

importButton.on("click", () => importFile.node().click());
importFile.on("change", () => importGraphFromFile(importFile.node().files[0]));
exportButton.on("click", exportGraphToFile);

*/
// ####################### IMPORT - END #######################

  // Exemple de données pour tester
  const exampleData = {
  nodes: [
  {id: 1, "node name": "Node 1", description: "This is node 1"},
  {id: 2, "node name": "Node 2", description: "This is node 2"},
  {id: 3, "node name": "Node 3", description: "This is node 3"}
  ],
  links: [
  {id: 1, source: 1, target: 2, "edge name": "Edge 1", description: "This is edge 1"},
 
  ]
  };
  
  importGraph(exampleData);
