/**
 * Handles user interactions with the graph.
 */
import { performAction } from '../state/undo_redo.js';
import eventBus from '../services/EventBus.js';

export class InteractionManager {
  constructor(graphState, renderer, svgSelection) {
    this.graphState = graphState;
    this.renderer = renderer;
    this.svg = svgSelection;
    
    this.initDragHandlers();
    this.initClickHandlers();
    this.initKeyboardHandlers();
    
    // Attach handlers immediately and after each updateGraph.
    this.attachInteractionHandlers();
    eventBus.on('graph-updated', () => this.attachInteractionHandlers());
    
    // Enable zoom.
    this.renderer.enableZoom();
    
    // Track if a node was recently double-clicked to avoid creating a new node.
    this.nodeDoubleClicked = false;
    this.lastPointer = null;
  }
  
  /**
   * Initialize drag handlers.
   */
  initDragHandlers() {
    const drag = this.createDragBehavior();
    
    // Apply drag behavior to existing and future nodes.
    this.svg.selectAll('.node').call(drag);
  }
  
  /**
   * Initialize click handlers.
   */
  initClickHandlers() {
    // Track the last mouse position in graph space.
    this.svg.on('mousemove', event => {
      this.updateLastPointer(event);
    });

    // Double-click on empty space to create a node.
    this.svg.on('dblclick', event => {
      // Check if the event comes from a node.
      if (event.target.closest('.node')) {
        event.stopPropagation();
        return;
      }
      this.handleSvgDblClick(event);
    });
    
    // CTRL+click to create a node and link it.
    this.svg.on('mousedown', event => this.handleSvgMouseDown(event));
  }
  
  /**
   * Apply drag, click, and dblclick to SVG elements.
   */
  attachInteractionHandlers() {
    const drag = this.createDragBehavior();
    this.svg.selectAll('.node')
      .call(drag)
      .on('click', (event, d) => this.handleNodeClick(event, d))
      .on('dblclick', (event, d) => {
        event.stopPropagation();
        this.nodeDoubleClicked = true;
        setTimeout(() => { this.nodeDoubleClicked = false; }, 300);
        console.log("Node double-clicked");
      });
    this.svg.selectAll('.link')
      .on('click',   (event, d) => this.handleLinkClick(event, d));
    this.svg.selectAll('.link-label')
      .on('click',   (event, d) => this.handleLinkClick(event, d));
  }
  
  /**
   * Create drag behavior.
   */
  createDragBehavior() {
    return d3.drag()
      .on('start', (event, d) => {
        if (!event.active) this.renderer.simulation.alphaTarget(0.3).restart();
        d.initialPosition = { x: d.x, y: d.y };
      })
      .on('drag', (event, d) => {
        d.x = event.x;
        d.y = event.y;
      })
      .on('end', (event, d) => {
        if (!event.active) this.renderer.simulation.alphaTarget(0);
        const pos0 = d.initialPosition;
        if (pos0 && (d.x !== pos0.x || d.y !== pos0.y)) {
          const { xField, yField } = this.graphState.globalSettings;
          // Update custom X field.
          if (xField) {
            const oldX = pos0.x;
            const newX = d.x;
            performAction({
              type: "update_node",
              data: {
                nodeId: d.id,
                field: xField,
                from: oldX,
                to: newX,
                label: `Move node ${xField} (${oldX} ? ${newX})`
              }
            });
            d[xField] = newX;
          }
          // Update custom Y field.
          if (yField) {
            const oldY = pos0.y;
            const newY = d.y;
            performAction({
              type: "update_node",
              data: {
                nodeId: d.id,
                field: yField,
                from: oldY,
                to: newY,
                label: `Move node ${yField} (${oldY} ? ${newY})`
              }
            });
            d[yField] = newY;
          }
        }
        delete d.initialPosition;
      });
  }
  
