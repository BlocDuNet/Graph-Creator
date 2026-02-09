/**
 * Updates all <select> and inputs tied to global settings.
 */
export function syncGlobalSettingsUI(state) {
  const mapping = [
    { id:'node-label',      target:'node', types:['text','number'], val: state.globalSettings.nodeLabelField },
    { id:'link-label',      target:'link', types:['text','number'], val: state.globalSettings.linkLabelField },
    { id:'node-size-field', target:'node', types:['number'],        val: state.globalSettings.nodeSizeField },
    { id:'node-id-field',   target:'node', types:['text','number'], val: state.globalSettings.nodeIdField },
    { id:'node-x-field',    target:'node', types:['number'],        val: state.globalSettings.xField },
    { id:'node-y-field',    target:'node', types:['number'],        val: state.globalSettings.yField }
  ];
  mapping.forEach(({id,target,types,val}) => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const allFields = target === 'node' ? state.getNodeFields() : state.getLinkFields();
    const filtered = state.getFieldsByType(target, { types });
    const isInvalid = val && !filtered.includes(val);
    const opts = filtered.slice();
    if (val && !opts.includes(val) && allFields.includes(val)) {
      opts.unshift(`${val} (type incompatible)`);
    } else if (val && !opts.includes(val) && !allFields.includes(val)) {
      opts.unshift(`${val} (champ absent)`);
    }
    sel.innerHTML = '<option value=""></option>' 
      + opts.map(o => {
        const raw = o.replace(/ \(type incompatible\)| \(champ absent\)$/, '');
        const label = o;
        return `<option value="${raw}">${label}</option>`;
      }).join('');
    sel.value = val;
    sel.classList.toggle('type-invalid', !!isInvalid);
    sel.title = isInvalid ? `Type attendu: ${types.join(', ')}` : '';
  });
  // inputs
  const defSize = document.getElementById('defaultNodeSizeInput');
  const defLink = document.getElementById('defaultLinkWidthInput');
  const multiEnabled = document.getElementById('multilingual-enabled');
  const multiLangs = document.getElementById('multilingual-langs');
  const currentLang = document.getElementById('current-language');
  if (defSize) defSize.value = state.globalSettings.defaultNodeSize;
  if (defLink) defLink.value = state.globalSettings.defaultLinkWidth;
  if (multiEnabled) multiEnabled.checked = !!state.globalSettings.multilingualEnabled;
  if (multiLangs) multiLangs.value = state.globalSettings.multilingualLangs || '';
  if (currentLang) {
    const langs = (state.globalSettings.multilingualLangs || 'fr,en')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    currentLang.innerHTML = '<option value=""></option>' 
      + langs.map(l => `<option value="${l}">${l}</option>`).join('');
    currentLang.value = state.globalSettings.currentLanguage || langs[0] || '';
  }
}
