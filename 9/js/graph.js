// Import de config_graph.js
import { getForceConfiguration } from './config_graph.js';

const forceConfig = getForceConfiguration();

const simulation = d3.forceSimulation()
    .force('link', forceConfig.link)
    .force('charge', forceConfig.charge)
    .force('center', forceConfig.center);

// Import de config_graph.js END

// Modifiez ces variables pour initialiser le graph avec vos données
const initialNodes = [
    {id: '1', nom: 'Node 1', description: 'Description 1', "x": 100, "y": 100},
    {id: '2', nom: 'Node 2', description: 'Description 2', "x": 200, "y": 200},
    {id: '3', nom: 'Node 3', description: 'Description 3', "x": 300, "y": 300},
];

const initialLinks = [
    {id: '1', nom: 'Link 1', description: 'Description 1', source: '1', target: '2'},
    {id: '2', nom: 'Link 2', description: 'Description 2', source: '2', target: '3'},
];

// Code principal
const svg = d3.select('svg');
const width = +svg.attr('width');
const height = +svg.attr('height');
const g = svg.append('g'); //Ajout pour déplacer graph

// Importé depuis config_graph.js
//const simulation = d3.forceSimulation()
//    .force('link', d3.forceLink().id(d => d.id).distance(200).strength(0));

//.force('charge', d3.forceManyBody().strength(-50))
//.force('center', d3.forceCenter(width / 2, height / 2));

const nodeForm = d3.select('#node-form');
const nodeInputs = {};

const linkForm = d3.select('#link-form');
const linkInputs = {};

createFormInputs(initialNodes, nodeForm, nodeInputs);
createFormInputs(initialLinks, linkForm, linkInputs);

let selectedNode = null;
let selectedLink = null;

let nodes = [...initialNodes];
let links = [...initialLinks];

//Pour incrémenter id des noeuds et liens
let nextNodeId = initialNodes.length + 1;
let nextLinkId = initialLinks.length + 1;


function createField(fieldName, formElement, inputObject, data, isDeleteButtonNeeded = false) {
  const fieldDiv = formElement.append('div');

  const label = fieldDiv.append('label')
    .attr('for', `${formElement.attr('id')}-${fieldName}`)
    .text(`${fieldName}: `);

    const input = fieldDiv.append('input')
    .attr('type', 'text')
    .attr('id', `${formElement.attr('id')}-${fieldName}`)
    .attr('name', fieldName)
    .on('input', function() {
      if (fieldName === 'source' || fieldName === 'target') {
        const selected = fieldName === 'source' ? selectedLink.source : selectedLink.target;
        const nodeId = this.value;
        const node = nodes.find(node => node.id === nodeId);
        if (node) {
          selected[fieldName] = node;
        }
      } else {
        if (selectedLink) {
          selectedLink[fieldName] = this.value;
        }
        if (selectedNode) {
          selectedNode[fieldName] = this.value;
        }
      }
    });
    

  if (isDeleteButtonNeeded) {
    const deleteButton = fieldDiv.append('button')
      .text('x')
      .on('click', function() {
        data.forEach(item => delete item[fieldName]);
        fieldDiv.remove();
        delete inputObject[fieldName];
      });

    inputObject[fieldName] = { input: input, deleteButton: deleteButton };
  } else {
    inputObject[fieldName] = input;
  }

  fieldDiv.append('br');
  
}

function createFormInputs(data, formElement, inputObject) {
  formElement.selectAll('input').remove();
  formElement.selectAll('label').remove();

  for (const key in data[0]) {
    createField(key, formElement, inputObject, data);
  }
}