  /**
   * Handle node clicks.
   */
  handleNodeClick(event, d) {
    // Verify that d is a valid object.
    if (!d || typeof d !== 'object') {
      console.error("Erreur: noeud invalide:", d);
      return;
    }
    
    // Ensure the node has an identifier.
    if (!d.id) {
      console.error("Erreur: noeud sans identifiant:", d);
      return;
    }
    
    // Allow creating a self-link with Alt+Click.
    if (event.altKey && this.graphState.selectedNode) {
      // If Alt+Click is on the same selected node.
      if (d.id === this.graphState.selectedNode.id) {
        const newLink = this.graphState.createLink(d, d); // Self-link.
        this.renderer.updateGraph();
        this.graphState.clearSelection();
        return;
      }
    }
    
    // CTRL+Click on a node to create a link.
    if (event.ctrlKey && this.graphState.selectedNode) {
      // Create a link between the selected node and the clicked node.
      this.graphState.createLink(this.graphState.selectedNode, d);
      this.renderer.updateGraph();
      
      // Important: do not change selection or clear selectedNode.
      // To allow creating multiple links from the same source node.
      
      // Stop propagation to avoid triggering other handlers.
      event.stopPropagation();
      return;
    }
    
    // Normal click to select or deselect.
    if (this.graphState.selectedNode === d) {
      // Explicitly deselect.
      this.graphState.clearSelection();
      
      // Explicitly emit the deselection event.
      eventBus.emit('selection-cleared');
    } else {
      // Select the new node.
      this.graphState.selectNode(d);
      
      // Emit a custom event for selection.
      eventBus.emit('node-selected', { node: d });
    }
    
    this.renderer.updateGraph();
  }

  /**
   * Handle link clicks.
   */
  handleLinkClick(event, d) {
    if (this.graphState.selectedLink === d) {
      this.graphState.clearSelection();
    } else {
      this.graphState.selectLink(d);
    }
    
    this.renderer.updateGraph();
    
    // Emit a custom event.
    eventBus.emit('link-selected', { link: this.graphState.selectedLink });
  }
  
  /**
   * Handle double-click on the SVG.
   */
  handleSvgDblClick(event) {
    this.updateLastPointer(event);
    const point = this.getGraphPoint(event);
    if (!point) return;
    const px = Number(point[0]);
    const py = Number(point[1]);
    if (!Number.isFinite(px) || !Number.isFinite(py)) return;
    const newNode = this.graphState.createNode(px, py);
    this.pinNewNode(newNode);
    
    // Explicitly select the new node.
    this.graphState.clearSelection();
    this.graphState.selectNode(newNode);
    
    // Emit a specific event for creation.
    eventBus.emit('node-created', { node: newNode });
    
    this.renderer.updateGraph();
  }
  
  /**
   * Handle mouse click on the SVG.
   */
  handleSvgMouseDown(event) {
    if (event.ctrlKey && this.graphState.selectedNode) {
      this.updateLastPointer(event);
      const adjustedPoint = this.getGraphPoint(event);
      if (!adjustedPoint) return;
      const px = Number(adjustedPoint[0]);
      const py = Number(adjustedPoint[1]);
      if (!Number.isFinite(px) || !Number.isFinite(py)) return;
      
      const defaultNodeSize = this.graphState.globalSettings.defaultNodeSize;
      
      // Check if a node already exists at this spot.
      const existing = this.graphState.nodes.find(node => 
        Math.hypot(px - node.x, py - node.y) < defaultNodeSize
      );
      
      if (!existing) {
        const newNode = this.graphState.createNode(px, py);
        this.pinNewNode(newNode);
        this.graphState.createLink(this.graphState.selectedNode, newNode);
        this.renderer.updateGraph();
        
        // If SHIFT is held, select the new node.
        if (event.shiftKey) {
          this.graphState.selectNode(newNode);
          this.renderer.updateGraph();
          
          // Emit a custom event.
          const nodeSelectEvent = new CustomEvent('node-selected', { 
            detail: { node: newNode } 
          });
          eventBus.emit('node-selected', { node: newNode });
        }
      }
    }
  }

