import { listJsonFiles } from './services/fileService.js';

const THEME_DIR = 'json_theme/';
const THEME_SELECTION_KEY = 'selectedThemeFile';
const CUSTOM_VARS_KEY = 'customThemeVars';
const colorVars = [
  // Fond & panneaux
  'color-bg',
  'color-panel-bg',
  'color-panel-header',
  // Nœuds & liens
  'color-node-fill',
  'color-node-stroke',
  'color-link',
  'color-link-selected',
  // Texte & sélection
  'color-node-text',
  'color-node-selected-text',
  'color-node-selected',
  // Cartes & modals
  'color-card-bg',
  'color-card-header-bg',
  'color-card-text',
  // Boutons & formulaires
  'color-btn-bg',
  'color-btn-bg-hover',
  'color-btn-text',
  'color-form-bg',
  'color-form-border',
  'color-form-label',
  'color-form-input',
  'color-form-input-bg',
  'color-form-input-focus'
  // ...ajouter d'autres variables selon les sections...
];

// charge et applique un fichier de theme JSON
async function loadThemeFile(file) {
  if (!file) return;
  try {
    const resp = await fetch(THEME_DIR + file);
    if (!resp.ok) throw new Error(resp.statusText);
    const vars = await resp.json();
    Object.entries(vars).forEach(([k,v]) =>
      document.documentElement.style.setProperty(`--${k}`, v)
    );
    localStorage.setItem(THEME_SELECTION_KEY, file);
  } catch(e) {
    console.error('Erreur theme:', e);
  }
}

// charge overrides depuis localStorage
function loadOverrides() {
  const json = localStorage.getItem(CUSTOM_VARS_KEY);
  if (!json) return;
  try {
    const vars = JSON.parse(json);
    Object.entries(vars).forEach(([k,v]) =>
      document.documentElement.style.setProperty(`--${k}`, v)
    );
  } catch {}
}

function toColorHex(color) {
  if (!color) return '#000000';
  color = color.trim();
  if (color.startsWith('#')) return color;
  const rgb = color.match(/\d+/g);
  if (rgb && rgb.length >= 3) {
    return (
      '#' +
      ((1 << 24) + (parseInt(rgb[0]) << 16) + (parseInt(rgb[1]) << 8) + parseInt(rgb[2]))
        .toString(16)
        .slice(1)
    );
  }
  return '#000000';
}

function saveOverrides() {
  const o = {};
  colorVars.forEach(v => {
    const val = getComputedStyle(document.documentElement)
      .getPropertyValue(`--${v}`).trim();
    if (val) o[v] = val;
  });
  localStorage.setItem(CUSTOM_VARS_KEY, JSON.stringify(o));
}