function addField(fieldName, formElement, inputObject, data) {
  if (fieldName.trim() === '') {
    return;
  }

  const isFieldNameExist = Object.keys(inputObject).includes(fieldName);
  if (isFieldNameExist) {
    return;
  }

  // Ajoutez le nouveau champ à tous les objets existants
  data.forEach(item => item[fieldName] = '');

  createField(fieldName, formElement, inputObject, data, true);
}


  d3.select("#addNodeFieldButton").on("click", function() {
    const fieldName = document.getElementById("addNodeFieldInput").value;
    addField(fieldName, nodeForm, nodeInputs, nodes);
  });
  
  d3.select("#addLinkFieldButton").on("click", function() {
    const fieldName = document.getElementById("addLinkFieldInput").value;
    addField(fieldName, linkForm, linkInputs, links);
  });
  

  function updateGraph() {
    // Links
    const link = g.selectAll('.link')
        .data(links, d => `${d.source.id}-${d.target.id}`);

    link.enter().append('line')
        .attr('class', 'link')
        .attr('marker-end', 'url(#arrowhead)')
        .on('click', selectLink)
        .on('dblclick', event => event.stopPropagation()) // Pour empêcher la propagation du double clic sur le lien vers le SVG parent
        .merge(link)
        .classed('selected', d => d === selectedLink);

    link.exit().remove();

    // Link labels
    const linkLabel = g.selectAll('.link-label')
      .data(links, d => `${d.source.id}-${d.target.id}`);

    linkLabel.enter().append('text')
      .attr('class', 'link-label')
      .attr('dx', 10) 
      .text(d => d.nom)
      .on('click', selectLink);  // Ajout de l'événement click pour le texte du lien

    linkLabel.merge(link)
      .classed('selected', d => d === selectedLink);

    linkLabel.exit().remove();
        linkLabel.text(d => d.nom);
  
    // Nodes
    const node = g.selectAll('.node')
        .data(nodes, d => d.id);
  
    // On utilise un groupe pour chaque noeud afin de pouvoir y ajouter à la fois un cercle et du texte
    const nodeLabel = node.enter().append('g')
        .attr('class', 'node')
        .attr('transform', d => `translate(${d.x}, ${d.y})`) // Initialise le groupe entier (cercle et texte) à la position désirée
        .call(drag(simulation))
        .on('click', selectNode)
        .on('dblclick', event => event.stopPropagation()); // Pour empêcher la propagation du double clic sur le noeud vers le SVG parent
  
    nodeLabel.append('circle')
        .attr('r', 30);
  
    nodeLabel.append('text')
        .attr('dx', 35)   // déplace le texte de 35 pixels à droite du centre du noeud
        .text(d => d.nom);  // utilise le champ 'nom' de chaque noeud comme texte
  
    nodeLabel.merge(node)
        .classed('selected', d => d === selectedNode);
  
    node.exit().remove();
  
    simulation.nodes(nodes).on('tick', ticked);
    simulation.force('link').links(links);
    simulation.alpha(1).restart();
  
    function ticked() {
        link
            .attr('x1', d => {
                const dx = d.target.x - d.source.x;
                const dy = d.target.y - d.source.y;
                const angle = Math.atan2(dy, dx);
                const radius = d.source.r || 30;  // Assume a default radius of 30 if none is defined
                return d.source.x + Math.cos(angle) * radius;
            })
            .attr('y1', d => {
                const dx = d.target.x - d.source.x;
                const dy = d.target.y - d.source.y;
                const angle = Math.atan2(dy, dx);
                const radius = d.source.r || 30;  // Assume a default radius of 30 if none is defined
                return d.source.y + Math.sin(angle) * radius;
            })
            .attr('x2', d => {
                const dx = d.target.x - d.source.x;
                const dy = d.target.y - d.source.y;
                const angle = Math.atan2(dy, dx);
                const radius = d.target.r || 40;  // Assume a default radius of 30 if none is defined
                return d.target.x - Math.cos(angle) * radius;
            })
            .attr('y2', d => {
              const dx = d.target.x - d.source.x;
              const dy = d.target.y - d.source.y;
              const angle = Math.atan2(dy, dx);
              const radius = d.target.r || 40;  // Suppose un rayon par défaut de 40 si aucun n'est défini
              return d.target.y - Math.sin(angle) * radius;
          });

      node
          .attr('transform', d => `translate(${d.x}, ${d.y})`); // Déplace le groupe entier (cercle et texte) en utilisant les coordonnées x et y du noeud
      
      linkLabel
        .attr('x', d => (d.source.x + d.target.x) / 2)
        .attr('y', d => (d.source.y + d.target.y) / 2);

      updateGraph();  
      }
}

  

// Fonction de zoom et de déplacement
function zoomed(event) {
  if (event.sourceEvent.button === 2) { // Vérifie si le bouton droit de la souris est enfoncé
    g.attr('transform', `translate(${event.transform.x},${event.transform.y})`);
  } else {
    g.attr('transform', `translate(${event.transform.x},${event.transform.y}) scale(${event.transform.k})`);
  }
}

