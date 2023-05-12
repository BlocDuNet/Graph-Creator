
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
});
// Pour volet, bootstrap -end

