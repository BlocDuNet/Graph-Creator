/**
 * Renders the graph with D3.
 */
import { graphConfig } from '../config/index.js';
import eventBus from '../services/EventBus.js';
import { parseExpression, evaluateExpression } from '../expr/ExpressionEngine.js';

export class GraphRenderer {
  constructor(graphState, svgSelection) {
    this.graphState = graphState;
    this.svg = svgSelection;
    this.width = +this.svg.attr('width');
    this.height = +this.svg.attr('height');
    
    // Create the main group for the graph.
    this.g = this.svg.append('g');
    
    // Configure the force simulation.
    this.simulation = this.createForceSimulation();
    
    // Create marker definitions (arrows).
    this.createArrowDefinitions();
    
    // Store the last marker configuration.
    
    this.ruleCache = new Map();
    eventBus.on('style-rules-updated', () => this.ruleCache.clear());
    eventBus.on('pie-rules-updated', () => this.ruleCache.clear());
    eventBus.on('group-rules-updated', () => this.ruleCache.clear());
console.log("Renderer initialized with graph config:", graphConfig);
  }
  
  /**
   * Create the D3 force simulation.
   */
  createForceSimulation() {
    const idField = this.graphState.globalSettings.nodeIdField;
    const { linkStrength, linkDistance, chargeStrength, centerStrength } = graphConfig.forces;
    
    console.log(`Creating force simulation with: linkStrength=${linkStrength}, linkDistance=${linkDistance}, chargeStrength=${chargeStrength}, centerStrength=${centerStrength}`);
    
    const forceLink = d3.forceLink()
      .id(d => d[idField] ?? d.id)     // use custom id field
      .distance(linkDistance)
      .strength(linkStrength);
      
    const forceCharge = d3.forceManyBody()
      .strength(chargeStrength);
      
    const forceCenter = d3.forceCenter(this.width / 2, this.height / 2)
      .strength(centerStrength);
    
    // Reduce alpha and decay for a more stable simulation.
    return d3.forceSimulation()
      .force('link', forceLink)
      .force('charge', forceCharge)
      .force('center', forceCenter)
      .alphaDecay(0.05) // Plus grande valeur = stabilisation plus rapide
      .alpha(0.1);      // Valeur plus faible = moins de mouvement initial
  }
  
