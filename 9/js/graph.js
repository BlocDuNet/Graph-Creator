    // Modifiez ces variables pour initialiser le graph avec vos données
    const initialNodes = [
        {id: '1', nom: 'Node 1', description: 'Description 1'},
        {id: '2', nom: 'Node 2', description: 'Description 2'},
        {id: '3', nom: 'Node 3', description: 'Description 3'},
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
    
    const nodeForm = d3.select('#node-form');
    const nodeInputs = {};
    
    const linkForm = d3.select('#link-form');
    const linkInputs = {};
    
    createFormInputs(initialNodes, nodeForm, nodeInputs);
    createFormInputs(initialLinks, linkForm, linkInputs);
    
    let selectedNode = null;
    let selectedLink = null;

    const simulation = d3.forceSimulation()
    .force('link', d3.forceLink().id(d => d.id).distance(100))
    .force('charge', d3.forceManyBody().strength(-10))
    .force('center', d3.forceCenter(width / 2, height / 2));

    let nodes = [...initialNodes];
    let links = [...initialLinks];

    function createFormInputs(data, formElement, inputObject) {
        // Supprime les anciens champs d'input et labels
        formElement.selectAll('input').remove();
        formElement.selectAll('label').remove();
        
        // Crée les nouveaux champs d'input et labels
        for (const key in data[0]) {
          const label = formElement.append('label')
            .attr('for', `${formElement.attr('id')}-${key}`)
            .text(`${key}: `);
      
          const input = formElement.append('input')
            .attr('type', 'text')
            .attr('id', `${formElement.attr('id')}-${key}`)
            .attr('name', key)
            .on('input', function() {
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
              }
            });
      
          inputObject[key] = input;
        }
      }
      

function updateGraph() {
  // Links
  const link = g.selectAll('.link')
    .data(links, d => `${d.source.id}-${d.target.id}`);

  link.enter().append('line')
    .attr('class', 'link')
    .attr('marker-end', 'url(#arrowhead)')
    .on('click', selectLink)
    .on('dblclick', event => event.stopPropagation()) // Pour que le double clic sur SVG ne propage pas son action sur les enfants de SVG (liens)
    .merge(link)
    .classed('selected', d => d === selectedLink);

  link.exit().remove();

  // Nodes
  const node = g.selectAll('.node')
    .data(nodes, d => d.id);

  node.enter().append('circle')
    .attr('class', 'node')
    .attr('r', 30)
    .call(drag(simulation))
    .on('click', selectNode)
    .on('dblclick', event => event.stopPropagation()) // Pour que le double clic sur SVG ne propage pas son action sur les enfant de SVG (noeuds)
    .merge(node)
    .classed('selected', d => d === selectedNode);

  node.exit().remove();

  simulation.nodes(nodes).on('tick', ticked);
  simulation.force('link').links(links);
  simulation.alpha(1).restart();

  function ticked() {
    link
      .attr('x1', d => d.source.x)
      .attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x)
      .attr('y2', d => d.target.y);

    node
      .attr('cx', d => d.x)
      .attr('cy', d => d.y);
  }
  updateGraph();
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
    event.subject.fx = event.subject.x;
    event.subject.fy = event.subject.y;
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
    // Crée un lien directionnel entre les deux nœuds
    const newLink = {
      id: Date.now().toString(),
      nom: "Lien",
      description: "",
      source: selectedNode.id,
      target: d.id,
      type: "sortant" // Le lien est par défaut sortant
    };
    // Vérifie si le lien existe déjà
    const existingLinkIndex = links.findIndex(l => l.source === newLink.source && l.target === newLink.target);
    if (existingLinkIndex >= 0) {
      // Si le lien existe déjà, change simplement sa direction
      links[existingLinkIndex].type = "bidirectionnel";
    } else {
      // Sinon, ajoute le nouveau lien
      links.push(newLink);
    }
    // Réinitialise les nœuds sélectionnés
    selectedNode = null;
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
    updateForm(linkInputs, d);
  }

  updateGraph();
}

function createNode(x, y) {
  const id = Date.now().toString();
  const newNode = {id, nom: `Node ${id}`, description: `Description ${id}`, x, y};
  nodes.push(newNode);
  updateGraph();
}


function createLink(source, target) {
  const id = Date.now().toString();
  const newLink = {id, nom: `Link ${id}`, description: `Description ${id}`, source: source.id, target: target.id};
  links.push(newLink);
  updateGraph();
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

// Exporter et importer JSON
d3.select('#export-json').on('click', function() {
  const filteredNodes = nodes.map(node => {
    const {fx, fy, ...rest} = node;
    return rest;
  });

  const filteredLinks = links.map(link => {
    return { source: link.source.id, target: link.target.id };
  });

  const json = JSON.stringify({nodes: filteredNodes, links: filteredLinks});
  const blob = new Blob([json], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'graph.json';
  a.click();
});


d3.select('#import-json').on('click', function() {
  d3.select('#json-file').node().click();
});

d3.select('#json-file').on('change', function() {
  const file = this.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = function(event) {
      const jsonData = JSON.parse(event.target.result);
      nodes = jsonData.nodes;
      links = jsonData.links.map(link => ({
        ...link,
        source: nodes.find(node => node.id === link.source),
        target: nodes.find(node => node.id === link.target)
      }));
      
      // Crée les champs d'input pour les nœuds et les liens importés
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

//Créer noeud en double cliquant dans la zone SVG
svg.on('dblclick', (event) => {
  createNode(event.clientX, event.clientY);
});



// Initialise le graph
updateGraph();
