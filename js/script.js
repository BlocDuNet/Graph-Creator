// script.js
document.addEventListener("DOMContentLoaded", () => {
  const bottomPanel = document.querySelector("#bottom-panel");
  const cardHeader = document.querySelector("#bottom-panel-header");
  const headerToggle = document.querySelector(".header-toggle");
  const arrow = document.querySelector(".arrow");

  // Bascule du volet
  cardHeader.addEventListener("click", event => {
    if (event.target === cardHeader || event.target === headerToggle) {
      bottomPanel.classList.toggle("collapsed");
      arrow.classList.toggle("arrow-down");
      arrow.classList.toggle("arrow-up");
    }
  });

  // Ouvre le volet lors du clic sur un onglet
  const tabs = document.querySelectorAll(".nav-item");
  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      if (bottomPanel.classList.contains("collapsed")) {
        bottomPanel.classList.remove("collapsed");
        arrow.classList.add("arrow-up");
        arrow.classList.remove("arrow-down");
      }
    });
  });

  // Mise à jour des valeurs affichées pour les contrôles de courbure
  function setupRangeValueDisplay(rangeId, valueId) {
    const range = document.getElementById(rangeId);
    const valueDisplay = document.getElementById(valueId);
    
    if (range && valueDisplay) {
      // Initialiser avec la valeur actuelle
      valueDisplay.textContent = range.value;
      
      // Mettre à jour pendant le glissement
      range.addEventListener('input', () => {
        valueDisplay.textContent = range.value;
      });
    }
  }
  
  // Configuration des affichages de valeur pour chaque slider
  setupRangeValueDisplay('base-curvature', 'base-curvature-value');
  setupRangeValueDisplay('loop-curvature', 'loop-curvature-value');
  setupRangeValueDisplay('curvature-step', 'curvature-step-value');
});
