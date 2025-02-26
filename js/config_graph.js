// config_graph.js
const svgElement = d3.select('svg');
const width = svgElement.node().getBoundingClientRect().width;
const height = svgElement.node().getBoundingClientRect().height;

const directoryPath = 'json_config/';
let defaultFile = 'manual_without_force.json';
let linkStrength = 0;
let linkDistance = 200;
let chargeStrength = 0;
let centerStrength = 0;

const forceConfig = {
  link: d3.forceLink().id(d => d.id).distance(linkDistance).strength(linkStrength),
  charge: d3.forceManyBody().strength(chargeStrength),
  center: d3.forceCenter(width / 2, height / 2).strength(centerStrength)
};

d3.select('#link-force').on('change', function () {
  linkStrength = this.checked ? 1 : 0;
  forceConfig.link.strength(linkStrength);
});
d3.select('#charge-strength').on('change', function () {
  chargeStrength = Number(this.value);
  forceConfig.charge.strength(chargeStrength);
});
d3.select('#center-force').on('change', function () {
  centerStrength = this.checked ? 1 : 0;
  forceConfig.center.strength(centerStrength);
});
d3.select('#link-distance').on('change', function () {
  linkDistance = Number(this.value);
  forceConfig.link.distance(linkDistance);
});

function updateHTMLInputs() {
  d3.select('#link-force').property('checked', linkStrength === 1);
  d3.select('#link-distance').property('value', linkDistance);
  d3.select('#charge-strength').property('value', chargeStrength);
  d3.select('#center-force').property('checked', centerStrength === 1);
}

function updateConfigAndInputs(jsonObj) {
  linkStrength = jsonObj.linkStrength;
  linkDistance = jsonObj.linkDistance;
  chargeStrength = jsonObj.chargeStrength;
  centerStrength = jsonObj.centerStrength;
  forceConfig.link.distance(linkDistance).strength(linkStrength);
  forceConfig.charge.strength(chargeStrength);
  forceConfig.center.strength(centerStrength);
  updateHTMLInputs();
}

d3.select('#export-config').on('click', () => {
  const config = { linkStrength, linkDistance, chargeStrength, centerStrength };
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(config));
  const downloadAnchorNode = document.createElement('a');
  downloadAnchorNode.setAttribute("href", dataStr);
  downloadAnchorNode.setAttribute("download", "config.json");
  document.body.appendChild(downloadAnchorNode);
  downloadAnchorNode.click();
  downloadAnchorNode.remove();
});

d3.select('#import-config').on('change', function () {
  const file = this.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = function (e) {
      const config = JSON.parse(e.target.result);
      updateConfigAndInputs(config);
    };
    reader.readAsText(file);
  }
});

// Import des fichiers JSON de configuration depuis le dossier
fetch(directoryPath)
  .then(response => response.text())
  .then(text => {
    const parser = new DOMParser();
    const html = parser.parseFromString(text, 'text/html');
    const jsonFiles = Array.from(html.querySelectorAll('a'))
      .filter(link => link.href.endsWith('.json'))
      .map(link => link.textContent);
    if (jsonFiles.length === 0) {
      console.log('Aucun fichier JSON trouvé dans le dossier!');
      return;
    }
    console.log('Fichiers JSON trouvés:', jsonFiles);
    const select = document.createElement('select');
    select.id = 'json-files';
    jsonFiles.forEach(file => {
      const option = document.createElement('option');
      option.value = file;
      option.textContent = file.split(".")[0];
      select.appendChild(option);
    });
    document.getElementById("import-config-json").appendChild(select);
    select.value = defaultFile;
    select.addEventListener('change', function () {
      const selectedFile = this.options[this.selectedIndex].value;
      fetch(directoryPath + selectedFile)
        .then(response => response.json())
        .then(jsonObj => {
          updateConfigAndInputs(jsonObj);
          console.log(jsonObj);
        })
        .catch(error => console.error('Erreur lors du chargement du fichier JSON:', error));
    });
  })
  .catch(error => console.error('Erreur lors de la récupération de la liste des fichiers JSON:', error));

fetch(directoryPath + defaultFile)
  .then(response => response.json())
  .then(jsonObj => {
    updateConfigAndInputs(jsonObj);
    console.log(jsonObj);
  })
  .catch(error => console.error('Erreur lors du chargement du fichier JSON:', error));

export function getForceConfiguration() {
  return forceConfig;
}