svg.call(d3.zoom()
  .extent([[0, 0], [width, height]])
  .scaleExtent([0.5, 3])
  .filter(event => event.button === 2 || event.type === "wheel") //// Permet de déplacer seulement avec le bouton droit de la souris et de zoomer avec la molette
  .on('zoom', zoomed));

svg.on('dblclick.zoom', null); // Désactive le zoom lors d'un double-clic
svg.on('contextmenu', event => event.preventDefault()); // Empêche l'affichage du menu contextuel lors du clic droit


// Drag nodes
function drag(simulation) {
  function dragStarted(event) {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    event.subject.x = event.subject.x;
    event.subject.y = event.subject.y;
  }

  function dragged(event) {
    event.subject.fx = event.x;
    event.subject.fy = event.y;
  }

  function dragEnded(event) {
    if (!event.active) simulation.alphaTarget(0);
    event.subject.fx = null;
    event.subject.fy = null;
  }

  return d3.drag()
    .on('start', dragStarted)
    .on('drag', dragged)
    .on('end', dragEnded);
}

function selectNode(event, d) {
  if (event.ctrlKey && selectedNode) {
    // Crée un lien directionnel entre les deux nœuds en utilisant la fonction createLink
    const newLink = createLink(selectedNode, d);
    // Vérifie si le lien existe déjà
    const existingLinkIndex = links.findIndex(l => l.source === newLink.source && l.target === newLink.target);
    if (existingLinkIndex >= 0) {
      // Si le lien existe déjà, change simplement sa direction
      links[existingLinkIndex].type = "bidirectionnel";
    } else {
      // Ajoute le nouveau lien à la liste des liens
      links.push(newLink);
    }

    // Ne réinitialisez pas le nœud sélectionné
    // selectedNode = null;
    selectedLink = null;
    nodeForm.classed('hidden', true);
    linkForm.classed('hidden', true);
    updateGraph();
    return;
  }

  // Met à jour les nœuds sélectionnés
  if (selectedNode === d) {
    nodeForm.classed('hidden', true);
    selectedNode = null;
  } else {
    selectedNode = d;
    selectedLink = null;
    linkForm.classed('hidden', true);
    nodeForm.classed('hidden', false);
    document.getElementById("node-form-nom").focus();  // Focus on "nom" input
    updateForm(nodeInputs, d);
  }
  updateGraph();
}


function selectLink(event, d) {
  if (selectedLink === d) {
    linkForm.classed('hidden', true);
    selectedLink = null;
  } else {
    selectedLink = d;
    selectedNode = null;
    nodeForm.classed('hidden', true);
    linkForm.classed('hidden', false);
    document.getElementById("link-form-nom").focus();  // Focus on "nom" input
    updateForm(linkInputs, d);
  }

  updateGraph();
}

function createNode(x, y) {
  const id = nextNodeId.toString();
  nextNodeId++;
  const newNode = {id, nom: ``, description: ``, x, y};
  //const newNode = {id, nom: `Node ${id}`, description: `Description ${id}`, x, y};
  nodes.push(newNode);
  updateGraph();
  return newNode;  // Retourne le nouveau noeud
}

function createLink(source, target) {
  const id = nextLinkId.toString();
  nextLinkId++;
  const newLink = {id, nom: `Link ${id}`, description: `Description ${id}`, source: source.id, target: target.id};
  links.push(newLink);
  updateGraph();
  return newLink;  // Retourne le nouveau lien
}


function updateForm(inputs, data) {
  for (const key in inputs) {
    let value = data[key];
    if (key === 'source' || key === 'target') {
      value = value.id;
    }
    inputs[key].property('value', value || '');
    inputs[key].on('input', function () {
      if (key === 'source' || key === 'target') {
        const selected = key === 'source' ? selectedLink.source : selectedLink.target;
        const nodeId = this.value;
        const node = nodes.find(node => node.id === nodeId);
        if (node) {
          selected[key] = node;
        }
      } else {
        if (selectedLink) {
          selectedLink[key] = this.value;
        }
        if (selectedNode) {
          selectedNode[key] = this.value;
        }
      }
      updateGraph();
    });
  }
}