  getGraphPoint(event) {
    const svgElement = this.svg?.node();
    if (!svgElement) return null;

    const isValidPoint = p =>
      Array.isArray(p) &&
      p.length >= 2 &&
      Number.isFinite(p[0]) &&
      Number.isFinite(p[1]);

    const safePointer = (evt, node) => {
      if (!node) return null;
      try {
        const p = d3.pointer(evt, node);
        return isValidPoint(p) ? p : null;
      } catch (e) {
        return null;
      }
    };

    const transform = d3.zoomTransform(svgElement);

    // 1) Pointer in SVG space then invert zoom.
    let point = safePointer(event, svgElement);
    if (isValidPoint(point)) {
      const adjusted = transform ? transform.invert(point) : point;
      if (isValidPoint(adjusted)) return adjusted;
    }

    // 2) X/Y coordinates (preferred) then clientX/clientY.
    const rawX = Number.isFinite(event?.x) ? event.x : (event?.clientX ?? event?.touches?.[0]?.clientX);
    const rawY = Number.isFinite(event?.y) ? event.y : (event?.clientY ?? event?.touches?.[0]?.clientY);

    if (Number.isFinite(rawX) && Number.isFinite(rawY)) {
      const rect = svgElement.getBoundingClientRect();
      const local = [rawX - rect.left, rawY - rect.top];
      const adjusted = transform ? transform.invert(local) : local;
      if (isValidPoint(adjusted)) return adjusted;
    }

    // 3) offsetX/offsetY (if the target is the SVG).
    const offsetX = event?.offsetX;
    const offsetY = event?.offsetY;
    if (event?.target === svgElement && Number.isFinite(offsetX) && Number.isFinite(offsetY)) {
      const adjusted = transform ? transform.invert([offsetX, offsetY]) : [offsetX, offsetY];
      if (isValidPoint(adjusted)) return adjusted;
    }

    if (isValidPoint(this.lastPointer)) return this.lastPointer;
    return null;
  }

  updateLastPointer(event) {
    const svgElement = this.svg?.node();
    if (!svgElement) return;
    const rawX = Number.isFinite(event?.x) ? event.x : (event?.clientX ?? event?.touches?.[0]?.clientX);
    const rawY = Number.isFinite(event?.y) ? event.y : (event?.clientY ?? event?.touches?.[0]?.clientY);
    if (!Number.isFinite(rawX) || !Number.isFinite(rawY)) return;
    const rect = svgElement.getBoundingClientRect();
    const local = [rawX - rect.left, rawY - rect.top];
    const transform = d3.zoomTransform(svgElement);
    const adjusted = transform ? transform.invert(local) : local;
    if (Array.isArray(adjusted) && Number.isFinite(adjusted[0]) && Number.isFinite(adjusted[1])) {
      this.lastPointer = adjusted;
      this.graphState.lastPointer = adjusted;
    }
  }

  /**
   * Initialize keyboard handlers.
   */
  initKeyboardHandlers() {
    window.addEventListener('keyup', event => {
      // Delete with Delete or Backspace.
      const isEditable = ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target?.tagName) || event.target?.isContentEditable;
      if (!isEditable && event.ctrlKey && ['Delete', 'Backspace'].includes(event.key)) {
        let didDelete = false;
        if (this.graphState.selectedNode) {
          this.graphState.deleteNode(this.graphState.selectedNode);
          didDelete = true;
        }
        if (this.graphState.selectedLink) {
          this.graphState.deleteLink(this.graphState.selectedLink);
          didDelete = true;
        }
        if (didDelete) {
          // Force deselection and hide forms.
          this.graphState.clearSelection();
          eventBus.emit('selection-cleared');
        }
        this.renderer.updateGraph();
      }
      
      // Clear selection with Escape.
      if (event.key === 'Escape') {
        this.graphState.clearSelection();
        this.renderer.updateGraph();
        
        // Emit a custom event.
        eventBus.emit('selection-cleared');
      }
    });
    
    // Shortcuts Ctrl+Z / Ctrl+Y.
    window.addEventListener('keydown', event => {
      // Undo
      if (event.ctrlKey && !event.shiftKey && (event.key === 'z' || event.key === 'Z')) {
        eventBus.emit('undo-requested');
        event.preventDefault();
      }
      
      // Redo
      if (event.ctrlKey && (event.key === 'y' || event.key === 'Y')) {
        eventBus.emit('redo-requested');
        event.preventDefault();
      }
    });
  }

  pinNewNode(node) {
    if (!node) return;
    node.fx = node.x;
    node.fy = node.y;
    // Release quickly to let the simulation act afterward.
    setTimeout(() => {
      if (!node) return;
      delete node.fx;
      delete node.fy;
    }, 300);
  }
}
