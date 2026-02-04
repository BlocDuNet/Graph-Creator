/**
 * Gère le rendu du graphe avec D3
 */
import { graphConfig } from '../config/index.js';
import eventBus from '../services/EventBus.js';

export class GraphRenderer {
  constructor(graphState, svgSelection) {
    this.graphState = graphState;
    this.svg = svgSelection;
    this.width = +this.svg.attr('width');
    this.height = +this.svg.attr('height');
    
    // Création du groupe principal pour le graphe
    this.g = this.svg.append('g');
    
    // Configuration de la simulation de forces
    this.simulation = this.createForceSimulation();
    
    // Création des définitions de marqueurs (flèches)
    this.createArrowDefinitions();
    
    // Mémorisation de la dernière configuration de marqueurs
    this._lastMarkerConfig = null;
    
    console.log("Renderer initialized with graph config:", graphConfig);
  }
  
  /**
   * Crée la simulation de forces D3
   */
  createForceSimulation() {
    const idField = this.graphState.globalSettings.nodeIdField;
    const { linkStrength, linkDistance, chargeStrength, centerStrength } = graphConfig.forces;
    
    console.log(`Creating force simulation with: linkStrength=${linkStrength}, linkDistance=${linkDistance}, chargeStrength=${chargeStrength}, centerStrength=${centerStrength}`);
    
    const forceLink = d3.forceLink()
      .id(d => d[idField] ?? d.id)     // ← use custom id field
      .distance(linkDistance)
      .strength(linkStrength);
      
    const forceCharge = d3.forceManyBody()
      .strength(chargeStrength);
      
    const forceCenter = d3.forceCenter(this.width / 2, this.height / 2)
      .strength(centerStrength);
    
    // Réduire alpha et decay pour une simulation plus stable
    return d3.forceSimulation()
      .force('link', forceLink)
      .force('charge', forceCharge)
      .force('center', forceCenter)
      .alphaDecay(0.05) // Plus grande valeur = stabilisation plus rapide
      .alpha(0.1);      // Valeur plus faible = moins de mouvement initial
  }
  
  /**
   * Met à jour les forces de la simulation
   */
  updateForces() {
    const { linkStrength, linkDistance, chargeStrength, centerStrength } = graphConfig.forces;
    
    console.log(`Updating forces: linkStrength=${linkStrength}, linkDistance=${linkDistance}, chargeStrength=${chargeStrength}, centerStrength=${centerStrength}`);
    
    this.simulation.force('link')
      .strength(linkStrength)
      .distance(linkDistance);
      
    this.simulation.force('charge')
      .strength(chargeStrength);
      
    this.simulation.force('center')
      .strength(centerStrength);
    
    // Redémarrer la simulation avec une alpha élevée pour appliquer les changements
    this.simulation.alpha(1).restart();
  }

  /**
   * Crée les définitions de marqueurs (flèches) pour les liens
   */
  createArrowDefinitions() {
    // Sérialiser la config courante
    const currentConfig = JSON.stringify(graphConfig.markers);
    // Ne rien faire si inchangé
    if (this._lastMarkerConfig === currentConfig) return;
    // Mettre à jour le cache
    this._lastMarkerConfig = currentConfig;
    
    // Supprimer et recréer les définitions
    d3.select("svg defs").selectAll("*").remove();
    const defs = d3.select("svg defs");
    
    // Créer un marqueur de flèche standard
    defs.append("marker")
      .attr("id", "arrowhead")
      .attr("viewBox", "-10 -10 20 20")
      .attr("refX", -2)
      .attr("refY", 0)
      .attr("markerWidth", 8)
      .attr("markerHeight", 8)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M -10,-6 0,0 -10,6")
      .attr("fill", "#000")
      .attr("stroke", "none");
      
    // Marqueur pour les liens sélectionnés
    defs.append("marker")
      .attr("id", "arrowhead-selected")
      .attr("viewBox", "-10 -10 20 20")
      .attr("refX", -2)
      .attr("refY", 0)
      .attr("markerWidth", 8)
      .attr("markerHeight", 8)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M -10,-6 0,0 -10,6")
      .attr("fill", "#f00")
      .attr("stroke", "none");
      
    // Marqueur pour les auto-liens (boucles)
    defs.append("marker")
      .attr("id", "arrowhead-loop")
      .attr("viewBox", "-10 -10 20 20")
      .attr("refX", -2)
      .attr("refY", 0)
      .attr("markerWidth", 8)
      .attr("markerHeight", 8)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M -10,-6 0,0 -10,6")
      .attr("fill", "#000")
      .attr("stroke", "none");
    
    // Marqueur pour les auto-liens sélectionnés
    defs.append("marker")
      .attr("id", "arrowhead-loop-selected")
      .attr("viewBox", "-10 -10 20 20")
      .attr("refX", -2)
      .attr("refY", 0)
      .attr("markerWidth", 8)
      .attr("markerHeight", 8)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M -10,-6 0,0 -10,6")
      .attr("fill", "#f00")
      .attr("stroke", "none");
  }
  