// Supprime noeud et lien sélectionné lors de l'appuis sur la touche "Delete" ou "Backspace"
window.addEventListener('keyup', function(event) {
  if (['Delete', 'Backspace'].includes(event.key)) {
    if (selectedNode) {
      nodes = nodes.filter(node => node !== selectedNode);
      links = links.filter(link => link.source !== selectedNode && link.target !== selectedNode);
      selectedNode = null;
      nodeForm.classed('hidden', true);
    }
    if (selectedLink) {
      links = links.filter(link => link !== selectedLink);
      selectedLink = null;
      linkForm.classed('hidden', true);
    }
    updateGraph();
  }
});

// Listener pour les changements dans les champs du formulaire
for (const key in nodeInputs) {
    nodeInputs[key].on('input', function () {
      if (selectedNode) {
        selectedNode[key] = this.value;
      }
    });
  }
  
  for (const key in linkInputs) {
    linkInputs[key].on('input', function () {
      if (selectedLink) {
        selectedLink[key] = this.value;
      }
    });
  }

// Exporter JSON
d3.select('#export-json').on('click', function() {
  const filteredNodes = nodes.map(node => {
    const {vx, vy, fx, fy, index, ...rest} = node;
    return rest;
  });

  const filteredLinks = links.map(link => {
    const { id, source, target, ...rest } = link;
    return { id, source: source.id, target: target.id, ...rest };
  });

  const json = JSON.stringify({nodes: filteredNodes, links: filteredLinks}, null, 2); // Utilisation du paramètre null et 2 pour l'indentation
  const blob = new Blob([json], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'graph.json';
  a.click();
});

// Importer JSON
d3.select('#import-json').on('click', function() {
  d3.select('#json-file').node().click();
});

d3.select('#json-file').on('change', function() {
  const file = this.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = function(event) {
      const jsonData = JSON.parse(event.target.result);

      // Obtenir les clés de l'objet JSON
      const keys = Object.keys(jsonData);

      // Utiliser la première clé pour les noeuds et la deuxième pour les liens. Permet de nommer les choses différemment.
      const nodeKey = keys[0];
      const linkKey = keys[1];

      // Utiliser les clés pour charger les noeuds et les liens
      nodes = jsonData[nodeKey];
      links = jsonData[linkKey].map(link => ({
        ...link,
        source: nodes.find(node => node.id === link.source),
        target: nodes.find(node => node.id === link.target)
      }));

      // Crée les champs d'input pour les noeuds et les liens importés
      createFormInputs(nodes, nodeForm, nodeInputs);
      createFormInputs(links, linkForm, linkInputs);

      updateGraph();
    };
    reader.readAsText(file);
  }
});

//pour debug, update graph
d3.select('#update').on('click', function() {
  updateGraph();
});


//Créer noeud en double cliquant dans la zone SVG en adaptant les coordonnées au zoom
svg.on('dblclick', (event) => {
    const transform = d3.zoomTransform(svg.node());
    const point = transform.invert([event.clientX, event.clientY]);
    createNode(point[0], point[1]);
});

// Créez un nouveau nœud et un lien lors d'un ctrl + clic sur le SVG
svg.on('mousedown', (event) => {
  if (event.ctrlKey && selectedNode) {
      // Obtenez les coordonnées du point de clic adapté au zoom
      const transform = d3.zoomTransform(svg.node());
      const point = transform.invert(d3.pointer(event));
      nodeRadius = 30; // Code temporaire. Node radius définis par défault à valeur fixe 30, en attendant d'avoir un code pour récupérer le rayon réel du noeud.
      const existingNode = nodes.find(node => Math.hypot(point[0] - node.x, point[1] - node.y) < nodeRadius);
       // Si un nœud existant est présent, créez seulement un lien
      if (existingNode) {
          createLink(selectedNode, existingNode);
      } else {
          // Si aucun nœud existant n'est présent, créez un nouveau nœud et un lien
          const newNode = createNode(point[0], point[1]);
          createLink(selectedNode, newNode);
          // Si ctrl + shift + clic est pressé, sélectionnez automatiquement le nouveau nœud créé
          if (event.shiftKey) {
              selectedNode = newNode;
          }
      }
  }
});

// Désélectionne le nœud et le lien sélectionné lors de l'appui sur la touche "Échap"
window.addEventListener('keyup', function(event) {
  if (event.key === 'Escape') {
    if (selectedNode) {
      selectedNode = null;
      nodeForm.classed('hidden', true);
    }
    if (selectedLink) {
      selectedLink = null;
      linkForm.classed('hidden', true);
    }
    updateGraph();
  }
});

// Initialise le graph
updateGraph();
