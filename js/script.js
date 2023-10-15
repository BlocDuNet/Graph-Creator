
// Pour volet, bootstrap
document.addEventListener("DOMContentLoaded", function() {
  const bottomPanel = document.querySelector("#bottom-panel");
  const cardHeader = document.querySelector("#bottom-panel-header");
  const headerToggle = document.querySelector(".header-toggle");
  const arrow = document.querySelector(".arrow");

  cardHeader.addEventListener("click", function(event) {
    if (event.target === cardHeader || event.target === headerToggle) {
      bottomPanel.classList.toggle("collapsed");
      arrow.classList.toggle("arrow-down");
      arrow.classList.toggle("arrow-up");
    }
  });

  // Ajoutez un gestionnaire d'événements pour chaque onglet
  const tabs = document.querySelectorAll(".nav-item");
  tabs.forEach(tab => {
    tab.addEventListener("click", function() {
      // Si le panneau est fermé, ouvrez-le
      if (bottomPanel.classList.contains("collapsed")) {
        bottomPanel.classList.remove("collapsed");
        arrow.classList.add("arrow-up");
        arrow.classList.remove("arrow-down");
      }
    });
  });
});


// Pour volet, bootstrap - END

