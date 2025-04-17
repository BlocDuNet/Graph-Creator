/**
 * Gestion des formulaires pour éditer les nœuds et les liens
 */
import { performAction } from '../state/undo_redo.js';

export class FormManager {
  constructor(graphState, renderer) {
    this.graphState = graphState;
    this.renderer = renderer;
    
    // Sélectionner les formulaires
    this.nodeForm = document.getElementById('node-form');
    this.linkForm = document.getElementById('link-form');
    
    // Stockage des inputs
    this.nodeInputs = {};
    this.linkInputs = {};
    
    // Initialiser les formulaires
    this.refreshForms();
    
    // Configurer les observateurs de sélection
    this.setupSelectionObservers();
  }
  
  /**
   * Configure les observateurs pour détecter les changements de sélection
   */
  setupSelectionObservers() {
    // Observer les changements de sélection dans graphState
    const originalSelectNode = this.graphState.selectNode;
    this.graphState.selectNode = (node) => {
      originalSelectNode.call(this.graphState, node);
      console.log("Node sélectionné via observer:", node);
      this.showNodeForm(node);
    };
    
    const originalSelectLink = this.graphState.selectLink;
    this.graphState.selectLink = (link) => {
      originalSelectLink.call(this.graphState, link);
      console.log("Link sélectionné via observer:", link);
      this.showLinkForm(link);
    };
    
    const originalClearSelection = this.graphState.clearSelection;
    this.graphState.clearSelection = () => {
      originalClearSelection.call(this.graphState);
      console.log("Sélection effacée via observer");
      this.hideAllForms();
    };
  }
  
  /**
   * Rafraîchit les formulaires avec les champs actuels
   */
  refreshForms() {
    this.createFormInputs(this.graphState.nodes, this.nodeForm, this.nodeInputs);
    this.createFormInputs(this.graphState.links, this.linkForm, this.linkInputs);
  }
  
  /**
   * Crée les champs de formulaire basés sur les données
   */
  createFormInputs(data, formElement, inputObject) {
    if (!formElement) return;
    
    // Vider le formulaire
    while (formElement.firstChild) {
      formElement.removeChild(formElement.firstChild);
    }
    
    // Récupérer les noms de champs
    const fieldNames = this.getFieldOptions(data);
    
    // Créer les champs
    fieldNames.forEach(fieldName => this.createField(fieldName, formElement, inputObject, data));
  }
  
  /**
   * Récupère les options de champs disponibles
   */
  getFieldOptions(data) {
    const excluded = ["vx", "vy", "fx", "fy", "index"];
    const fields = new Set();
    
    data.forEach(item => {
      Object.keys(item).forEach(key => {
        if (!excluded.includes(key)) fields.add(key);
      });
    });
    
    return Array.from(fields);
  }
  
  /**
   * Crée un champ de formulaire
   */
  createField(fieldName, formElement, inputObject, data) {
    const fieldDiv = document.createElement('div');
    
    // Créer le label
    const label = document.createElement('label');
    label.setAttribute('for', `${formElement.id}-${fieldName}`);
    label.textContent = `${fieldName}:`;
    fieldDiv.appendChild(label);
    
    // Créer l'input
    const input = document.createElement('input');
    input.setAttribute('type', 'text');
    input.setAttribute('id', `${formElement.id}-${fieldName}`);
    input.setAttribute('name', fieldName);
    
    // Ajouter un écouteur d'événement pour les modifications
    input.addEventListener('blur', () => {
      const newValue = input.value;
      
      // Déterminer si nous éditons un nœud ou un lien
      if (this.graphState.selectedNode && inputObject === this.nodeInputs) {
        const oldValue = this.graphState.selectedNode[fieldName] || "";
        if (newValue !== oldValue) {
          performAction({
            type: "update_node",
            data: {
              nodeId: this.graphState.selectedNode.id,
              field: fieldName,
              from: oldValue,
              to: newValue,
              label: `Rename node ${fieldName} (${oldValue} → ${newValue})`
            }
          });
        }
      } else if (this.graphState.selectedLink && inputObject === this.linkInputs) {
        const oldValue = this.graphState.selectedLink[fieldName] || "";
        if (newValue !== oldValue) {
          performAction({
            type: "update_link",
            data: {
              linkId: this.graphState.selectedLink.id,
              field: fieldName,
              from: oldValue,
              to: newValue,
              label: `Rename link ${fieldName} (${oldValue} → ${newValue})`
            }
          });
        }
      }
      
      this.renderer.updateGraph();
    });
    
    fieldDiv.appendChild(input);
    inputObject[fieldName] = input;
    
    // Ajouter un bouton de suppression pour les champs non essentiels
    if (!["id", "x", "y", "source", "target"].includes(fieldName)) {
      const button = document.createElement('button');
      button.setAttribute('type', 'button');
      button.setAttribute('tabindex', '-1');
      button.textContent = 'x';
      
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        this.showCustomConfirm(
          `Supprimer le champ "${fieldName}" pour tous les éléments ?`,
          () => {
            const isNodeField = inputObject === this.nodeInputs;
            const target = isNodeField ? "node" : "link";
            
            performAction({ 
              type: "remove_field", 
              data: { field: fieldName, target, label: `Remove field ${fieldName} from ${target}s` }
            });
            this.refreshForms();
            this.renderer.updateGraph();
          }
        );
      });
      
