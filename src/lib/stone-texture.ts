import * as THREE from 'three';

/**
 * A tileable stone-block texture, drawn once on a canvas.
 *
 * Generated rather than shipped: the corridor needs one wall material, and a
 * procedural tile costs a few kilobytes of code instead of a texture download in a
 * bundle that is deliberately kept tiny. Seeded, so every visitor sees the same wall.
 */
let cached: THREE.CanvasTexture | null = null;

export function stoneTexture(): THREE.CanvasTexture {
  if (cached) return cached;

  const SIZE = 512;
  const ROWS = 8;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;

  let seed = 991733;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;

  // Mortar behind everything, so the gaps between blocks read as recessed.
  ctx.fillStyle = '#0f1116';
  ctx.fillRect(0, 0, SIZE, SIZE);

  const rowHeight = SIZE / ROWS;
  for (let row = 0; row < ROWS; row++) {
    // Alternate rows are offset half a block, the way real coursed masonry is laid.
    const offset = row % 2 === 0 ? 0 : rowHeight * 0.9;
    let x = -offset;
    while (x < SIZE) {
      const w = rowHeight * (1.5 + rnd() * 0.7);
      const tone = 52 + rnd() * 26;
      ctx.fillStyle = `rgb(${Math.round(tone * 0.98)}, ${Math.round(tone * 1.0)}, ${Math.round(tone * 1.12)})`;
      ctx.fillRect(x + 2, row * rowHeight + 2, w - 4, rowHeight - 4);

      // A lit top edge and a shadowed bottom one give each block some relief.
      ctx.fillStyle = `rgba(255,255,255,${0.05 + rnd() * 0.05})`;
      ctx.fillRect(x + 2, row * rowHeight + 2, w - 4, 2);
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fillRect(x + 2, (row + 1) * rowHeight - 4, w - 4, 2);

      // Pitting, so the faces are not flat fills.
      for (let i = 0; i < 14; i++) {
        ctx.fillStyle = `rgba(0,0,0,${0.05 + rnd() * 0.12})`;
        ctx.fillRect(x + 4 + rnd() * (w - 10), row * rowHeight + 4 + rnd() * (rowHeight - 10), 1 + rnd() * 3, 1 + rnd() * 2);
      }
      x += w;
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  cached = texture;
  return texture;
}
