export class UIContext {
  constructor() {
    this.cache = new Map();
  }
  /**
   * Récupère un élément DOM par sélecteur ou ID (id ou querySelector),
   * le met en cache et le renvoie.
   * @param {string} selector - id ou sélecteur CSS
   */
  get(selector) {
    if (!this.cache.has(selector)) {
      const elt = selector.startsWith('#')
        ? document.getElementById(selector.slice(1))
        : document.querySelector(selector);
      this.cache.set(selector, elt);
    }
    return this.cache.get(selector);
  }
  /**
   * Vide le cache (utile au teardown)
   */
  clear() {
    this.cache.clear();
  }
}
// singleton
export default new UIContext();