  /**
   * Calcule la courbure des liens
   */
  calculateLinkCurvature(source, target, linkId) {
    const idField = this.graphState.globalSettings.nodeIdField;
    const { baseCurvature, loopCurvature, curvatureStep } = graphConfig.linkStyle;
    
    // Cas spécial pour les auto-liens (boucles)
    if (source[idField] === target[idField]) {
      return loopCurvature;
    }
    
    // Déterminer la direction de ce lien
    const isForward = source[idField] < target[idField];
    
    // Trouver tous les liens entre cette paire de nœuds
    const parallelLinks = this.graphState.links.filter(l => 
      (l.source[idField] === source[idField] && l.target[idField] === target[idField]) || 
      (l.source[idField] === target[idField] && l.target[idField] === source[idField])
    );
    
    // Séparer en deux groupes selon la direction
    const forwardLinks = parallelLinks.filter(l => l.source[idField] < l.target[idField]);
    const backwardLinks = parallelLinks.filter(l => l.source[idField] > l.target[idField]);
    
    // Si c'est le seul lien entre ces nœuds, appliquer la courbure de base
    if (parallelLinks.length === 1) {
      return isForward ? baseCurvature : -baseCurvature;
    }
    
    // Trouver l'index de ce lien spécifique dans le groupe approprié
    const targetGroup = isForward ? forwardLinks : backwardLinks;
    const linkIndex = targetGroup.findIndex(l => l.id === linkId);
    
    // Calculer la courbure en fonction de l'index et du pas de courbure
    const calculatedCurvature = baseCurvature + (curvatureStep * linkIndex);
    
    // Assurer que les directions opposées ont des courbures opposées
    return isForward ? calculatedCurvature : -calculatedCurvature;
  }
  
  /**
   * Met à jour les nœuds du graphe
   */
  updateNodes() {
    const { nodeLabelField, nodeSizeField, defaultNodeSize, nodeIdField } = this.graphState.globalSettings;
    
    // Sélection des nœuds avec correspondance de données
    const nodeSelection = this.g.selectAll('.node')
      .data(this.graphState.nodes, d => d.id);
    
    // Création des nouveaux nœuds
    const nodeEnter = nodeSelection.enter()
      .append('g')
      .attr('class', 'node');
    
    // Ajout du cercle
    nodeEnter.append('circle')
      .attr('r', d => (nodeSizeField && d[nodeSizeField]) 
           ? Number(d[nodeSizeField]) 
           : (Number(d.size) || defaultNodeSize));
    
    // Ajout du texte
    nodeEnter.append('text')
      .attr('dx', d => (nodeSizeField && d[nodeSizeField]) 
           ? (Number(d[nodeSizeField]) + 5) 
           : 35)
      .attr('dy', 5)
      .text(d => {
        if (nodeLabelField) return d[nodeLabelField] || "";
        // fallback to id‐field if label blank
        return nodeIdField ? (d[nodeIdField] || "") : "";
      });
    
    // Fusion et mise à jour des nœuds existants
    const merged = nodeSelection.merge(nodeEnter)
      .classed('selected', d => d === this.graphState.selectedNode);
    
    // Mise à jour du rayon du cercle
    merged.select('circle')
      .attr('r', d => (nodeSizeField && d[nodeSizeField]) 
           ? Number(d[nodeSizeField]) 
           : (Number(d.size) || defaultNodeSize));
    
    // Mise à jour du texte
    merged.select('text')
      .text(d => {
        if (nodeLabelField) return d[nodeLabelField] || "";
        return nodeIdField ? (d[nodeIdField] || "") : "";
      });
    
    // Suppression des nœuds qui ne sont plus dans les données
    nodeSelection.exit().remove();
    
    return nodeEnter;
  }
  
