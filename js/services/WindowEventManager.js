import eventBus from './EventBus.js';

export class WindowEventManager {
  static _listeners = [];

  static bindAll(uiManager) {
    const add = (evt, h) => {
      eventBus.on(evt, h);
      this._listeners.push({ evt, h });
    };

    // undo/redo performed → refresh forms & selects
    const historyHandler = () => {
      uiManager.formManager.refreshForms();
      uiManager.updateAllFieldSelects();
    };
    add('undo-performed', historyHandler);
    add('redo-performed', historyHandler);

    // graph-imported → refresh + redraw
    add('graph-imported', () => {
      uiManager.formManager.refreshForms();
      uiManager.updateAllFieldSelects();
      uiManager.renderer.updateGraph();
    });

    // action-applied → specific actions
    const actionHandler = e => {
      const t = e.detail?.action?.type;
      if (t === 'delete_node' || t === 'delete_link') {
        uiManager.formManager.hideAllForms();
      }
      if (t === 'add_field' || t === 'remove_field' || t === 'update_field_type' || t === 'update_field_schema') {
        uiManager.formManager.refreshForms();
        uiManager.updateAllFieldSelects();
      }
    };
    add('action-performed', actionHandler);

    // selection-cleared, node-selected, link-selected, node-created
    add('selection-cleared', () => uiManager.formManager.syncSelectionForms());
    add('node-selected', () => uiManager.formManager.syncSelectionForms());
    add('link-selected', () => uiManager.formManager.syncSelectionForms());
    add('node-created', () => uiManager.formManager.syncSelectionForms());

    // forward undo/redo requests
    add('undo-requested', () => uiManager.el.undoBtn?.click());
    add('redo-requested', () => uiManager.el.redoBtn?.click());
  }

  static unbindAll() {
    this._listeners.forEach(({evt,h}) => eventBus.off(evt, h));
    this._listeners = [];
  }
}
