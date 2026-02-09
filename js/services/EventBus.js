/**
 * Application event bus (single point for emit/listen).
 * Use eventBus.emit/on/off for domain events.
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