      fieldDiv.appendChild(button);
    }
    
    formElement.appendChild(fieldDiv);
  }
  
  /**
   * Affiche une confirmation personnalisée
   * @param {string} message
   * @param {Function} onConfirm
   */
  showCustomConfirm(message, onConfirm) {
    // Créer overlay
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    // Boîte de dialogue
    const box = document.createElement('div');
    box.className = 'confirm-modal';
    box.innerHTML = `
      <p>${message}</p>
      <button class="btn-yes">Oui</button>
      <button class="btn-no">Non</button>
    `;
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    // Handlers pour les boutons
    box.querySelector('.btn-yes').onclick = () => {
      onConfirm();
      cleanup();
    };
    box.querySelector('.btn-no').onclick = () => {
      cleanup();
    };

    // Écouteurs de touche pour valider sur Entrée
    const keyHandler = e => {
      if (e.key === 'Enter') {
        onConfirm();
        cleanup();
      }
    };
    document.addEventListener('keydown', keyHandler);

    // Fonction de nettoyage des handlers et suppression de l'overlay
    function cleanup() {
      document.body.removeChild(overlay);
      document.removeEventListener('keydown', keyHandler);
    }
  }
  
  /**
   * Affiche le formulaire d'édition de nœud
   */
  showNodeForm(node) {
    if (!this.nodeForm || !node) {
      console.warn("Impossible d'afficher le formulaire de nœud:", 
                   !this.nodeForm ? "formulaire manquant" : "nœud manquant");
      return;
    }
    
    console.log("Affichage du formulaire pour le nœud:", node.id);
    
    // Masquer tous les formulaires d'abord
    this.hideAllForms();
    
    // Mettre à jour les valeurs du formulaire avec les données du nœud
    this.updateForm(this.nodeInputs, node);
    
    // Rendre le formulaire visible
    this.nodeForm.classList.remove('hidden');
    this.nodeForm.style.display = 'flex'; // Forcer l'affichage flex
    
    // Déterminer le champ à focus
    const fieldToFocus = this.graphState.globalSettings.nodeLabelField;
    
    // IMPORTANT: Vérifier explicitement si le champ de label est une chaîne vide
    // Utiliser === "" pour vérifier une chaîne vide exacte (et non undefined ou null)
    if (fieldToFocus === "") {
      console.log("Champ de label explicitement vide, pas de changement d'onglet ni de focus");
      return; // Terminer la fonction ici, ne rien faire de plus
    }
    
    // DRY : bascule et focus
    this.activateValuesTab(this.nodeInputs, fieldToFocus);
  }
  
  /**
   * Affiche le formulaire d'édition de lien
   */
  showLinkForm(link) {
    if (!this.linkForm || !link) {
      console.warn("Impossible d'afficher le formulaire de lien:", 
                   !this.linkForm ? "formulaire manquant" : "lien manquant");
      return;
    }
    
    console.log("Affichage du formulaire pour le lien:", link.id);
    
    // Masquer tous les formulaires d'abord
    this.hideAllForms();
    
    // Mettre à jour les valeurs du formulaire avec les données du lien
    this.updateForm(this.linkInputs, link);
    
    // Rendre le formulaire visible
    this.linkForm.classList.remove('hidden');
    this.linkForm.style.display = 'flex'; // Forcer l'affichage flex
    
    // Déterminer le champ à focus
    const fieldToFocus = this.graphState.globalSettings.linkLabelField;
    
    // IMPORTANT: Vérifier explicitement si le champ de label est une chaîne vide
    // Utiliser === "" pour vérifier une chaîne vide exacte (et non undefined ou null)
    if (fieldToFocus === "") {
      console.log("Champ de label explicitement vide, pas de changement d'onglet ni de focus");
      return; // Terminer la fonction ici, ne rien faire de plus
    }
    
    // DRY : bascule et focus
    this.activateValuesTab(this.linkInputs, fieldToFocus);
  }
  
  /**
   * Met à jour les valeurs du formulaire avec les données de l'élément
   */
  updateForm(inputObject, dataItem) {
    if (!dataItem) {
      console.error("Erreur: tentative de mise à jour du formulaire avec un élément null");
      return;
    }
    
    Object.keys(inputObject).forEach(key => {
      // Traitement spécial pour les propriétés source et target qui sont des objets
      if (key === "source" || key === "target") {
        // Vérifier si dataItem[key] existe ET a une propriété id
        const hasValidReference = dataItem[key] && 
                                typeof dataItem[key] === 'object' && 
                                dataItem[key] !== null && 
                                'id' in dataItem[key];
                                
        // Définir la valeur en conséquence
        inputObject[key].value = hasValidReference ? dataItem[key].id : "";
      } else {
        // Pour les autres propriétés, utiliser la valeur directe ou chaîne vide
        inputObject[key].value = dataItem[key] !== undefined && dataItem[key] !== null ? dataItem[key] : "";
      }
    });
  }
  
  /**
   * Nouvelle méthode simplifiée pour focus et sélection d'un champ
   * @param {HTMLInputElement} inputElement - L'élément input à sélectionner
   */
  focusAndSelectField(inputElement) {
    if (!inputElement) return;
    
    console.log("Tentative de focus et sélection sur:", inputElement.id);
    
    try {
      // S'assurer que l'input est visible
      inputElement.scrollIntoView({ block: 'center' });
      
      // Utiliser les méthodes DOM de base
      inputElement.focus();
      inputElement.select();
      
      // Utiliser setTimeout pour une double assurance
      setTimeout(() => {
        // Double tentative
        inputElement.focus();
        inputElement.select();
        
        // Tenter également la méthode setSelectionRange
        try {
          inputElement.setSelectionRange(0, inputElement.value.length);
        } catch (e) {
          // Ignorer les erreurs (peut ne pas être supporté par tous les navigateurs)
        }
        
        console.log("Second focus/select appliqué");
      }, 50);
    } catch (error) {
      console.error("Erreur de focus/select:", error);
    }
  }
  
  /**
   * Cache tous les formulaires
   */
  hideAllForms() {
    if (this.nodeForm) {
      this.nodeForm.classList.add('hidden');
      this.nodeForm.style.display = 'none'; // Forcer à masquer
    }
    
    if (this.linkForm) {
      this.linkForm.classList.add('hidden');
      this.linkForm.style.display = 'none'; // Forcer à masquer
    }
    
    console.log("Tous les formulaires sont maintenant cachés");
  }
  
  /**
   * Ajoute un nouveau champ aux éléments
   */
  addField(fieldName, target) {
    if (fieldName.trim() === '') return;
    
    const isNodeField = target === 'node';
    const data = isNodeField ? this.graphState.nodes : this.graphState.links;
    const formElement = isNodeField ? this.nodeForm : this.linkForm;
    const inputObject = isNodeField ? this.nodeInputs : this.linkInputs;
    
    // Vérifier si le champ existe déjà
    if (Object.keys(inputObject).includes(fieldName)) return;
    
    // Ajouter le champ à tous les éléments
    this.graphState.addField(fieldName, target);
    
    // Mettre à jour le formulaire
    this.createField(fieldName, formElement, inputObject, data);
    
    // Mettre à jour le graphe
    this.renderer.updateGraph();
  }

  /**
   * Bascule vers l'onglet Valeurs et focus sur le champ donné
   */
  activateValuesTab(inputObject, fieldToFocus) {
    try {
      const tabValeurs = document.querySelector('a[href="#tab2"]');
      if (!tabValeurs) throw new Error("Onglet Valeurs non trouvé");
      tabValeurs.click();
      $(tabValeurs).tab('show');
      console.log("Onglet Valeurs activé");
      setTimeout(() => {
        if (fieldToFocus && inputObject[fieldToFocus]) {
          this.focusAndSelectField(inputObject[fieldToFocus]);
        }
      }, 150);
    } catch (e) {
      console.error("Erreur lors de l'activation de l'onglet Valeurs:", e);
    }
  }
}
