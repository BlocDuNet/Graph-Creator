export class WindowEventManager {
  static _listeners = [];

  static bindAll(uiManager) {
    const add = (evt, h) => {
      window.addEventListener(evt, h);
      this._listeners.push({ evt, h });
    };

    // undo/redo performed → rafraîchir forms & selects
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

    // action-applied → certaines actions
    const actionHandler = e => {
      const t = e.detail?.action?.type;
      if (t === 'delete_node' || t === 'delete_link') {
        uiManager.formManager.hideAllForms();
      }
      if (t === 'add_field' || t === 'remove_field') {
        uiManager.formManager.refreshForms();
        uiManager.updateAllFieldSelects();
      }
    };
    add('action-applied', actionHandler);

    // selection-cleared, node-selected, link-selected, node-created
    add('selection-cleared', () => uiManager.formManager.hideAllForms());
    add('node-selected', e => uiManager.formManager.showNodeForm(e.detail.node));
    add('link-selected', e => uiManager.formManager.showLinkForm(e.detail.link));
    add('node-created', e => uiManager.formManager.showNodeForm(e.detail.node));

    // forward undo/redo requests
    add('undo-requested', () => uiManager.el.undoBtn?.click());
    add('redo-requested', () => uiManager.el.redoBtn?.click());
  }

  static unbindAll() {
    this._listeners.forEach(({evt,h}) => window.removeEventListener(evt, h));
    this._listeners = [];
  }
}
