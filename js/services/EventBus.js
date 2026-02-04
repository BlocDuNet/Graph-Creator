/**
 * Bus d'événements applicatif (unique point de diffusion/écoute).
 * Utiliser eventBus.emit/on/off pour les événements métier.
 */
class EventBus extends EventTarget {
  emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  on(type, handler) {
    this.addEventListener(type, handler);
  }

  off(type, handler) {
    this.removeEventListener(type, handler);
  }
}

const eventBus = new EventBus();
export default eventBus;