function syncInputs() {
  colorVars.forEach(v => {
    const inp = document.getElementById(v);
    if (inp?.type === 'color') {
      const css = getComputedStyle(document.documentElement)
        .getPropertyValue(`--${v}`);
      if (css) inp.value = css.trim();
    }
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  // 1. peupler le sélecteur de thèmes
  const sel = document.getElementById('theme-selector');
  if (sel) {
    const files = await listJsonFiles(THEME_DIR);
    sel.innerHTML = ['<option value="">-- Choisir un thème --</option>']
      .concat(files.map(f => `<option value="${f}">${f.replace('.json','')}</option>`))
      .join('');
    // 2. restaurer la sélection et charger le thème correspondant
    const saved = localStorage.getItem(THEME_SELECTION_KEY) || 'theme-clair.json';
    sel.value = files.includes(saved) ? saved : 'theme-clair.json';
    await loadThemeFile(sel.value);
  }

  // 3. charger overrides (couleurs custom)
  loadOverrides();
  syncInputs();

  // changement de thème
  sel?.addEventListener('change', async () => {
    await loadThemeFile(sel.value);
    loadOverrides();
    syncInputs();
  });

  // ...existing setup for color pickers, import/export, reset...
  
  // reset personnalisé recharge thème clair et supprime overrides
  document.getElementById('reset-theme')?.addEventListener('click', async () => {
    localStorage.removeItem(CUSTOM_VARS_KEY);
    await loadThemeFile('theme-clair.json');
    syncInputs();
  });

  // sauvegarde automatique des overrides
  colorVars.forEach(v => {
    const inp = document.getElementById(v);
    if (inp?.type === 'color') {
      inp.addEventListener('input', () => {
        document.documentElement.style.setProperty(`--${v}`, inp.value);
        saveOverrides();
      });
    }
  });

  // import/export theme custom remain unchanged...
  
  const form = document.getElementById('theme-customizer-form');
  if (!form) return;

  colorVars.forEach(v => {
    const inp = document.getElementById(v);
    if (inp && inp.type === 'color') {
      inp.addEventListener('input', () => {
        document.documentElement.style.setProperty('--' + v, inp.value);
        saveOverrides();
      });
    }
  });

  const resetBtn = document.getElementById('reset-theme');
  if (resetBtn) {
    resetBtn.addEventListener('click', async () => {
      await loadThemeFile('theme-clair.json');             // recharger le JSON clair
      localStorage.removeItem(CUSTOM_VARS_KEY);
      syncInputs();                         // mettre à jour les color pickers
    });
  }

  document.getElementById('export-theme')?.addEventListener('click', () => {
    const out = {};
    colorVars.forEach(v => {
      const val = getComputedStyle(document.documentElement)
        .getPropertyValue('--' + v).trim();
      if (val) out[v] = val;
    });
    const blob = new Blob([JSON.stringify(out, null,2)], { type:'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'theme.json';
    document.body.appendChild(a); a.click();
    a.remove(); URL.revokeObjectURL(url);
  });

  const importBtn = document.getElementById('import-theme-btn');
  const importFile = document.getElementById('import-theme-file');
  importBtn?.addEventListener('click', () => importFile.click());
  importFile?.addEventListener('change', () => {
    const f = importFile.files?.[0]; if (!f) return;
    const rdr = new FileReader();
    rdr.onload = e => {
      try {
        const vars = JSON.parse(e.target.result);
        Object.entries(vars).forEach(([k,v]) => {
          document.documentElement.style.setProperty('--' + k, v);
        });
        saveOverrides();
        syncInputs();
      } catch (err) {
        alert('Import thème invalide');
      }
    };
    rdr.readAsText(f);
  });

  // liste déroulante thèmes
  const themeSelect = document.getElementById('theme-json-list');
  if (themeSelect) {
    listJsonFiles(THEME_DIR).then(files => {
      themeSelect.innerHTML = ['<option value="">-- Choisir un thème --</option>']
        .concat(files.map(f => `<option value="${f}">${f}</option>`))
        .join('');
    });
    themeSelect.addEventListener('change', async () => {
      if (!themeSelect.value) return;
      try {
        const res = await fetch(THEME_DIR + themeSelect.value);
        const vars = await res.json();
        Object.entries(vars).forEach(([k,v]) => {
          document.documentElement.style.setProperty('--' + k, v);
        });
        saveOverrides();
        syncInputs();
      } catch {
        alert('Erreur chargement thème');
      }
    });
  }

  // --- Sélecteur de thèmes global (onglet Actions & Themes) ---
  const themeSelector = document.getElementById('theme-selector');
  if (themeSelector) {
    listJsonFiles(THEME_DIR).then(files => {
      themeSelector.innerHTML = [
        '<option value="">-- Choisir un thème --</option>',
        ...files.map(f => `<option value="${f}">${f.replace(/\.json$/, '')}</option>`)
      ].join('');
    });
    themeSelector.addEventListener('change', async () => {
      if (!themeSelector.value) return;
      try {
        const resp = await fetch(THEME_DIR + themeSelector.value);
        const vars = await resp.json();
        Object.entries(vars).forEach(([k, v]) => {
          document.documentElement.style.setProperty('--' + k, v);
        });
        saveOverrides();
        syncInputs();
      } catch (e) {
        alert('Erreur chargement thème : ' + e.message);
      }
    });
  }
});
