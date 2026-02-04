/**
 * Met à jour tous les <select> et inputs liés aux settings globaux
 */
export function syncGlobalSettingsUI(state) {
  const mapping = [
    { id:'node-label',            opts: state.getNodeFields(),    val: state.globalSettings.nodeLabelField },
    { id:'link-label',            opts: state.getLinkFields(),    val: state.globalSettings.linkLabelField },
    { id:'node-size-field',       opts: state.getNodeFields(),    val: state.globalSettings.nodeSizeField },
    { id:'node-id-field',         opts: state.getNodeFields(),    val: state.globalSettings.nodeIdField },
    { id:'node-x-field',          opts: state.getNodeFields(),    val: state.globalSettings.xField },
    { id:'node-y-field',          opts: state.getNodeFields(),    val: state.globalSettings.yField }
  ];
  mapping.forEach(({id,opts,val}) => {
    const sel = document.getElementById(id);
    if (!sel) return;
    sel.innerHTML = '<option value=""></option>' 
      + opts.map(o => `<option value="${o}">${o}</option>`).join('');
    sel.value = val;
    // stocker les options complètes pour le filtrage
    sel._allOptions = opts.slice();
  });
  // inputs
  const defSize = document.getElementById('defaultNodeSizeInput');
  const defLink = document.getElementById('defaultLinkWidthInput');
  if (defSize) defSize.value = state.globalSettings.defaultNodeSize;
  if (defLink) defLink.value = state.globalSettings.defaultLinkWidth;
}
