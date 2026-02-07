/**
 * Gère les interactions utilisateur avec le graphe
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
    
    // attacher handlers immédiatement et après chaque updateGraph
    this.attachInteractionHandlers();
    eventBus.on('graph-updated', () => this.attachInteractionHandlers());
    
    // Activer le zoom
    this.renderer.enableZoom();
    
    // Garde une trace si un nœud a été récemment double-cliqué pour éviter de créer un nouveau nœud
    this.nodeDoubleClicked = false;
  }
  
  /**
   * Initialise les gestionnaires de glisser-déposer
   */
  initDragHandlers() {
    const drag = this.createDragBehavior();
    
    // Appliquer le comportement de drag aux nœuds existants et futurs
    this.svg.selectAll('.node').call(drag);
  }
  
  /**
   * Initialise les gestionnaires de clic
   */
  initClickHandlers() {
    // Double-clic sur une zone vide pour créer un nœud
    this.svg.on('dblclick', event => {
      // Vérifier si l'événement provient d'un nœud
      if (event.target.closest('.node')) {
        event.stopPropagation();
        return;
      }
      this.handleSvgDblClick(event);
    });
    
    // CTRL+clic pour créer un nœud et le relier
    this.svg.on('mousedown', event => this.handleSvgMouseDown(event));
  }
  
  /**
   * Applique drag, click et dblclick aux éléments SVG
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
   * Crée le comportement de glisser-déposer
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
          // mise à jour du champ X personnalisé
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
                label: `Move node ${xField} (${oldX} → ${newX})`
              }
            });
            d[xField] = newX;
          }
          // mise à jour du champ Y personnalisé
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
                label: `Move node ${yField} (${oldY} → ${newY})`
              }
            });
            d[yField] = newY;
          }
        }
        delete d.initialPosition;
      });
  }
  
  /**
   * Gère les clics sur les nœuds
   */
  handleNodeClick(event, d) {
    // Vérifier que d est un objet valide
    if (!d || typeof d !== 'object') {
      console.error("Erreur: nœud invalide:", d);
      return;
    }
    
    // S'assurer que le nœud a un identifiant
    if (!d.id) {
      console.error("Erreur: nœud sans identifiant:", d);
      return;
    }
    
    // Permettre de créer un auto-lien avec Alt+Click
    if (event.altKey && this.graphState.selectedNode) {
      // Si on fait Alt+Click sur le même nœud que le nœud sélectionné
      if (d.id === this.graphState.selectedNode.id) {
        const newLink = this.graphState.createLink(d, d); // Auto-lien
        this.renderer.updateGraph();
        this.graphState.clearSelection();
        return;
      }
    }
    
    // CTRL+Click sur un nœud pour créer un lien
    if (event.ctrlKey && this.graphState.selectedNode) {
      // Créer un lien entre le nœud sélectionné et le nœud cliqué
      this.graphState.createLink(this.graphState.selectedNode, d);
      this.renderer.updateGraph();
      
      // Important: Ne pas changer la sélection et ne pas effacer selectedNode
      // pour permettre de créer plusieurs liens à partir du même nœud source
      
      // Stopper la propagation pour éviter de déclencher d'autres gestionnaires
      event.stopPropagation();
      return;
    }
    
    // Clic normal pour sélectionner ou désélectionner
    if (this.graphState.selectedNode === d) {
      // Désélectionner explicitement
      this.graphState.clearSelection();
      
      // Déclencher l'événement de désélection explicitement
      eventBus.emit('selection-cleared');
    } else {
      // Sélectionner le nouveau nœud
      this.graphState.selectNode(d);
      
      // Émettre un événement personnalisé pour la sélection
      eventBus.emit('node-selected', { node: d });
    }
    
    this.renderer.updateGraph();
  }

  /**
   * Gère les clics sur les liens
   */
  handleLinkClick(event, d) {
    if (this.graphState.selectedLink === d) {
      this.graphState.clearSelection();
    } else {
      this.graphState.selectLink(d);
    }
    
    this.renderer.updateGraph();
    
    // Émettre un événement personnalisé
    eventBus.emit('link-selected', { link: this.graphState.selectedLink });
  }
  
  /**
   * Gère le double-clic sur le SVG
   */
  handleSvgDblClick(event) {
    // Utiliser d3.pointer au lieu de event.clientX/clientY pour obtenir les coordonnées correctes
    const transform = d3.zoomTransform(this.svg.node());
    const point = transform.invert(d3.pointer(event));
    const newNode = this.graphState.createNode(point[0], point[1]);
    this.pinNewNode(newNode);
    
    // Sélectionner explicitement le nouveau nœud
    this.graphState.clearSelection();
    this.graphState.selectNode(newNode);
    
    // Déclencher un événement spécifique pour la création
    eventBus.emit('node-created', { node: newNode });
    
    this.renderer.updateGraph();
  }
  
  /**
   * Gère le clic souris sur le SVG
   */
  handleSvgMouseDown(event) {
    if (event.ctrlKey && this.graphState.selectedNode) {
      // Utiliser d3.pointer pour obtenir les coordonnées correctes dans l'espace SVG
      const svgElement = this.svg.node();
      const point = d3.pointer(event, svgElement);
      
      // Appliquer la transformation inverse du zoom/pan si elle existe
      const transform = d3.zoomTransform(svgElement);
      const adjustedPoint = transform.invert(point);
      if (!Number.isFinite(adjustedPoint[0]) || !Number.isFinite(adjustedPoint[1])) return;
      
      const defaultNodeSize = this.graphState.globalSettings.defaultNodeSize;
      
      // Vérifier s'il existe déjà un nœud à cet endroit
      const existing = this.graphState.nodes.find(node => 
        Math.hypot(adjustedPoint[0] - node.x, adjustedPoint[1] - node.y) < defaultNodeSize
      );
      
      if (!existing) {
        const newNode = this.graphState.createNode(adjustedPoint[0], adjustedPoint[1]);
        this.pinNewNode(newNode);
        this.graphState.createLink(this.graphState.selectedNode, newNode);
        this.renderer.updateGraph();
        
        // Si SHIFT est maintenu, sélectionner le nouveau nœud
        if (event.shiftKey) {
          this.graphState.selectNode(newNode);
          this.renderer.updateGraph();
          
          // Émettre un événement personnalisé
          const nodeSelectEvent = new CustomEvent('node-selected', { 
            detail: { node: newNode } 
          });
          eventBus.emit('node-selected', { node: newNode });
        }
      }
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
          // forcer la désélection et cacher les formulaires
          this.graphState.clearSelection();
          eventBus.emit('selection-cleared');
        }
        this.renderer.updateGraph();
      }
      
      // Annulation de la sélection avec Escape
      if (event.key === 'Escape') {
        this.graphState.clearSelection();
        this.renderer.updateGraph();
        
        // Émettre un événement personnalisé
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
    // RelÃ¢cher rapidement pour laisser la simulation agir ensuite
    setTimeout(() => {
      if (!node) return;
      delete node.fx;
      delete node.fy;
    }, 300);
  }
}