  /**
   * Update simulation forces.
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
    
    // Restart the simulation with a high alpha to apply changes.
    this.simulation.alpha(1).restart();
  }

  /**
   * Create marker definitions (arrows) for links.
   */
  createArrowDefinitions() {
    // Serialize the current config.
    const currentConfig = JSON.stringify(graphConfig.markers);
    // Do nothing if unchanged.
    if (this._lastMarkerConfig === currentConfig) return;
    // Update the cache.
    this._lastMarkerConfig = currentConfig;
    
    // Remove and recreate definitions.
    d3.select("svg defs").selectAll("*").remove();
    const defs = d3.select("svg defs");
    
    // Create a standard arrow marker.
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
      
    // Marker for selected links.
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
      
    // Marker for self-links (loops).
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
    
    // Marker for selected self-links.
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
   * Compute link curvature.
   */
  calculateLinkCurvature(source, target, linkId) {
    const idField = this.graphState.globalSettings.nodeIdField;
    const { baseCurvature, loopCurvature, curvatureStep } = graphConfig.linkStyle;
    
    // Special case for self-links (loops).
    if (source[idField] === target[idField]) {
      return loopCurvature;
    }
    
    // Determine the direction of this link.
    const isForward = source[idField] < target[idField];
    
    // Find all links between this node pair.
    const parallelLinks = this.graphState.links.filter(l => 
      (l.source[idField] === source[idField] && l.target[idField] === target[idField]) || 
      (l.source[idField] === target[idField] && l.target[idField] === source[idField])
    );
    
    // Split into two groups by direction.
    const forwardLinks = parallelLinks.filter(l => l.source[idField] < l.target[idField]);
    const backwardLinks = parallelLinks.filter(l => l.source[idField] > l.target[idField]);
    
    // If it's the only link between these nodes, apply base curvature.
    if (parallelLinks.length === 1) {
      return isForward ? baseCurvature : -baseCurvature;
    }
    
    // Find the index of this specific link in the appropriate group.
    const targetGroup = isForward ? forwardLinks : backwardLinks;
    const linkIndex = targetGroup.findIndex(l => l.id === linkId);
    
    // Compute curvature based on index and curvature step.
    const calculatedCurvature = baseCurvature + (curvatureStep * linkIndex);
    
    // Ensure opposite directions have opposite curvatures.
    return isForward ? calculatedCurvature : -calculatedCurvature;
  }
  
  /**
   * Update graph nodes.
   */
  updateNodes() {
    const { nodeLabelField, nodeSizeField, defaultNodeSize, nodeIdField } = this.graphState.globalSettings;

    // Select nodes with data binding.
    const nodeSelection = this.g.selectAll('.node')
      .data(this.graphState.nodes, d => d.id);

    // Create new nodes.
    const nodeEnter = nodeSelection.enter()
      .append('g')
      .attr('class', 'node');

    nodeEnter.append('g').attr('class', 'node-pie');
    nodeEnter.append('rect').attr('class', 'node-rect').attr('rx', 4).attr('ry', 4);
    nodeEnter.append('circle').attr('class', 'node-circle');

    // Add text.
    nodeEnter.append('text')
      .attr('dy', 5)
      .text(d => {
        if (nodeLabelField) {
          const val = this.graphState.resolveFieldValue('node', d, nodeLabelField);
          return this.resolveLangValue(val) || "";
        }
        return nodeIdField ? (d[nodeIdField] || "") : "";
      });
    nodeEnter.append('circle').attr('class', 'node-hit');

    // Merge and update existing nodes.
    const merged = nodeSelection.merge(nodeEnter)
      .classed('selected', d => d === this.graphState.selectedNode);

    // Compute styles & sizes.
    merged.each(d => {
      const baseSize = this.getBaseNodeSize(d, nodeSizeField, defaultNodeSize);
      const style = this.getStyleFor('node', d);
      const renderSize = this.resolveStyleNumber(style.size, baseSize);
      d.__renderSize = renderSize;
      d.__style = style;
      d.__pie = this.getPieForNode(d, renderSize);
      const pieOuter = d.__pie && d.__pie.mode === 'ring'
        ? renderSize + (d.__pie.offset || 2) + (d.__pie.ringWidth || 6)
        : renderSize;
      const baseHit = d.__style?.shape === 'rect'
        ? renderSize * Math.SQRT2
        : renderSize;
      d.__hitRadius = Math.max(baseHit || 0, pieOuter || 0);
    });

    // Update circle.
    merged.select('.node-circle')
      .attr('r', d => d.__renderSize || defaultNodeSize)
      .attr('fill', d => this.getNodeFill(d))
      .attr('stroke', d => this.getNodeStroke(d))
      .attr('stroke-width', d => this.getNodeStrokeWidth(d))
      .attr('opacity', d => this.getNodeOpacity(d))
      .style('display', d => (d.__style?.shape === 'rect' ? 'none' : ''));

    merged.select('.node-hit')
      .attr('r', d => d.__hitRadius || d.__renderSize || defaultNodeSize);

    // Update rectangle (if needed).
    merged.select('.node-rect')
      .attr('x', d => -(d.__renderSize || defaultNodeSize))
      .attr('y', d => -(d.__renderSize || defaultNodeSize))
      .attr('width', d => (d.__renderSize || defaultNodeSize) * 2)
      .attr('height', d => (d.__renderSize || defaultNodeSize) * 2)
      .attr('fill', d => this.getNodeFill(d))
      .attr('stroke', d => this.getNodeStroke(d))
      .attr('stroke-width', d => this.getNodeStrokeWidth(d))
      .attr('opacity', d => this.getNodeOpacity(d))
      .style('display', d => (d.__style?.shape === 'rect' ? '' : 'none'));

    // Update text.
    merged.select('text')
      .attr('dx', d => (d.__renderSize || defaultNodeSize) + 5)
      .attr('fill', d => d.__style?.labelColor || (d === this.graphState.selectedNode ? '#0077ff' : null))
      .text(d => {
        if (nodeLabelField) {
          const val = this.graphState.resolveFieldValue('node', d, nodeLabelField);
          return this.resolveLangValue(val) || "";
        }
        return nodeIdField ? (d[nodeIdField] || "") : "";
      });

    this.updateNodePieCharts(merged);

    // Remove nodes that are no longer in the data.
    nodeSelection.exit().remove();

    return nodeEnter;
  }
  
  /**
   * Update graph links.
   */
  updateLinks() {
    const idField = this.graphState.globalSettings.nodeIdField;
    const { defaultLinkWidth } = this.graphState.globalSettings; // utilisation unique
    const { curvedLinks } = graphConfig.linkStyle;
    
    // Precompute curvature for each link.
    this.graphState.links.forEach(link => {
      // Check if this is a self-link.
      link.isLoop = link.source[idField] === link.target[idField];
      link.curvature = this.calculateLinkCurvature(link.source, link.target, link.id);
      
      // Always replace width with default if undefined.
      if (link.width === undefined) {
        link.width = parseFloat(defaultLinkWidth);
      }
    });
    
    // Select links with a unique ID for each link.
    const getLinkId = link =>
      `${link.source[idField] ?? link.source.id}` +
      `-${link.target[idField] ?? link.target.id}` +
      `-${link.id}`;              // include custom id in key

    const linkSelection = this.g.selectAll('.link').data(this.graphState.links, getLinkId);
    const linkEnter = linkSelection.enter()
      .append('path')
      .attr('class', 'link')
      .attr('fill', 'none')
      .attr('vector-effect', 'non-scaling-stroke');
    
    // Merge and update.
    const allLinks = linkSelection.merge(linkEnter)
      .each(d => {
        const baseWidth = parseFloat(d.width) || defaultLinkWidth;
        const style = this.getStyleFor('link', d);
        d.__style = style;
        d.__renderWidth = this.resolveStyleNumber(style.linkWidth, baseWidth);
      })
      .attr('stroke-width', d => d.__renderWidth || defaultLinkWidth)
      .attr('stroke', d => d === this.graphState.selectedLink ? '#f00' : (d.__style?.linkColor || '#000'))
      .attr('stroke-opacity', d => this.resolveStyleNumber(d.__style?.linkOpacity, null))
      .attr('stroke-dasharray', d => d.__style?.linkDash || null)
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

    // Store the selection for ticked().
    this.linkPaths = allLinks;

    return linkEnter;
  }
  
  /**
   * Update link labels.
   */
  updateLinkLabels() {
    const idField = this.graphState.globalSettings.nodeIdField;
    const { linkLabelField } = this.graphState.globalSettings;
    
    // Select link labels.
    const linkLabels = this.g.selectAll('.link-label')
      .data(this.graphState.links, d =>
        `${d.source[idField] ?? d.source.id}-${d.target[idField] ?? d.target.id}-${d.id}`
      );  // include link id to disambiguate parallel links
    
    // Create new labels.
    const labelEnter = linkLabels.enter()
      .append('text')
      .attr('class', 'link-label')
      .attr('dx', 10);
    
    // Merge and update.
    labelEnter.merge(linkLabels)
      .classed('selected', d => d === this.graphState.selectedLink)
      .attr('fill', d => d.__style?.labelColor || (d === this.graphState.selectedLink ? '#0077ff' : null))
      .text(d => {
        if (linkLabelField === '') return '';
        const val = this.graphState.resolveFieldValue('link', d, linkLabelField);
        return this.resolveLangValue(val) || "";
      });
    
    // Remove labels that are no longer in the data.
    linkLabels.exit().remove();
    
    return labelEnter;
  }
  
  /**
   * Function called on each simulation tick.
   */
  ticked() {
    const { curvedLinks } = graphConfig.linkStyle;
    
    // Use cached selection instead of re-running selectAll.
    (this.linkPaths || this.g.selectAll('.link'))
      .attr('d', d => {
        // Get node radii (with style rules).
        const rSource = this.getNodeRenderSize(d.source);
        const rTarget = this.getNodeRenderSize(d.target);
        
        // Check if this is a self-link.
        if (d.isLoop) {
          return this.drawSelfLoop(d.source.x, d.source.y, rSource);
        }
        
        // Vectors and distances.
        const dx = d.target.x - d.source.x;
        const dy = d.target.y - d.source.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        // Guard against division by zero.
        if (dist < 0.1) return `M${d.source.x},${d.source.y}L${d.source.x},${d.source.y}`;
        
        // Unit vector.
        const unitX = dx / dist;
        const unitY = dy / dist;
        
        // Adjusted points.
        const adjustedStart = {
          x: d.source.x + unitX * rSource,
          y: d.source.y + unitY * rSource
        };
        
        const markerAdjustment = 1; 
        const adjustedEnd = {
          x: d.target.x - unitX * (rTarget + markerAdjustment),
          y: d.target.y - unitY * (rTarget + markerAdjustment)
        };
        
        // If curvedLinks is false, return a straight link.
        if (!curvedLinks) {
          return `M${adjustedStart.x},${adjustedStart.y} L${adjustedEnd.x},${adjustedEnd.y}`;
        }
        
        // Bezier curve.
        const curvature = d.curvature || 0.05;
        
        // Perpendicular vector.
        const perpX = -unitY;
        const perpY = unitX;
        
        // Offset midpoint.
        const midX = (adjustedStart.x + adjustedEnd.x) / 2;
        const midY = (adjustedStart.y + adjustedEnd.y) / 2;
        
        const ctrlX = midX + perpX * dist * curvature;
        const ctrlY = midY + perpY * dist * curvature;
        
        return `M${adjustedStart.x},${adjustedStart.y} Q${ctrlX},${ctrlY} ${adjustedEnd.x},${adjustedEnd.y}`;
      });
    
    // Update node positions.
    this.g.selectAll('.node')
      .attr('transform', d => `translate(${d.x},${d.y})`);
    
    // Update link label positions.
    this.g.selectAll('.link-label')
      .attr('transform', d => {
        const { curvedLinks } = graphConfig.linkStyle;
        
        // For self-links.
        if (d.isLoop) {
          const radius = this.getNodeRenderSize(d.source);
          
          return `translate(${d.source.x},${d.source.y - radius * 2.5})`;
        }
        
        const sx = d.source.x;
        const sy = d.source.y;
        const tx = d.target.x;
        const ty = d.target.y;
        
        // If links are straight.
        if (!curvedLinks) {
          return `translate(${(sx + tx) / 2},${(sy + ty) / 2})`;
        }
        
        // For curved links.
        const dist = Math.sqrt((tx - sx) * (tx - sx) + (ty - sy) * (ty - sy));
        
        if (dist === 0) return "translate(0,0)";
        
        const curvature = d.curvature || 0.05;
        const t = 0.55; // Parametre pour la position le long de la courbe
        
        const perpX = -(ty - sy) / dist;
        const perpY = (tx - sx) / dist;
        
        // Compute the point on the Bezier curve.
        const midX = (1-t)*(1-t)*sx + 2*(1-t)*t*((sx + tx)/2 + perpX*dist*curvature) + t*t*tx;
        const midY = (1-t)*(1-t)*sy + 2*(1-t)*t*((sy + ty)/2 + perpY*dist*curvature) + t*t*ty;
        
        return `translate(${midX},${midY})`;
      })
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central');
  }
  
  /**
   * Draws a self-link (loop).
   */
  drawSelfLoop(x, y, radius) {
    const { loopCurvature } = graphConfig.linkStyle;
    
    // Draw a loop above the node.
    const loopRadius = radius * loopCurvature;
    const startAngle = -Math.PI/2 - Math.PI/6;
    const endAngle = -Math.PI/2 + Math.PI/6;
    
    // Control points for the Bezier curve.
    const startX = x + radius * Math.cos(startAngle);
    const startY = y + radius * Math.sin(startAngle);
    const endX = x + radius * Math.cos(endAngle);
    const endY = y + radius * Math.sin(endAngle);
    
    // Control point for a rounder curve.
    const controlX = x;
    const controlY = y - loopRadius * 2;
    
    return `M${startX},${startY} Q${controlX},${controlY} ${endX},${endY}`;
  }
  
  /**
   * Update full graph rendering.
   */
  updateGraph() {
    // apply user-selected x/y fields before simulation
    const { xField, yField } = this.graphState.globalSettings;
    if (xField || yField) {
      this.graphState.nodes.forEach(d => {
        if (xField) {
          const val = this.graphState.resolveFieldValue('node', d, xField);
          if (val != null && val !== '') d.x = +val;
        }
        if (yField) {
          const val = this.graphState.resolveFieldValue('node', d, yField);
          if (val != null && val !== '') d.y = +val;
        }
      });
    }

    // Create marker definitions.
    this.createArrowDefinitions();
    
    // Stabilize initial nodes by keeping them fixed temporarily.
    const firstRun = !this._initialized;
    if (firstRun) {
      // Release fixed positions after the first initialization.
      setTimeout(() => {
        this.graphState.nodes.forEach(node => {
          delete node.fx;
          delete node.fy;
        });
        // Restart the simulation with a low alpha.
        this.simulation.alpha(0.3).restart();
      }, 1000);
      this._initialized = true;
    }
    
    // Update visual elements.
    const nodeEnter = this.updateNodes();
    const linkEnter = this.updateLinks();
    const labelEnter = this.updateLinkLabels();
    
    // Update the simulation.
    this.simulation.nodes(this.graphState.nodes).on('tick', () => this.ticked());
    this.simulation.force('link').links(this.graphState.links);
    
    // Restart the simulation with a low alpha to avoid too much movement.
    if (!firstRun) {
      this.simulation.alpha(0.3).restart();
    }
    
    // Notify graph update.
    eventBus.emit('graph-updated');
    
    return {
      nodeEnter,
      linkEnter,
      labelEnter
    };
  }
  
  /**
   * Enable zoom on the graph.
   */
  enableZoom() {
    this.svg.call(
      d3.zoom()
        .extent([[0, 0], [this.width, this.height]])
        .scaleExtent([0.5, 3])
        .filter(event => event.button === 2 || event.type === "wheel")
        .on('zoom', event => {
          // Always apply translate + scale to keep a consistent transform.
          this.g.attr('transform', event.transform);
        })
    );
    
    this.svg.on('dblclick.zoom', null);
    this.svg.on('contextmenu', event => event.preventDefault());
  }

  resolveStyleNumber(value, fallback = null) {
    if (value === null || value === undefined || value === '') return fallback;
    const normalized = String(value).trim().replace(',', '.');
    const num = Number(normalized);
    return Number.isFinite(num) ? num : fallback;
  }

  getBaseNodeSize(node, nodeSizeField, defaultNodeSize) {
    if (nodeSizeField) {
      const val = this.graphState.resolveFieldValue('node', node, nodeSizeField);
      if (val !== null && val !== undefined && val !== '') {
        return Math.max(1, Number(val) || defaultNodeSize);
      }
    }
    return Math.max(1, Number(node.size) || defaultNodeSize);
  }

  getNodeRenderSize(node) {
    if (node?.__renderSize != null) return node.__renderSize;
    const { nodeSizeField, defaultNodeSize } = this.graphState.globalSettings;
    const base = this.getBaseNodeSize(node, nodeSizeField, defaultNodeSize);
    const style = this.getStyleFor('node', node);
    return this.resolveStyleNumber(style.size, base);
  }

  getNodeFill(node) {
    const fill = node?.__style?.fill;
    if (fill) return fill;
    if (node?.__pie && node.__pie.mode === 'inside') return 'none';
    return null;
  }

  getNodeStroke(node) {
    const stroke = node?.__style?.stroke;
    return stroke || null;
  }

  getNodeStrokeWidth(node) {
    return this.resolveStyleNumber(node?.__style?.strokeWidth, null);
  }

  getNodeOpacity(node) {
    return this.resolveStyleNumber(node?.__style?.opacity, null);
  }

  getRuleAst(rule) {
    const expr = (rule?.when || '').trim();
    if (!expr) return null;
    const key = `${rule.id || 'rule'}|${expr}`;
    if (this.ruleCache.has(key)) return this.ruleCache.get(key);
    try {
      const ast = parseExpression(expr);
      this.ruleCache.set(key, ast);
      return ast;
    } catch (e) {
      this.ruleCache.set(key, null);
      return null;
    }
  }

  ruleMatches(rule, target, item) {
    if (!rule || rule.enabled === false) return false;
    const expr = (rule.when || '').trim();
    if (!expr) return true;
    const ast = this.getRuleAst(rule);
    if (!ast) return false;
    try {
      return !!evaluateExpression(ast, {
        graph: this.graphState,
        target,
        item,
        getField: name => this.graphState.resolveFieldValue(target, item, name)
      });
    } catch (e) {
      return false;
    }
  }

  getStyleFor(target, item) {
    const list = target === 'link'
      ? (graphConfig.styleRules?.links || [])
      : (graphConfig.styleRules?.nodes || []);
    let style = {};
    if (Array.isArray(list) && list.length) {
      const sorted = list
        .filter(r => r && r.enabled !== false)
        .slice()
        .sort((a, b) => this.resolveStyleNumber(a.priority, 0) - this.resolveStyleNumber(b.priority, 0));
      sorted.forEach(rule => {
        if (this.ruleMatches(rule, target, item)) {
          style = { ...style, ...(rule.style || {}) };
        }
      });
    }
    const local = this.getLocalStyle(item);
    if (local && Object.keys(local).length) {
      return { ...style, ...local };
    }
    return style;
  }

  getLocalStyle(item) {
    if (!item || typeof item !== 'object') return {};
    if (item.__localStyleEnabled === false) return {};
    const local = item.__localStyle || item.localStyle;
    if (!local || typeof local !== 'object') return {};
    const cleaned = {};
    Object.keys(local).forEach(key => {
      const value = local[key];
      if (value === '' || value === null || value === undefined) return;
      cleaned[key] = value;
    });
    return cleaned;
  }

  parseList(value) {
    return String(value || '')
      .split(/[,;\n]/)
      .map(s => s.trim())
      .filter(Boolean);
  }

  parseNumber(value) {
    if (value === null || value === undefined || value === '') return 0;
    if (typeof value === 'number') return value;
    let str = String(value).trim();
    if (!str) return 0;
    if (str.includes(',') && str.includes('.')) {
      str = str.replace(/\./g, '');
    }
    str = str.replace(',', '.');
    const num = Number(str);
    return Number.isFinite(num) ? num : 0;
  }

  getPieForNode(node, radius) {
    const rules = graphConfig.pieRules?.nodes || [];
    if (!Array.isArray(rules) || !rules.length) return null;
    const sorted = rules
      .filter(r => r && r.enabled !== false)
      .slice()
      .sort((a, b) => this.resolveStyleNumber(a.priority, 0) - this.resolveStyleNumber(b.priority, 0));

    const rule = sorted.find(r => this.ruleMatches(r, 'node', node));
    if (!rule) return null;

    const minSize = this.resolveStyleNumber(rule.minSize, 0);
    if (minSize && radius < minSize) return null;

    let segments = [];
    if (rule.segmentsJson) {
      try {
        const parsed = JSON.parse(rule.segmentsJson);
        if (Array.isArray(parsed)) {
          segments = parsed.map(seg => ({
            label: seg.label || '',
            value: this.parseNumber(seg.value),
            color: seg.color || ''
          }));
        }
      } catch (e) {
        segments = [];
      }
    } else {
      const fields = Array.isArray(rule.fields) ? rule.fields : this.parseList(rule.fields);
      segments = fields.map((field, idx) => ({
        label: field,
        value: this.parseNumber(this.graphState.resolveFieldValue('node', node, field)),
        color: ''
      }));
    }

    segments = segments.filter(s => s.value > 0);
    if (!segments.length) return null;

    const colors = Array.isArray(rule.colors) ? rule.colors : this.parseList(rule.colors);
    const palette = ['#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f', '#edc948', '#b07aa1', '#ff9da7'];
    segments = segments.map((seg, idx) => ({
      ...seg,
      color: seg.color || colors[idx % colors.length] || palette[idx % palette.length]
    }));

    return {
      mode: rule.mode || 'inside',
      ringWidth: this.resolveStyleNumber(rule.ringWidth, 6),
      offset: this.resolveStyleNumber(rule.offset, 2),
      minSize,
      segments
    };
  }

  updateNodePieCharts(selection) {
    if (!selection) return;
    const pie = d3.pie().value(d => d.value).sort(null);
    selection.select('g.node-pie').each((d, i, nodes) => {
      const group = d3.select(nodes[i]);
      const pieData = d.__pie;
      if (!pieData || !Array.isArray(pieData.segments) || !pieData.segments.length) {
        group.selectAll('path').remove();
        return;
      }

      const radius = d.__renderSize || this.graphState.globalSettings.defaultNodeSize;
      const inner = pieData.mode === 'ring' ? radius + (pieData.offset || 2) : 0;
      const outer = pieData.mode === 'ring' ? inner + (pieData.ringWidth || 6) : radius;
      const arc = d3.arc().innerRadius(inner).outerRadius(outer);
      const arcs = pie(pieData.segments);

      const paths = group.selectAll('path').data(arcs, a => a.data.label || a.index);
      paths.enter()
        .append('path')
        .merge(paths)
        .attr('d', arc)
        .attr('fill', a => a.data.color || '#ccc');
      paths.exit().remove();
    });
  }

  resolveLangValue(value) {
    if (value && typeof value === 'object') {
      const lang = this.graphState.globalSettings.currentLanguage;
      if (lang && value[lang] != null) return value[lang];
      const firstKey = Object.keys(value)[0];
      return value[firstKey];
    }
    return value;
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

