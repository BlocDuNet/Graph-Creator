/**
 * Layout circulaire
 * @param {Array} nodes
 * @param {number} width
 * @param {number} height
 */
export function applyCircleLayout(nodes, width, height) {
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) / 3;
  const n = nodes.length;
  nodes.forEach((node, i) => {
    node.x = centerX + radius * Math.cos((2 * Math.PI * i) / n);
    node.y = centerY + radius * Math.sin((2 * Math.PI * i) / n);
  });
}

/**
 * Layout en grille
 * @param {Array} nodes
 * @param {number} width
 * @param {number} height
 */
export function applyGridLayout(nodes, width, height) {
  const cols = Math.ceil(Math.sqrt(nodes.length));
  const spacingX = width / (cols + 1);
  const spacingY = height / (cols + 1);
  nodes.forEach((node, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    node.x = spacingX * (col + 1);
    node.y = spacingY * (row + 1);
  });
}

/**
 * Layout aléatoire
 * @param {Array} nodes
 * @param {number} width
 * @param {number} height
 * @param {number} [padding=50]
 */
export function applyRandomLayout(nodes, width, height, padding = 50) {
  const availW = width - padding * 2;
  const availH = height - padding * 2;
  nodes.forEach(node => {
    node.x = padding + Math.random() * availW;
    node.y = padding + Math.random() * availH;
  });
}

/**
 * 1. Sugiyama / hiérarchique
 */
export function applyHierarchicalLayout(nodes, width, height) {
  // simple layering by index
  const layerHeight = height / (nodes.length + 1);
  nodes.forEach((n,i) => { n.x = width/2; n.y = layerHeight*(i+1); });
  console.warn("Hierarchical layout applied (basic version)");
}

/**
 * 2. Radial (cône)
 */
export function applyRadialLayout(nodes, width, height) {
  const cx = width/2, cy = height/2;
  const maxR = Math.min(cx,cy) * 0.8;
  nodes.forEach((n,i) => {
    const angle = (2*Math.PI*i)/nodes.length;
    const r = maxR * (i/(nodes.length));
    n.x = cx + r*Math.cos(angle);
    n.y = cy + r*Math.sin(angle);
  });
}

/**
 * 3. Spiral
 */
export function applySpiralLayout(nodes, width, height) {
  const cx = width/2, cy = height/2, turns = 3;
  nodes.forEach((n,i) => {
    const t = i / nodes.length;
    const angle = turns * 2*Math.PI * t;
    const r = Math.min(cx,cy) * t;
    n.x = cx + r*Math.cos(angle);
    n.y = cy + r*Math.sin(angle);
  });
}

/**
 * 5. Arc diagram
 */
export function applyArcDiagramLayout(nodes, width, height) {
  const y = height/2;
  const dx = width/(nodes.length+1);
  nodes.forEach((n,i) => {
    n.x = dx*(i+1);
    n.y = y;
  });
}

/**
 * 6. Concentric clusters
 */
export function applyConcentricLayout(nodes, width, height) {
  const cx = width/2, cy = height/2;
  const maxR = Math.min(cx,cy)*0.8;
  const groups = Math.ceil(Math.sqrt(nodes.length));
  const perRing = Math.ceil(nodes.length/groups);
  nodes.forEach((n,i) => {
    const ring = Math.floor(i/perRing);
    const idx = i%perRing;
    const angle = (2*Math.PI*idx)/perRing;
    const r = maxR * ((ring+1)/groups);
    n.x = cx + r*Math.cos(angle);
    n.y = cy + r*Math.sin(angle);
  });
}

/**
 * 7. Bipartite / couche double
 */
export function applyBipartiteLayout(nodes, width, height) {
  const left = width*0.25, right = width*0.75;
  const half = Math.ceil(nodes.length/2);
  nodes.forEach((n,i) => {
    n.x = i<half ? left : right;
    n.y = height*((i%half+1)/(half+1));
  });
}

/**
 * 8. Force‑atlas (simplifié)
 */
export function applyForceAtlasLayout(nodes, width, height) {
  console.warn("Force‑atlas stub, utilisez la simulation dynamique pour un vrai résultat");
  applyRandomLayout(nodes, width, height, 0);
}
