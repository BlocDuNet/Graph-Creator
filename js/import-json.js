//A refaire entièrement, pas utilsié actuellement, l'idée est de créer une fonction universelle pour charger des fichiers dans un dossier et l'afficher dans une liste déroulante avec le choix de prendre une valeur vide


// Fonction pour mettre à jour la liste déroulante des fichiers JSON
export function updateJSONDropdown(directoryPath) {
  const select = document.getElementById('import-config-json');
  select.innerHTML = ''; // Efface les anciennes options

  fetch(directoryPath)
    .then(response => response.text())
    .then(text => {
      const parser = new DOMParser();
      const html = parser.parseFromString(text, 'text/html');
      const jsonFiles = Array.from(html.querySelectorAll('a'))
        .filter(link => link.href.endsWith('.json'))
        .map(link => link.textContent);

      if (jsonFiles.length === 0) {
        console.log('Aucun fichier JSON trouvé dans le dossier !');
        return;
      }

      jsonFiles.forEach(file => {
        const option = document.createElement('option');
        option.value = file;
        option.textContent = file.split(".")[0];
        select.appendChild(option);
      });
    })
    .catch(error => console.error('Erreur lors de la récupération de la liste des fichiers JSON :', error));
}

// Fonction pour charger et afficher un fichier JSON
export function loadAndDisplayJSON(directoryPath, fileName) {
  fetch(directoryPath + fileName)
    .then(response => response.json())
    .then(jsonObj => {
      // Implémentez ici votre logique pour afficher les données JSON
      console.log(jsonObj);
    })
    .catch(error => console.error('Erreur lors du chargement du fichier JSON :', error));
}
