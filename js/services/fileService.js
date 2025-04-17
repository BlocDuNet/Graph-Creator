/**
 * Liste les fichiers .json disponibles dans un dossier accessible par HTTP.
 * @param {string} dirUrl - URL du répertoire à scanner.
 * @returns {Promise<string[]>}
 */
export async function listJsonFiles(dirUrl) {
  const resp = await fetch(dirUrl);
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status} fetching ${dirUrl}`);
  }
  const html = await resp.text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return Array.from(doc.querySelectorAll('a'))
    .map(a => a.textContent)
    .filter(name => name.endsWith('.json'));
}