  /**
   * Met à jour les liens du graphe
   */
  updateLinks() {
    const idField = this.graphState.globalSettings.nodeIdField;
    const { defaultLinkWidth } = this.graphState.globalSettings; // ← utilisation unique
    const { curvedLinks } = graphConfig.linkStyle;
    
    // Précalculer les courbures pour chaque lien
    this.graphState.links.forEach(link => {
      // Vérifier si c'est un auto-lien
      link.isLoop = link.source[idField] === link.target[idField];
      link.curvature = this.calculateLinkCurvature(link.source, link.target, link.id);
      
      // Toujours remplacer la largeur par la valeur par défaut si non définie
      if (link.width === undefined) {
        link.width = parseFloat(defaultLinkWidth);
      }
    });
    
    // Sélectionner les liens avec un ID unique pour chaque lien
    const getLinkId = link =>
      `${link.source[idField] ?? link.source.id}` +
      `-${link.target[idField] ?? link.target.id}` +
      `-${link.id}`;              // ← include custom id in key

    const linkSelection = this.g.selectAll('.link').data(this.graphState.links, getLinkId);
    const linkEnter = linkSelection.enter()
      .append('path')
      .attr('class', 'link')
      .attr('fill', 'none')
      .attr('vector-effect', 'non-scaling-stroke');
    
    // Fusion et mise à jour
    const allLinks = linkSelection.merge(linkEnter)
      .attr('stroke-width', d => parseFloat(d.width) || defaultLinkWidth)
      .attr('stroke', d => d === this.graphState.selectedLink ? '#f00' : '#000')
      .attr('marker-end', d => {
        if (d.isLoop) {
          return d === this.graphState.selectedLink 
                 ? 'url(#arrowhead-loop-selected)' 
                 : 'url(#arrowhead-loop)';
        } else {
          return d === this.graphState.selectedLink 
                 ? 'url(#arrowhead-selected)' 
                 : 'url(#arrowhead)';
        }
      });
    
    linkSelection.exit().remove();

    // Stocker la sélection pour le ticked()
    this.linkPaths = allLinks;

    return linkEnter;
  }
  
  /**
   * Met à jour les labels des liens
   */
  updateLinkLabels() {
    const idField = this.graphState.globalSettings.nodeIdField;
    const { linkLabelField } = this.graphState.globalSettings;
    
    // Sélectionner les labels des liens
    const linkLabels = this.g.selectAll('.link-label')
      .data(this.graphState.links, d =>
        `${d.source[idField] ?? d.source.id}-${d.target[idField] ?? d.target.id}-${d.id}`
      );  // ← include link id to disambiguate parallel links
    
    // Créer les nouveaux labels
    const labelEnter = linkLabels.enter()
      .append('text')
      .attr('class', 'link-label')
      .attr('dx', 10);
    
    // Fusion et mise à jour
    labelEnter.merge(linkLabels)
      .classed('selected', d => d === this.graphState.selectedLink)
      .text(d => linkLabelField === '' ? '' : (d[linkLabelField] || ""));
    
    // Suppression des labels qui ne sont plus dans les données
    linkLabels.exit().remove();
    
    return labelEnter;
  }
  
