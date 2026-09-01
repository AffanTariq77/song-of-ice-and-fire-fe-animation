import * as THREE from 'three';

/**
 * Procedural stone: albedo, normal and roughness, generated on a canvas at runtime.
 *
 * Generated rather than shipped because this repo's whole reason to exist is that it
 * builds in seconds with nothing in it. A PBR set for five surfaces would be roughly
 * fifteen texture downloads; this is a few kilobytes of code that produces all of
 * them, seeded so every visitor sees the same wall.
 *
 * Three maps rather than four: ambient occlusion is multiplied into the albedo while
 * the joints are being drawn, instead of shipping an aoMap. It costs one texture unit
 * less, and for a surface this dark the difference between AO on indirect light only
 * and AO on everything is not visible.
 *
 * The normal map is written to a canvas, not a DataTexture. A DataTexture defaults to
 * flipY false while a CanvasTexture defaults to true, and mixing the two flips the
 * normal map relative to the albedo, every bevel lit from the wrong side.
 */

export type StoneVariant =
  /** Coursed ashlar, courses running horizontally. The main wall. */
  | 'ashlar'
  /** Ashlar transposed: courses run vertically in UV space, so on a barrel vault they ring the arch. */
  | 'vault'
  /** Big worn slabs with wide joints. The walkway. */
  | 'flagstone'
  /** Massive low blocks. The plinth at the foot of the wall. */
  | 'plinth'
  /** Small irregular stone. Cross-passage linings, where it should look older and cruder. */
  | 'rubble';

export type StoneOptions = {
  size?: number;
  /** 0-1. Water running down the face: darker, and much less rough, so it catches a torch. */
  damp?: number;
  /** 0-1. Moss creeping out of the joints along the bottom edge of the texture. */
  moss?: number;
  /** Base grey, 0-255, before per-block variation. */
  tone?: number;
  seed?: number;
};

export type StoneMaps = {
  map: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
};

type Ctx = CanvasRenderingContext2D;
type Block = { x: number; y: number; w: number; h: number };

const cache = new Map<string, StoneMaps>();

