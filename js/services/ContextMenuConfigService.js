/**
 * Shared definitions + normalization for the contextual menu.
 */

export const CONTEXT_MENU_CONTEXTS = [
  { id: 'canvas', label: 'Fond vide' },
  { id: 'node', label: 'Noeud' },
  { id: 'link', label: 'Lien' },
  { id: 'multi', label: 'Selection multiple' }
];

export const CONTEXT_MENU_DEFINITIONS = {
  canvas: [
    { id: 'create-node-here', label: 'Creer un noeud ici' },
    { id: 'select-all', label: 'Selectionner tout' },
    { id: 'auto-layout', label: 'Lancer auto-layout' },
    { id: 'reset-zoom', label: 'Reinitialiser le zoom' },
    {
      id: 'import-export',
      label: 'Import / Export',
      defaultChildId: 'export-json',
      children: [
        { id: 'import-json', label: 'Importer JSON' },
        { id: 'export-json', label: 'Exporter JSON' },
        { id: 'export-image', label: 'Exporter image' }
      ]
    }
  ],
  node: [
    { id: 'rename-node', label: 'Renommer' },
    { id: 'edit-node', label: 'Editer les proprietes' },
    { id: 'create-link-from-node', label: 'Creer un lien depuis ce noeud' },
    { id: 'duplicate-node', label: 'Dupliquer' },
    { id: 'lock-node', label: 'Verrouiller la position' },
    { id: 'unlock-node', label: 'Deverrouiller la position' },
    { id: 'highlight-neighbors', label: 'Mettre en evidence les voisins' },
    { id: 'add-node-to-group', label: 'Ajouter au groupe...' },
    { id: 'delete-node', label: 'Supprimer' }
  ],
  link: [
    { id: 'rename-link', label: 'Renommer' },
    { id: 'edit-link', label: 'Editer les proprietes' },
    { id: 'reverse-link', label: 'Inverser la direction' },
    { id: 'duplicate-link', label: 'Dupliquer' },
    { id: 'add-link-to-group', label: 'Ajouter au groupe...' },
    { id: 'delete-link', label: 'Supprimer' }
  ],
  multi: [
    {
      id: 'create-linked-node',
      label: 'Creer un noeud relie',
      defaultChildId: 'selected-to-new',
      children: [
        { id: 'selected-to-new', label: 'Selection -> nouveau (defaut)' },
        { id: 'new-to-selected', label: 'Nouveau -> selection' },
        { id: 'bidirectional-to-selected', label: 'Bidirectionnel' }
      ]
    },
    { id: 'edit-batch', label: 'Editer en lot' },
    { id: 'apply-common-style', label: 'Appliquer un style commun' },
    { id: 'add-selection-to-group', label: 'Ajouter au groupe...' },
    { id: 'align-left', label: 'Aligner a gauche' },
    { id: 'align-right', label: 'Aligner a droite' },
    { id: 'align-top', label: 'Aligner en haut' },
    { id: 'align-bottom', label: 'Aligner en bas' },
    { id: 'distribute-horizontal', label: 'Distribuer horizontalement' },
    { id: 'distribute-vertical', label: 'Distribuer verticalement' },
    { id: 'lock-selected', label: 'Verrouiller les positions' },
    { id: 'unlock-selected', label: 'Deverrouiller les positions' },
    { id: 'duplicate-selection', label: 'Dupliquer la selection' },
    { id: 'delete-selection', label: 'Supprimer la selection' }
  ]
};

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeItems(defItems, inputItems) {
  const defs = Array.isArray(defItems) ? defItems : [];
  const incoming = Array.isArray(inputItems) ? inputItems : [];
  const defIds = defs.map(def => String(def.id));
  const incomingById = new Map();

  incoming.forEach(item => {
    const id = String(item?.id || '').trim();
    if (!id || incomingById.has(id)) return;
    incomingById.set(id, item);
  });

  const orderedIds = [];
  incoming.forEach(item => {
    const id = String(item?.id || '').trim();
    if (!defIds.includes(id)) return;
    if (!orderedIds.includes(id)) orderedIds.push(id);
  });
  defIds.forEach(id => {
    if (!orderedIds.includes(id)) orderedIds.push(id);
  });

  return orderedIds.map(id => {
    const def = defs.find(item => String(item.id) === id);
    const raw = incomingById.get(id) || {};
    const item = {
      id,
      visible: raw.visible !== false,
      enabled: raw.enabled !== false
    };

    if (Array.isArray(def?.children) && def.children.length) {
      item.children = normalizeItems(def.children, raw.children);
      const childIds = item.children.map(child => child.id);
      const fallback = String(def.defaultChildId || childIds[0] || '');
      const fromConfig = String(raw.defaultChildId || '');
      item.defaultChildId = childIds.includes(fromConfig) ? fromConfig : fallback;
    }

    return item;
  });
}

export function createDefaultContextMenuConfig() {
  const contexts = {};
  CONTEXT_MENU_CONTEXTS.forEach(context => {
    contexts[context.id] = normalizeItems(CONTEXT_MENU_DEFINITIONS[context.id], []);
  });
  return { contexts };
}

export function normalizeContextMenuConfig(config) {
  const contexts = {};
  CONTEXT_MENU_CONTEXTS.forEach(context => {
    const incoming = config?.contexts?.[context.id];
    contexts[context.id] = normalizeItems(CONTEXT_MENU_DEFINITIONS[context.id], incoming);
  });
  return { contexts };
}

export function sanitizeContextMenuConfig(config) {
  return normalizeContextMenuConfig(config);
}

export function cloneContextMenuConfig(config) {
  return deepClone(normalizeContextMenuConfig(config));
}