  /**
   * Fonction appelée à chaque pas de simulation
   */
  ticked() {
    const { nodeSizeField, defaultNodeSize } = this.graphState.globalSettings;
    const { curvedLinks } = graphConfig.linkStyle;
    
    // Utiliser la sélection mise en cache au lieu de relancer selectAll
    (this.linkPaths || this.g.selectAll('.link'))
      .attr('d', d => {
        // Récupérer les rayons des nœuds
        const rSource = (nodeSizeField && d.source[nodeSizeField]) 
                      ? Math.max(1, Number(d.source[nodeSizeField])) 
                      : Number(d.source.size || defaultNodeSize);
        const rTarget = (nodeSizeField && d.target[nodeSizeField]) 
                      ? Math.max(1, Number(d.target[nodeSizeField])) 
                      : Number(d.target.size || defaultNodeSize);
        
        // Vérifier s'il s'agit d'un auto-lien
        if (d.isLoop) {
          return this.drawSelfLoop(d.source.x, d.source.y, rSource);
        }
        
        // Vecteurs et distances
        const dx = d.target.x - d.source.x;
        const dy = d.target.y - d.source.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        // Protection contre division par zéro
        if (dist < 0.1) return `M${d.source.x},${d.source.y}L${d.source.x},${d.source.y}`;
        
        // Vecteur unitaire
        const unitX = dx / dist;
        const unitY = dy / dist;
        
        // Points ajustés
        const adjustedStart = {
          x: d.source.x + unitX * rSource,
          y: d.source.y + unitY * rSource
        };
        
        const markerAdjustment = 1; 
        const adjustedEnd = {
          x: d.target.x - unitX * (rTarget + markerAdjustment),
          y: d.target.y - unitY * (rTarget + markerAdjustment)
        };
        
        // Si curvedLinks est false, renvoyer un lien droit
        if (!curvedLinks) {
          return `M${adjustedStart.x},${adjustedStart.y} L${adjustedEnd.x},${adjustedEnd.y}`;
        }
        
        // Courbe de Bézier
        const curvature = d.curvature || 0.05;
        
        // Vecteur perpendiculaire
        const perpX = -unitY;
        const perpY = unitX;
        
        // Point médian décalé
        const midX = (adjustedStart.x + adjustedEnd.x) / 2;
        const midY = (adjustedStart.y + adjustedEnd.y) / 2;
        
        const ctrlX = midX + perpX * dist * curvature;
        const ctrlY = midY + perpY * dist * curvature;
        
        return `M${adjustedStart.x},${adjustedStart.y} Q${ctrlX},${ctrlY} ${adjustedEnd.x},${adjustedEnd.y}`;
      });
    
    // Mise à jour des positions des nœuds
    this.g.selectAll('.node')
      .attr('transform', d => `translate(${d.x},${d.y})`);
    
    // Mise à jour des positions des labels de liens
    this.g.selectAll('.link-label')
      .attr('transform', d => {
        const { nodeSizeField, defaultNodeSize } = this.graphState.globalSettings;
        const { curvedLinks } = graphConfig.linkStyle;
        
        // Pour les auto-liens
        if (d.isLoop) {
          const radius = (nodeSizeField && d.source[nodeSizeField]) 
                        ? +d.source[nodeSizeField] 
                        : (d.source.size || defaultNodeSize);
          
          return `translate(${d.source.x},${d.source.y - radius * 2.5})`;
        }
        
        const sx = d.source.x;
        const sy = d.source.y;
        const tx = d.target.x;
        const ty = d.target.y;
        
        // Si les liens sont droits
        if (!curvedLinks) {
          return `translate(${(sx + tx) / 2},${(sy + ty) / 2})`;
        }
        
        // Pour les liens courbes
        const dist = Math.sqrt((tx - sx) * (tx - sx) + (ty - sy) * (ty - sy));
        
        if (dist === 0) return "translate(0,0)";
        
        const curvature = d.curvature || 0.05;
        const t = 0.55; // Paramètre pour la position le long de la courbe
        
        const perpX = -(ty - sy) / dist;
        const perpY = (tx - sx) / dist;
        
        // Calcul du point sur la courbe de Bézier
        const midX = (1-t)*(1-t)*sx + 2*(1-t)*t*((sx + tx)/2 + perpX*dist*curvature) + t*t*tx;
        const midY = (1-t)*(1-t)*sy + 2*(1-t)*t*((sy + ty)/2 + perpY*dist*curvature) + t*t*ty;
        
        return `translate(${midX},${midY})`;
      })
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central');
  }
  
