/**
 * Gère les interactions utilisateur avec le graphe
 */
import { performAction } from '../state/undo_redo.js';

export class InteractionManager {
  constructor(graphState, renderer, svgSelection) {
    this.graphState = graphState;
    this.renderer = renderer;
    this.svg = svgSelection;
    
    this.initDragHandlers();
    this.initClickHandlers();
    this.initKeyboardHandlers();
    
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
    
    // Observer les nouveaux nœuds pour leur ajouter le comportement de drag
    this.renderer.updateGraph = (originalMethod => {
      return function() {
        const result = originalMethod.apply(this, arguments);
        if (result && result.nodeEnter) {
          result.nodeEnter.call(drag);
        }
        return result;
      };
    })(this.renderer.updateGraph);
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
   * Initialise les gestionnaires de clic
   */
  initClickHandlers() {
    // IMPORTANT: Conserver une référence à l'instance courante pour les callbacks
    const self = this;
    
    // Observer les nouveaux nœuds et liens pour leur ajouter les gestionnaires
    this.renderer.updateGraph = (originalMethod => {
      return function() {
        const result = originalMethod.apply(this, arguments);
        
        if (result) {
          if (result.nodeEnter) {
            // Gérer le simple clic
            result.nodeEnter.on('click', function(event, d) {
              self.handleNodeClick(event, d);
            });
            
            // Gérer le double clic sur les nœuds
            result.nodeEnter.on('dblclick', function(event, d) {
              event.stopPropagation(); // Empêcher la propagation au SVG
              self.nodeDoubleClicked = true;
              setTimeout(() => { self.nodeDoubleClicked = false; }, 300);
              console.log("Node double-clicked");
            });
          }
          
          if (result.linkEnter) {
            result.linkEnter.on('click', function(event, d) {
              self.handleLinkClick(event, d);
            });
          }
          
          if (result.labelEnter) {
            result.labelEnter.on('click', function(event, d) {
              self.handleLinkClick(event, d);
            });
          }
        }
        
        return result;
      };
    })(this.renderer.updateGraph);
    
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
      window.dispatchEvent(new CustomEvent('selection-cleared'));
    } else {
      // Sélectionner le nouveau nœud
      this.graphState.selectNode(d);
      
      // Émettre un événement personnalisé pour la sélection
      const nodeSelectEvent = new CustomEvent('node-selected', { 
        detail: { node: d } 
      });
      window.dispatchEvent(nodeSelectEvent);
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
    const linkSelectEvent = new CustomEvent('link-selected', { 
      detail: { link: this.graphState.selectedLink } 
    });
    window.dispatchEvent(linkSelectEvent);
  }
  
  /**
   * Gère le double-clic sur le SVG
   */
  handleSvgDblClick(event) {
    const transform = d3.zoomTransform(this.svg.node());
    const point = transform.invert([event.clientX, event.clientY]);
    const newNode = this.graphState.createNode(point[0], point[1]);
    
    // Sélectionner explicitement le nouveau nœud
    this.graphState.clearSelection();
    this.graphState.selectNode(newNode);
    
    // Déclencher un événement spécifique pour la création
    window.dispatchEvent(new CustomEvent('node-created', { 
      detail: { node: newNode } 
    }));
    
    this.renderer.updateGraph();
  }
  
  /**
   * Gère le clic souris sur le SVG
   */
  handleSvgMouseDown(event) {
    if (event.ctrlKey && this.graphState.selectedNode) {
      const transform = d3.zoomTransform(this.svg.node());
      const point = transform.invert(d3.pointer(event));
      const defaultNodeSize = this.graphState.globalSettings.defaultNodeSize;
      
      // Vérifier s'il existe déjà un nœud à cet endroit
      const existing = this.graphState.nodes.find(node => 
        Math.hypot(point[0] - node.x, point[1] - node.y) < defaultNodeSize
      );
      
      if (!existing) {
        const newNode = this.graphState.createNode(point[0], point[1]);
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
          window.dispatchEvent(nodeSelectEvent);
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
      if (['Delete', 'Backspace'].includes(event.key)) {
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
          window.dispatchEvent(new CustomEvent('selection-cleared'));
        }
        this.renderer.updateGraph();
      }
      
      // Annulation de la sélection avec Escape
      if (event.key === 'Escape') {
        this.graphState.clearSelection();
        this.renderer.updateGraph();
        
        // Émettre un événement personnalisé
        const clearEvent = new CustomEvent('selection-cleared');
        window.dispatchEvent(clearEvent);
      }
    });
    
    // Raccourcis Ctrl+Z / Ctrl+Y
    window.addEventListener('keydown', event => {
      // Undo
      if (event.ctrlKey && !event.shiftKey && (event.key === 'z' || event.key === 'Z')) {
        const undoEvent = new CustomEvent('undo-requested');
        window.dispatchEvent(undoEvent);
        event.preventDefault();
      }
      
      // Redo
      if (event.ctrlKey && (event.key === 'y' || event.key === 'Y')) {
        const redoEvent = new CustomEvent('redo-requested');
        window.dispatchEvent(redoEvent);
        event.preventDefault();
      }
    });
  }
}
