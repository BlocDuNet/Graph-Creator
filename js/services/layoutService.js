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