  /**
   * Dessine un auto-lien (boucle)
   */
  drawSelfLoop(x, y, radius) {
    const { loopCurvature } = graphConfig.linkStyle;
    
    // Dessiner une boucle au-dessus du nœud
    const loopRadius = radius * loopCurvature;
    const startAngle = -Math.PI/2 - Math.PI/6;
    const endAngle = -Math.PI/2 + Math.PI/6;
    
    // Points de contrôle pour la courbe de Bézier
    const startX = x + radius * Math.cos(startAngle);
    const startY = y + radius * Math.sin(startAngle);
    const endX = x + radius * Math.cos(endAngle);
    const endY = y + radius * Math.sin(endAngle);
    
    // Point de contrôle pour une courbe plus arrondie
    const controlX = x;
    const controlY = y - loopRadius * 2;
    
    return `M${startX},${startY} Q${controlX},${controlY} ${endX},${endY}`;
  }
  
  /**
   * Met à jour l'affichage complet du graphe
   */
  updateGraph() {
    // apply user‐selected x/y fields before simulation
    const { xField, yField } = this.graphState.globalSettings;
    if (xField || yField) {
      this.graphState.nodes.forEach(d => {
        if (xField && d[xField] != null) d.x = +d[xField];
        if (yField && d[yField] != null) d.y = +d[yField];
      });
    }

    // Créer les définitions de marqueurs
    this.createArrowDefinitions();
    
    // Stabiliser les nœuds initiaux en les maintenant fixes temporairement
    const firstRun = !this._initialized;
    if (firstRun) {
      // Libérer les positions fixes après la première initialisation
      setTimeout(() => {
        this.graphState.nodes.forEach(node => {
          delete node.fx;
          delete node.fy;
        });
        // Redémarrer la simulation avec une faible alpha
        this.simulation.alpha(0.3).restart();
      }, 1000);
      this._initialized = true;
    }
    
    // Mettre à jour les éléments visuels
    const nodeEnter = this.updateNodes();
    const linkEnter = this.updateLinks();
    const labelEnter = this.updateLinkLabels();
    
    // Mettre à jour la simulation
    this.simulation.nodes(this.graphState.nodes).on('tick', () => this.ticked());
    this.simulation.force('link').links(this.graphState.links);
    
    // Redémarrer la simulation avec une faible alpha pour éviter trop de mouvement
    if (!firstRun) {
      this.simulation.alpha(0.3).restart();
    }
    
    // notifier la mise à jour du graphe
    eventBus.emit('graph-updated');
    
    return {
      nodeEnter,
      linkEnter,
      labelEnter
    };
  }
  
  /**
   * Active le zoom sur le graphe
   */
  enableZoom() {
    this.svg.call(
      d3.zoom()
        .extent([[0, 0], [this.width, this.height]])
        .scaleExtent([0.5, 3])
        .filter(event => event.button === 2 || event.type === "wheel")
        .on('zoom', event => {
          if (event.sourceEvent && event.sourceEvent.button === 2) {
            this.g.attr('transform', `translate(${event.transform.x},${event.transform.y})`);
          } else {
            this.g.attr('transform', `translate(${event.transform.x},${event.transform.y}) scale(${event.transform.k})`);
          }
        })
    );
    
    this.svg.on('dblclick.zoom', null);
    this.svg.on('contextmenu', event => event.preventDefault());
  }

  clearHighlights() {
    this.g.selectAll('.node').classed('highlighted', false).attr('class','node');
    this.g.selectAll('.link').classed('highlighted-link', false);
  }

  highlightNeighbors(node) {
    this.clearHighlights();
    if (!node) return;
    const neigh = this.graphState.getNeighbors(node.id);
    this.g.selectAll('.node')
      .classed('highlighted', d => neigh.includes(d));
    this.g.selectAll('.link')
      .classed('highlighted-link', d =>
        d.source.id === node.id || d.target.id === node.id
      );
  }

  highlightHighDegree(minDegree = 2) {
    this.clearHighlights();
    const counts = {};
    this.graphState.links.forEach(l => {
      counts[l.source.id] = (counts[l.source.id] || 0) + 1;
      counts[l.target.id] = (counts[l.target.id] || 0) + 1;
    });
    this.g.selectAll('.node')
      .classed('highlighted', d => (counts[d.id]||0) >= minDegree);
  }

  colorClusters() {
    this.clearHighlights();
    const clusters = this.graphState.findClusters();
    clusters.forEach((comp, idx) => {
      comp.forEach(n => {
        this.g.selectAll('.node')
          .filter(d => d.id === n.id)
          .classed(`cluster-${idx}`, true);
      });
    });
  }
}