function makeRandom(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

function surface(size: number): [HTMLCanvasElement, Ctx] {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  return [canvas, canvas.getContext('2d')!];
}

const grey = (v: number) => `rgb(${v | 0},${v | 0},${v | 0})`;

/**
 * Blocks laid in courses, alternate rows offset by half a block the way real coursed
 * masonry is. Rows run off both edges so the tile has no visible start or end.
 */
function courses(size: number, rand: () => number, rows: number, aspect: number, stagger: boolean): Block[] {
  const blocks: Block[] = [];
  const rowHeight = size / rows;
  for (let row = 0; row < rows; row++) {
    const offset = stagger && row % 2 === 1 ? rowHeight * aspect * 0.5 : 0;
    let x = -offset - rowHeight * aspect;
    while (x < size) {
      const w = rowHeight * aspect * (0.72 + rand() * 0.56);
      blocks.push({ x, y: row * rowHeight, w, h: rowHeight });
      x += w;
    }
  }
  return blocks;
}

const LAYOUT: Record<StoneVariant, { rows: number; aspect: number; joint: number; tone: number; chip: number }> = {
  ashlar: { rows: 7, aspect: 2.0, joint: 0.055, tone: 96, chip: 1 },
  vault: { rows: 9, aspect: 1.25, joint: 0.06, tone: 88, chip: 0.8 },
  flagstone: { rows: 4, aspect: 1.5, joint: 0.075, tone: 78, chip: 1.5 },
  plinth: { rows: 3, aspect: 2.4, joint: 0.05, tone: 84, chip: 1.2 },
  rubble: { rows: 13, aspect: 1.1, joint: 0.11, tone: 82, chip: 2 },
};

export function stoneMaps(variant: StoneVariant, options: StoneOptions = {}): StoneMaps {
  const size = options.size ?? 512;
  const damp = options.damp ?? 0;
  const moss = options.moss ?? 0;
  const seed = options.seed ?? 991733;
  const layout = LAYOUT[variant];
  const tone = options.tone ?? layout.tone;

  const key = `${variant}|${size}|${damp}|${moss}|${tone}|${seed}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const rand = makeRandom(seed);
  const [albedoCanvas, albedo] = surface(size);
  const [heightCanvas, height] = surface(size);
  const [roughCanvas, rough] = surface(size);

  // Mortar, behind everything: dark, recessed, and the roughest thing on the wall.
  albedo.fillStyle = '#12141a';
  albedo.fillRect(0, 0, size, size);
  height.fillStyle = grey(70);
  height.fillRect(0, 0, size, size);
  rough.fillStyle = grey(252);
  rough.fillRect(0, 0, size, size);

  const joint = Math.max(1.5, (size / layout.rows) * layout.joint);
  const laid = courses(size, rand, layout.rows, layout.aspect, variant !== 'flagstone');

  for (const block of laid) {
    // 'vault' is the same masonry turned ninety degrees: in UV terms its courses then
    // run along u, which on a barrel vault is the direction that rings the arch, so
    // the vault reads as rings of voussoirs rather than as planks running its length.
    const bx = (variant === 'vault' ? block.y : block.x) + joint / 2;
    const by = (variant === 'vault' ? block.x : block.y) + joint / 2;
    const bw = (variant === 'vault' ? block.h : block.w) - joint;
    const bh = (variant === 'vault' ? block.w : block.h) - joint;
    if (bw < 2 || bh < 2) continue;

    const face = tone * (0.84 + rand() * 0.34);
    // Limestone reads faintly blue in shadow, which is what keeps it from looking
    // like brown cardboard against the site's near-black background.
    albedo.fillStyle = `rgb(${(face * 0.98) | 0}, ${face | 0}, ${(face * 1.1) | 0})`;
    albedo.fillRect(bx, by, bw, bh);

    const top = 186 + rand() * 46;
    height.fillStyle = grey(top);
    height.fillRect(bx, by, bw, bh);

    const grit = 208 + rand() * 34;
    rough.fillStyle = grey(grit);
    rough.fillRect(bx, by, bw, bh);

    // Arris: every dressed block is chamfered or worn back at its edges. Four inset
    // strokes fall away in height and darken in albedo, which is the single detail
    // that stops a wall of rectangles reading as a wall of rectangles.
    for (let k = 0; k < 4; k++) {
      albedo.strokeStyle = `rgba(0,0,0,${0.14 - k * 0.032})`;
      albedo.lineWidth = 1;
      albedo.strokeRect(bx + k + 0.5, by + k + 0.5, bw - 2 * k - 1, bh - 2 * k - 1);
      height.strokeStyle = grey(top - (4 - k) * 26);
      height.lineWidth = 1;
      height.strokeRect(bx + k + 0.5, by + k + 0.5, bw - 2 * k - 1, bh - 2 * k - 1);
    }
    // A lit top arris and a shadowed bottom one: cheap directional relief that
    // survives even where the normal map is washed out by a torch.
    albedo.fillStyle = `rgba(255,255,255,${0.045 + rand() * 0.04})`;
    albedo.fillRect(bx + 2, by + 2, bw - 4, 1.5);
    albedo.fillStyle = 'rgba(0,0,0,0.3)';
    albedo.fillRect(bx + 2, by + bh - 3.5, bw - 4, 2);

    // Pitting. Pits are darker, lower and rougher than the face around them.
    const pits = Math.round((bw * bh) / (420 / layout.chip));
    for (let i = 0; i < pits; i++) {
      const px = bx + 3 + rand() * Math.max(1, bw - 7);
      const py = by + 3 + rand() * Math.max(1, bh - 7);
      const pw = 1 + rand() * 3.2;
      const ph = 1 + rand() * 2.4;
      albedo.fillStyle = `rgba(0,0,0,${0.06 + rand() * 0.16})`;
      albedo.fillRect(px, py, pw, ph);
      height.fillStyle = `rgba(0,0,0,${0.12 + rand() * 0.22})`;
      height.fillRect(px, py, pw, ph);
      rough.fillStyle = `rgba(255,255,255,${0.1 + rand() * 0.2})`;
      rough.fillRect(px, py, pw, ph);
    }

    // One block in seven is cracked across its face.
    if (rand() < 0.14 && bw > 12) {
      let cx = bx + 2 + rand() * (bw - 4);
      let cy = by;
      albedo.strokeStyle = 'rgba(0,0,0,0.45)';
      height.strokeStyle = 'rgba(0,0,0,0.5)';
      albedo.lineWidth = height.lineWidth = 1;
      albedo.beginPath();
      height.beginPath();
      albedo.moveTo(cx, cy);
      height.moveTo(cx, cy);
      while (cy < by + bh) {
        cx += (rand() - 0.5) * 5;
        cy += 2 + rand() * 4;
        albedo.lineTo(cx, cy);
        height.lineTo(cx, cy);
      }
      albedo.stroke();
      height.stroke();
    }
  }

  // Damp. Water finds the same lines down a wall every time, so these are vertical,
  // varied in width, and stop at varied depths. Wet stone is darker AND smoother:
  // without the roughness half it reads as dirt rather than water.
  const streaks = Math.round(damp * 22);
  for (let i = 0; i < streaks; i++) {
    const x = rand() * size;
    const w = 2 + rand() * 16;
    const to = size * (0.35 + rand() * 0.65);
    const wet = albedo.createLinearGradient(0, 0, 0, to);
    wet.addColorStop(0, 'rgba(26,32,42,0.72)');
    wet.addColorStop(0.7, 'rgba(30,36,46,0.4)');
    wet.addColorStop(1, 'rgba(40,46,56,0)');
    albedo.globalCompositeOperation = 'multiply';
    albedo.fillStyle = wet;
    albedo.fillRect(x, 0, w, to);
    albedo.globalCompositeOperation = 'source-over';

    const sheen = rough.createLinearGradient(0, 0, 0, to);
    // Not glass. Taking damp stone below about 0.45 roughness turns a large surface
    // into a mirror for whatever cool light is in the rig, and a walkway lit that way
    // reads as ice rather than as water.
    sheen.addColorStop(0, 'rgba(118,118,118,0.8)');
    sheen.addColorStop(1, 'rgba(170,170,170,0)');
    rough.fillStyle = sheen;
    rough.fillRect(x, 0, w, to);
  }

  // Moss, along the bottom edge of the tile. Everything that uses this maps v = 0 to
  // the foot of the surface and does not repeat vertically, so the band stays put
  // instead of striping the wall.
  if (moss > 0) {
    const band = size * (0.16 + moss * 0.2);
    const clumps = Math.round(moss * size * 0.55);
    for (let i = 0; i < clumps; i++) {
      const x = rand() * size;
      const bias = rand() * rand();
      const y = size - bias * band;
      const r = 1 + rand() * 3.4;
      const green = 52 + rand() * 40;
      albedo.fillStyle = `rgba(${(green * 0.62) | 0}, ${green | 0}, ${(green * 0.5) | 0}, ${0.28 + rand() * 0.42})`;
      albedo.beginPath();
      albedo.arc(x, y, r, 0, Math.PI * 2);
      albedo.fill();
      height.fillStyle = `rgba(255,255,255,${0.06 + rand() * 0.1})`;
      height.beginPath();
      height.arc(x, y, r, 0, Math.PI * 2);
      height.fill();
      rough.fillStyle = `rgba(255,255,255,${0.2 + rand() * 0.3})`;
      rough.beginPath();
      rough.arc(x, y, r, 0, Math.PI * 2);
      rough.fill();
    }
  }

  const maps: StoneMaps = {
    map: finish(new THREE.CanvasTexture(albedoCanvas), THREE.SRGBColorSpace),
    normalMap: finish(new THREE.CanvasTexture(normalFrom(height, heightCanvas, size)), THREE.NoColorSpace),
    roughnessMap: finish(new THREE.CanvasTexture(roughCanvas), THREE.NoColorSpace),
  };
  cache.set(key, maps);
  return maps;
}

function finish(texture: THREE.CanvasTexture, colorSpace: THREE.ColorSpace) {
  texture.colorSpace = colorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  // Clamped to the device maximum on upload, so 8 is a ceiling rather than a demand.
  texture.anisotropy = 8;
  return texture;
}

/**
 * Sobel over the height field.
 *
 * v runs up while canvas y runs down, hence the inverted vertical difference: get that
 * backwards and every stone reads as a hole. Indices wrap with a bitmask, which is why
 * the texture size has to stay a power of two.
 */
function normalFrom(height: Ctx, canvas: HTMLCanvasElement, size: number): HTMLCanvasElement {
  const src = height.getImageData(0, 0, size, size).data;
  const mask = size - 1;
  const out = new ImageData(size, size);
  const dst = out.data;
  const at = (x: number, y: number) => src[(((y & mask) * size + (x & mask)) << 2)] / 255;
  const strength = 5.2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = -(at(x + 1, y) - at(x - 1, y)) * 0.5 * strength;
      const ny = -(at(x, y - 1) - at(x, y + 1)) * 0.5 * strength;
      const inv = 1 / Math.hypot(nx, ny, 1);
      const i = (y * size + x) << 2;
      dst[i] = (nx * inv * 0.5 + 0.5) * 255;
      dst[i + 1] = (ny * inv * 0.5 + 0.5) * 255;
      dst[i + 2] = (inv * 0.5 + 0.5) * 255;
      dst[i + 3] = 255;
    }
  }

  const [normalCanvas, ctx] = surface(size);
  ctx.putImageData(out, 0, 0);
  void canvas;
  return normalCanvas;
}

/**
 * The same generated maps at a different tiling density.
 *
 * Clones share their Source, so this costs a few descriptor objects rather than
 * another upload of the pixels.
 */
export function tiled(maps: StoneMaps, repeatX: number, repeatY: number, flipV = false): StoneMaps {
  const clone = (t: THREE.CanvasTexture) => {
    const c = t.clone();
    // A negative repeat with a matching offset mirrors v. Needed wherever the surface
    // the texture lands on runs its v the opposite way to the tile, a floor plane laid
    // flat, for one, whose v = 0 edge ends up at the front of the walkway rather than
    // against the wall, putting the moss where the traffic is.
    c.repeat.set(repeatX, flipV ? -repeatY : repeatY);
    if (flipV) c.offset.set(0, 1);
    return c;
  };
  return { map: clone(maps.map), normalMap: clone(maps.normalMap), roughnessMap: clone(maps.roughnessMap) };
}

/**
 * A soft round falloff, used for torch haloes, dust motes and painted pools of light.
 * One texture shared by all of them; additive blending does the rest.
 */
let glowCache: THREE.CanvasTexture | null = null;

export function glowTexture(): THREE.CanvasTexture {
  if (glowCache) return glowCache;
  const size = 128;
  const [canvas, ctx] = surface(size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.16)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  glowCache = new THREE.CanvasTexture(canvas);
  glowCache.colorSpace = THREE.SRGBColorSpace;
  return glowCache;
}

/**
 * A cobweb: threads spun from one corner, with a few spiral courses across them.
 * Drawn into alpha only, so it can be tinted by the material and lit by a torch.
 */
let webCache: THREE.CanvasTexture | null = null;

export function cobwebTexture(): THREE.CanvasTexture {
  if (webCache) return webCache;
  const size = 256;
  const [canvas, ctx] = surface(size);
  const rand = makeRandom(20873);
  const radials: number[] = [];
  for (let i = 0; i < 9; i++) radials.push((Math.PI / 2) * (i / 8) + (rand() - 0.5) * 0.06);

  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1;
  for (const a of radials) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * size * 1.4, Math.sin(a) * size * 1.4);
    ctx.stroke();
  }
  // Catenaries between neighbouring radials: a web sags, and the sag is what makes it
  // read as thread rather than as a drawn fan.
  for (let ring = 1; ring <= 7; ring++) {
    const r = (ring / 7) * size * 0.98 * (0.7 + rand() * 0.45);
    ctx.strokeStyle = `rgba(255,255,255,${0.42 - ring * 0.035})`;
    ctx.beginPath();
    for (let i = 0; i < radials.length; i++) {
      const a = radials[i];
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else {
        const p = radials[i - 1];
        const mid = (p + a) / 2;
        const sag = r * (0.86 - rand() * 0.06);
        ctx.quadraticCurveTo(Math.cos(mid) * sag, Math.sin(mid) * sag, x, y);
      }
    }
    ctx.stroke();
  }

  webCache = new THREE.CanvasTexture(canvas);
  webCache.colorSpace = THREE.SRGBColorSpace;
  return webCache;
}
