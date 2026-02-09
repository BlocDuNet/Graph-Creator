export class UIContext {
  constructor() {
    this.cache = new Map();
  }
  /**
   * Fetches a DOM element by selector or ID (id or querySelector),
   * caches it and returns it.
   * @param {string} selector - id or CSS selector
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
   * Clears the cache (useful on teardown).
   */
  clear() {
    this.cache.clear();
  }
}
// singleton
export default new UIContext();
