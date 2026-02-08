/**
 * Gere les interactions utilisateur avec le graphe
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
    
    // attacher handlers immdiatement et apres chaque updateGraph
    this.attachInteractionHandlers();
    eventBus.on('graph-updated', () => this.attachInteractionHandlers());
    
    // Activer le zoom
    this.renderer.enableZoom();
    
    // Garde une trace si un noeud a t rcemment double-cliqu pour viter de creer un nouveau noeud
    this.nodeDoubleClicked = false;
    this.lastPointer = null;
  }
  
  /**
   * Initialise les gestionnaires de glisser-dposer
   */
  initDragHandlers() {
    const drag = this.createDragBehavior();
    
    // Appliquer le comportement de drag aux noeuds existants et futurs
    this.svg.selectAll('.node').call(drag);
  }
  
  /**
   * Initialise les gestionnaires de clic
   */
  initClickHandlers() {
    // Suivre la derniere position souris dans l'espace du graphe
    this.svg.on('mousemove', event => {
      this.updateLastPointer(event);
    });

    // Double-clic sur une zone vide pour creer un noeud
    this.svg.on('dblclick', event => {
      // verifier si l'evenement provient d'un noeud
      if (event.target.closest('.node')) {
        event.stopPropagation();
        return;
      }
      this.handleSvgDblClick(event);
    });
    
    // CTRL+clic pour creer un noeud et le relier
    this.svg.on('mousedown', event => this.handleSvgMouseDown(event));
  }
  
  /**
   * Applique drag, click et dblclick aux lments SVG
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
   * Cre le comportement de glisser-dposer
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
          // mise  jour du champ X personnalis
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
          // mise  jour du champ Y personnalis
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
   * Gere les clics sur les noeuds
   */
  handleNodeClick(event, d) {
    // verifier que d est un objet valide
    if (!d || typeof d !== 'object') {
      console.error("Erreur: noeud invalide:", d);
      return;
    }
    
    // S'assurer que le noeud a un identifiant
    if (!d.id) {
      console.error("Erreur: noeud sans identifiant:", d);
      return;
    }
    
    // Permettre de creer un auto-lien avec Alt+Click
    if (event.altKey && this.graphState.selectedNode) {
      // Si on fait Alt+Click sur le meme noeud que le noeud selectionn
      if (d.id === this.graphState.selectedNode.id) {
        const newLink = this.graphState.createLink(d, d); // Auto-lien
        this.renderer.updateGraph();
        this.graphState.clearSelection();
        return;
      }
    }
    
    // CTRL+Click sur un noeud pour creer un lien
    if (event.ctrlKey && this.graphState.selectedNode) {
      // creer un lien entre le noeud selectionn et le noeud cliqu
      this.graphState.createLink(this.graphState.selectedNode, d);
      this.renderer.updateGraph();
      
      // Important: Ne pas changer la selection et ne pas effacer selectedNode
      // pour permettre de creer plusieurs liens  partir du meme noeud source
      
      // Stopper la propagation pour viter de dclencher d'autres gestionnaires
      event.stopPropagation();
      return;
    }
    
    // Clic normal pour selectionner ou dselectionner
    if (this.graphState.selectedNode === d) {
      // Dselectionner explicitement
      this.graphState.clearSelection();
      
      // Dclencher l'evenement de dselection explicitement
      eventBus.emit('selection-cleared');
    } else {
      // selectionner le nouveau noeud
      this.graphState.selectNode(d);
      
      // mettre un evenement personnalis pour la selection
      eventBus.emit('node-selected', { node: d });
    }
    
    this.renderer.updateGraph();
  }

  /**
   * Gere les clics sur les liens
   */
  handleLinkClick(event, d) {
    if (this.graphState.selectedLink === d) {
      this.graphState.clearSelection();
    } else {
      this.graphState.selectLink(d);
    }
    
    this.renderer.updateGraph();
    
    // mettre un evenement personnalis
    eventBus.emit('link-selected', { link: this.graphState.selectedLink });
  }
  
  /**
   * Gere le double-clic sur le SVG
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
    
    // selectionner explicitement le nouveau noeud
    this.graphState.clearSelection();
    this.graphState.selectNode(newNode);
    
    // Dclencher un evenement spcifique pour la creation
    eventBus.emit('node-created', { node: newNode });
    
    this.renderer.updateGraph();
  }
  
  /**
   * Gere le clic souris sur le SVG
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
      
      // verifier s'il existe dj un noeud  cet endroit
      const existing = this.graphState.nodes.find(node => 
        Math.hypot(px - node.x, py - node.y) < defaultNodeSize
      );
      
      if (!existing) {
        const newNode = this.graphState.createNode(px, py);
        this.pinNewNode(newNode);
        this.graphState.createLink(this.graphState.selectedNode, newNode);
        this.renderer.updateGraph();
        
        // Si SHIFT est maintenu, selectionner le nouveau noeud
        if (event.shiftKey) {
          this.graphState.selectNode(newNode);
          this.renderer.updateGraph();
          
          // mettre un evenement personnalis
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

    // 1) Pointer dans l'espace SVG puis inversion du zoom
    let point = safePointer(event, svgElement);
    if (isValidPoint(point)) {
      const adjusted = transform ? transform.invert(point) : point;
      if (isValidPoint(adjusted)) return adjusted;
    }

    // 2) Coordonnees x/y (preferees) puis clientX/clientY
    const rawX = Number.isFinite(event?.x) ? event.x : (event?.clientX ?? event?.touches?.[0]?.clientX);
    const rawY = Number.isFinite(event?.y) ? event.y : (event?.clientY ?? event?.touches?.[0]?.clientY);

    if (Number.isFinite(rawX) && Number.isFinite(rawY)) {
      const rect = svgElement.getBoundingClientRect();
      const local = [rawX - rect.left, rawY - rect.top];
      const adjusted = transform ? transform.invert(local) : local;
      if (isValidPoint(adjusted)) return adjusted;
    }

    // 3) offsetX/offsetY (si la cible est bien le SVG)
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
   * Initialise les gestionnaires de clavier
   */
  initKeyboardHandlers() {
    window.addEventListener('keyup', event => {
      // Suppression avec Delete ou Backspace
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
          // forcer la dselection et cacher les formulaires
          this.graphState.clearSelection();
          eventBus.emit('selection-cleared');
        }
        this.renderer.updateGraph();
      }
      
      // Annulation de la selection avec Escape
      if (event.key === 'Escape') {
        this.graphState.clearSelection();
        this.renderer.updateGraph();
        
        // mettre un evenement personnalis
        eventBus.emit('selection-cleared');
      }
    });
    
    // Raccourcis Ctrl+Z / Ctrl+Y
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
    // Relacher rapidement pour laisser la simulation agir ensuite
    setTimeout(() => {
      if (!node) return;
      delete node.fx;
      delete node.fy;
    }, 300);
  }
}
