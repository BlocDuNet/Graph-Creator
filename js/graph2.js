const graph = d3.select("#graph");
const width = 800;
const height = 600;
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
}

// Fonction pour gérer le mouvement des nœuds
function ticked() {
  node.attr("cx", d => d.x)
      .attr("cy", d => d.y);

  link.attr("x1", d => d.source.x)
    .attr("y1", d => d.source.y)
    .attr("x2", d => d.target.x)
    .attr("y2", d => d.target.y);
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

  simulation.nodes(nodesData);
  simulation.force("link").links(linksData);

  updateGraph();
  }
  
  // Exporter un graph JSON
  function exportGraph() {
  const jsonData = {
  nodes: nodesData,
  links: linksData
  };
  
  return JSON.stringify(jsonData);
  }
  
  // Gestion du menu de configuration
  forceFieldCheckbox.on("change", function () {
  if (this.checked) {
  simulation.force("charge", d3.forceManyBody());
  } else {
  simulation.force("charge", null);
  }
  simulation.alpha(0.3).restart();
  });
  
  // Exemple de données pour tester
  const exampleData = {
  nodes: [
  {id: 1, "node name": "Node 1", description: "This is node 1"},
  {id: 2, "node name": "Node 2", description: "This is node 2"},
  {id: 3, "node name": "Node 3", description: "This is node 3"}
  ],
  links: [
  {id: 1, source: 1, target: 2, "edge name": "Edge 1", description: "This is edge 1"},
  {id: 2, source: 2, target: 3, "edge name": "Edge 2", description: "This is edge 2"}
  ]
  };
  
  importGraph(exampleData);
