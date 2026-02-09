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
    this.lastPointer = null;
    this.groupDrag = null;
    this.marquee = {
      active: false,
      start: null,
      current: null,
      additive: false,
      moved: false,
      rect: null
    };
    this.boundMarqueeMouseMove = event => this.handleMarqueeMouseMove(event);
    this.boundMarqueeMouseUp = event => this.handleMarqueeMouseUp(event);
    
    this.initDragHandlers();
    this.initClickHandlers();
    this.initKeyboardHandlers();
    
    // Attach handlers immediately and after each updateGraph.
    this.attachInteractionHandlers();
    eventBus.on('graph-updated', () => this.attachInteractionHandlers());
    
    // Enable zoom.
    this.renderer.enableZoom();
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
      if (event.target.closest('.node, .link, .link-label')) {
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
      .on('dblclick', event => {
        event.stopPropagation();
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
      .clickDistance(3)
      .on('start', (event, d) => {
        if (!event.active) this.renderer.simulation.alphaTarget(0.3).restart();
        this.tryStartGroupNodeDrag(event, d);
        if (!d.initialPosition) {
          d.initialPosition = { x: d.x, y: d.y };
        }
      })
      .on('drag', (event, d) => {
        if (this.isGroupDragAnchor(d)) {
          this.applyGroupNodeDrag(event);
          return;
        }
        d.x = event.x;
        d.y = event.y;
      })
      .on('end', (event, d) => {
        if (!event.active) this.renderer.simulation.alphaTarget(0);
        if (this.isGroupDragAnchor(d)) {
          this.commitGroupNodeDrag();
          this.clearGroupDrag();
          delete d.initialPosition;
          return;
        }
        const pos0 = d.initialPosition;
        if (pos0 && (d.x !== pos0.x || d.y !== pos0.y)) {
          this.commitNodePositionChanges(d, pos0.x, pos0.y, d.x, d.y, 'Move node');
        }
        delete d.initialPosition;
      });
  }

  tryStartGroupNodeDrag(event, anchorNode) {
    const sourceEvent = event?.sourceEvent || event;
    const hasModifier = !!(sourceEvent?.ctrlKey || sourceEvent?.shiftKey);
    if (!hasModifier) {
      this.clearGroupDrag();
      return;
    }

    const selectedNodes = this.getSelectedNodes().filter(node => node?.id != null);
    if (selectedNodes.length < 2) {
      this.clearGroupDrag();
      return;
    }

    const anchorId = String(anchorNode?.id ?? '');
    const isAnchorSelected = selectedNodes.some(node => String(node.id) === anchorId);
    if (!anchorId || !isAnchorSelected) {
      this.clearGroupDrag();
      return;
    }

    const initialPositions = new Map();
    selectedNodes.forEach(node => {
      const x = Number(node.x);
      const y = Number(node.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      initialPositions.set(String(node.id), { x, y });
      node.initialPosition = { x, y };
    });

    const anchorInitial = initialPositions.get(anchorId);
    if (!anchorInitial) {
      this.clearGroupDrag();
      return;
    }

    this.groupDrag = {
      active: true,
      anchorId,
      anchorInitial,
      nodes: selectedNodes,
      initialPositions
    };
  }

  isGroupDragAnchor(node) {
    if (!this.groupDrag?.active || !node?.id) return false;
    return String(this.groupDrag.anchorId) === String(node.id);
  }

  applyGroupNodeDrag(event) {
    if (!this.groupDrag?.active) return;
    const dx = Number(event.x) - this.groupDrag.anchorInitial.x;
    const dy = Number(event.y) - this.groupDrag.anchorInitial.y;
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;

    this.groupDrag.nodes.forEach(node => {
      const start = this.groupDrag.initialPositions.get(String(node.id));
      if (!start) return;
      node.x = start.x + dx;
      node.y = start.y + dy;
    });
  }

  commitGroupNodeDrag() {
    if (!this.groupDrag?.active) return;
    this.groupDrag.nodes.forEach(node => {
      const start = this.groupDrag.initialPositions.get(String(node.id));
      if (!start) return;
      this.commitNodePositionChanges(node, start.x, start.y, node.x, node.y, 'Move selected nodes');
    });
  }

  clearGroupDrag() {
    if (!this.groupDrag) return;
    if (Array.isArray(this.groupDrag.nodes)) {
      this.groupDrag.nodes.forEach(node => {
        if (node && Object.prototype.hasOwnProperty.call(node, 'initialPosition')) {
          delete node.initialPosition;
        }
      });
    }
    this.groupDrag = null;
  }

  commitNodePositionChanges(node, oldX, oldY, newX, newY, labelPrefix = 'Move node') {
    if (!node?.id) return;
    const { xField, yField } = this.graphState.globalSettings;
    const fromX = Number(oldX);
    const fromY = Number(oldY);
    const toX = Number(newX);
    const toY = Number(newY);

    if (xField && Number.isFinite(fromX) && Number.isFinite(toX) && fromX !== toX) {
      performAction({
        type: "update_node",
        data: {
          nodeId: node.id,
          field: xField,
          from: fromX,
          to: toX,
          label: `${labelPrefix} ${xField} (${fromX} -> ${toX})`
        }
      });
      node[xField] = toX;
    }

    if (yField && Number.isFinite(fromY) && Number.isFinite(toY) && fromY !== toY) {
      performAction({
        type: "update_node",
        data: {
          nodeId: node.id,
          field: yField,
          from: fromY,
          to: toY,
          label: `${labelPrefix} ${yField} (${fromY} -> ${toY})`
        }
      });
      node[yField] = toY;
    }
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
    const activeSelectedNode = this.getActiveSelectedNode();
    
    // Allow creating a self-link with Alt+Click.
    if (event.altKey && activeSelectedNode) {
      // If Alt+Click is on the same selected node.
      if (String(d.id) === String(activeSelectedNode.id)) {
        this.graphState.createLink(d, d); // Self-link.
        this.renderer.updateGraph();
        this.graphState.clearSelection();
        eventBus.emit('selection-cleared');
        return;
      }
    }
    
    // CTRL+Click on a node to create a link.
    if (event.ctrlKey && activeSelectedNode) {
      // Create a link between the selected node and the clicked node.
      this.graphState.createLink(activeSelectedNode, d);
      this.renderer.updateGraph();
      
      // Important: do not change selection or clear selectedNode.
      // To allow creating multiple links from the same source node.
      
      // Stop propagation to avoid triggering other handlers.
      event.stopPropagation();
      return;
    }

    // Shift+click toggles node membership in the current selection.
    if (event.shiftKey) {
      this.graphState.selectNode(d, { toggle: true, autoFocus: false });
      this.emitSelectionEvents();
      this.renderer.updateGraph();
      event.stopPropagation();
      return;
    }

    const selectedNodes = this.getSelectedNodes();
    const selectedLinks = this.getSelectedLinks();
    const isOnlySelectedNode =
      selectedNodes.length === 1 &&
      selectedLinks.length === 0 &&
      String(selectedNodes[0].id) === String(d.id);

    // Normal click: select only this node (or clear if it is the sole selection).
    if (isOnlySelectedNode) {
      this.graphState.clearSelection();
    } else {
      this.graphState.selectNode(d, { clearLinks: true, autoFocus: true });
    }

    this.emitSelectionEvents();
    this.renderer.updateGraph();
  }

  /**
   * Handle link clicks.
   */
  handleLinkClick(event, d) {
    if (!d || typeof d !== 'object' || !d.id) return;

    // Shift+click toggles link membership in the current selection.
    if (event.shiftKey) {
      this.graphState.selectLink(d, { toggle: true, autoFocus: false });
      this.emitSelectionEvents();
      this.renderer.updateGraph();
      event.stopPropagation();
      return;
    }

    const selectedNodes = this.getSelectedNodes();
    const selectedLinks = this.getSelectedLinks();
    const isOnlySelectedLink =
      selectedLinks.length === 1 &&
      selectedNodes.length === 0 &&
      String(selectedLinks[0].id) === String(d.id);

    // Normal click: select only this link (or clear if it is the sole selection).
    if (isOnlySelectedLink) {
      this.graphState.clearSelection();
    } else {
      this.graphState.selectLink(d, { clearNodes: true, autoFocus: true });
    }

    this.emitSelectionEvents();
    this.renderer.updateGraph();
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
    this.graphState.setSelection({
      nodes: [newNode],
      links: [],
      activeNode: newNode,
      activeLink: null
    });
    
    // Emit a specific event for creation.
    eventBus.emit('node-created', { node: newNode });
    
    this.renderer.updateGraph();
  }
  
  /**
   * Handle mouse click on the SVG.
   */
  handleSvgMouseDown(event) {
    if (event.button !== 0) return;

    const interactiveTarget = !!event.target?.closest?.('.node, .link, .link-label');
    const activeSelectedNode = this.getActiveSelectedNode();

    if (event.ctrlKey && activeSelectedNode && !interactiveTarget) {
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
        this.graphState.createLink(activeSelectedNode, newNode);
        this.renderer.updateGraph();
        
        // If SHIFT is held, select the new node.
        if (event.shiftKey) {
          this.graphState.selectNode(newNode, { additive: true, autoFocus: false });
          this.emitSelectionEvents();
          this.renderer.updateGraph();
        }
      }
      return;
    }

    if (!interactiveTarget) {
      this.beginMarqueeSelection(event);
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

  beginMarqueeSelection(event) {
    this.updateLastPointer(event);
    const start = this.getGraphPoint(event);
    if (!start) return;

    this.marquee.active = true;
    this.marquee.start = start;
    this.marquee.current = start;
    this.marquee.additive = !!event.shiftKey;
    this.marquee.moved = false;
    this.ensureMarqueeRect();
    this.updateMarqueeRect(start, start);

    window.addEventListener('mousemove', this.boundMarqueeMouseMove);
    window.addEventListener('mouseup', this.boundMarqueeMouseUp);
    event.preventDefault();
  }

  handleMarqueeMouseMove(event) {
    if (!this.marquee.active) return;
    this.updateLastPointer(event);
    const point = this.getGraphPoint(event);
    if (!point) return;

    this.marquee.current = point;
    const dx = point[0] - this.marquee.start[0];
    const dy = point[1] - this.marquee.start[1];
    if (Math.abs(dx) >= 3 || Math.abs(dy) >= 3) {
      this.marquee.moved = true;
    }
    this.updateMarqueeRect(this.marquee.start, point);
    event.preventDefault();
  }

  handleMarqueeMouseUp(event) {
    if (!this.marquee.active) return;
    this.updateLastPointer(event);

    const end = this.getGraphPoint(event) || this.marquee.current || this.marquee.start;
    const start = this.marquee.start;
    const moved = this.marquee.moved;
    const additive = this.marquee.additive;

    this.stopMarqueeSelection();

    if (!start || !end) return;

    if (!moved) {
      if (!additive) {
        this.graphState.clearSelection();
        this.emitSelectionEvents();
        this.renderer.updateGraph();
      }
      return;
    }

    const bounds = this.getSelectionBounds(start, end);
    this.applyMarqueeSelection(bounds, additive);
  }

  stopMarqueeSelection() {
    this.marquee.active = false;
    this.marquee.start = null;
    this.marquee.current = null;
    this.marquee.additive = false;
    this.marquee.moved = false;
    if (this.marquee.rect) {
      this.marquee.rect.style('display', 'none');
    }
    window.removeEventListener('mousemove', this.boundMarqueeMouseMove);
    window.removeEventListener('mouseup', this.boundMarqueeMouseUp);
  }

  ensureMarqueeRect() {
    if (this.marquee.rect || !this.renderer?.g) return;
    this.marquee.rect = this.renderer.g
      .append('rect')
      .attr('class', 'selection-marquee')
      .attr('pointer-events', 'none')
      .style('display', 'none');
  }

  updateMarqueeRect(start, end) {
    if (!this.marquee.rect || !start || !end) return;
    const bounds = this.getSelectionBounds(start, end);
    this.marquee.rect
      .attr('x', bounds.minX)
      .attr('y', bounds.minY)
      .attr('width', bounds.width)
      .attr('height', bounds.height)
      .style('display', '');
  }

  getSelectionBounds(start, end) {
    const minX = Math.min(start[0], end[0]);
    const maxX = Math.max(start[0], end[0]);
    const minY = Math.min(start[1], end[1]);
    const maxY = Math.max(start[1], end[1]);
    return {
      minX,
      maxX,
      minY,
      maxY,
      width: maxX - minX,
      height: maxY - minY
    };
  }

  applyMarqueeSelection(bounds, additive = false) {
    const nodesInBox = this.graphState.nodes.filter(node => this.isPointInsideRect(node?.x, node?.y, bounds));
    const linksInBox = this.graphState.links.filter(link => this.isLinkInsideRect(link, bounds));

    if (additive) {
      const mergedNodes = this.mergeById(this.getSelectedNodes(), nodesInBox);
      const mergedLinks = this.mergeById(this.getSelectedLinks(), linksInBox);
      const activeNode = nodesInBox.length ? nodesInBox[nodesInBox.length - 1] : this.getActiveSelectedNode();
      const activeLink = linksInBox.length ? linksInBox[linksInBox.length - 1] : this.getActiveSelectedLink();
      this.graphState.setSelection({
        nodes: mergedNodes,
        links: mergedLinks,
        activeNode,
        activeLink
      });
    } else {
      this.graphState.setSelection({
        nodes: nodesInBox,
        links: linksInBox,
        activeNode: nodesInBox.length ? nodesInBox[nodesInBox.length - 1] : null,
        activeLink: linksInBox.length ? linksInBox[linksInBox.length - 1] : null
      });
    }

    this.emitSelectionEvents();
    this.renderer.updateGraph();
  }

  mergeById(baseItems, newItems) {
    const merged = [];
    const seen = new Set();
    (baseItems || []).concat(newItems || []).forEach(item => {
      if (!item || item.id == null) return;
      const id = String(item.id);
      if (seen.has(id)) return;
      seen.add(id);
      merged.push(item);
    });
    return merged;
  }

  isPointInsideRect(x, y, bounds) {
    if (!Number.isFinite(x) || !Number.isFinite(y) || !bounds) return false;
    return x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY;
  }

  isLinkInsideRect(link, bounds) {
    if (!link?.source || !link?.target) return false;
    const sx = Number(link.source.x);
    const sy = Number(link.source.y);
    const tx = Number(link.target.x);
    const ty = Number(link.target.y);
    if (![sx, sy, tx, ty].every(Number.isFinite)) return false;

    if (this.isPointInsideRect(sx, sy, bounds) || this.isPointInsideRect(tx, ty, bounds)) return true;
    if (String(link.source.id) === String(link.target.id)) return this.isPointInsideRect(sx, sy, bounds);
    return this.segmentIntersectsRect(sx, sy, tx, ty, bounds);
  }

  segmentIntersectsRect(x1, y1, x2, y2, bounds) {
    const edges = [
      [bounds.minX, bounds.minY, bounds.maxX, bounds.minY],
      [bounds.maxX, bounds.minY, bounds.maxX, bounds.maxY],
      [bounds.maxX, bounds.maxY, bounds.minX, bounds.maxY],
      [bounds.minX, bounds.maxY, bounds.minX, bounds.minY]
    ];
    return edges.some(edge => this.segmentsIntersect(x1, y1, x2, y2, edge[0], edge[1], edge[2], edge[3]));
  }

  segmentsIntersect(ax, ay, bx, by, cx, cy, dx, dy) {
    const epsilon = 1e-9;
    const orientation = (px, py, qx, qy, rx, ry) => {
      const value = (qy - py) * (rx - qx) - (qx - px) * (ry - qy);
      if (Math.abs(value) <= epsilon) return 0;
      return value > 0 ? 1 : 2;
    };
    const onSegment = (px, py, qx, qy, rx, ry) => {
      return qx <= Math.max(px, rx) + epsilon &&
        qx + epsilon >= Math.min(px, rx) &&
        qy <= Math.max(py, ry) + epsilon &&
        qy + epsilon >= Math.min(py, ry);
    };

    const o1 = orientation(ax, ay, bx, by, cx, cy);
    const o2 = orientation(ax, ay, bx, by, dx, dy);
    const o3 = orientation(cx, cy, dx, dy, ax, ay);
    const o4 = orientation(cx, cy, dx, dy, bx, by);

    if (o1 !== o2 && o3 !== o4) return true;
    if (o1 === 0 && onSegment(ax, ay, cx, cy, bx, by)) return true;
    if (o2 === 0 && onSegment(ax, ay, dx, dy, bx, by)) return true;
    if (o3 === 0 && onSegment(cx, cy, ax, ay, dx, dy)) return true;
    if (o4 === 0 && onSegment(cx, cy, bx, by, dx, dy)) return true;
    return false;
  }

  getSelectedNodes() {
    if (typeof this.graphState.getSelectedNodes === 'function') return this.graphState.getSelectedNodes();
    return this.graphState.selectedNode ? [this.graphState.selectedNode] : [];
  }

  getSelectedLinks() {
    if (typeof this.graphState.getSelectedLinks === 'function') return this.graphState.getSelectedLinks();
    return this.graphState.selectedLink ? [this.graphState.selectedLink] : [];
  }

  getActiveSelectedNode() {
    if (typeof this.graphState.getPrimarySelectedNode === 'function') return this.graphState.getPrimarySelectedNode();
    return this.graphState.selectedNode || null;
  }

  getActiveSelectedLink() {
    if (typeof this.graphState.getPrimarySelectedLink === 'function') return this.graphState.getPrimarySelectedLink();
    return this.graphState.selectedLink || null;
  }

  emitSelectionEvents() {
    const nodes = this.getSelectedNodes();
    const links = this.getSelectedLinks();
    if (!nodes.length && !links.length) {
      eventBus.emit('selection-cleared');
      return;
    }
    if (nodes.length) {
      eventBus.emit('node-selected', { node: this.getActiveSelectedNode(), nodes });
    }
    if (links.length) {
      eventBus.emit('link-selected', { link: this.getActiveSelectedLink(), links });
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
        const selectedNodes = this.getSelectedNodes();
        const selectedLinks = this.getSelectedLinks();
        let didDelete = false;

        const deletedNodeIds = new Set();
        selectedNodes.forEach(node => {
          if (!node?.id) return;
          this.graphState.deleteNode(node);
          deletedNodeIds.add(String(node.id));
          didDelete = true;
        });

        selectedLinks
          .filter(link => {
            const sourceId = String(link?.source?.id ?? '');
            const targetId = String(link?.target?.id ?? '');
            return !deletedNodeIds.has(sourceId) && !deletedNodeIds.has(targetId);
          })
          .forEach(link => {
            if (!link?.id) return;
            this.graphState.deleteLink(link);
            didDelete = true;
          });

        if (!didDelete && this.graphState.selectedNode) {
          this.graphState.deleteNode(this.graphState.selectedNode);
          didDelete = true;
        }
        if (!didDelete && this.graphState.selectedLink) {
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
