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
});
