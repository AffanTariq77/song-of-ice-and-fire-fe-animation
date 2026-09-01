import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Geometry helpers for the corridor.
 *
 * Everything static is built once, merged, and drawn as a single mesh per material.
 * A bay's worth of masonry is thirty-odd boxes; ten bays of it as separate meshes is
 * three hundred draw calls for a strip two hundred pixels tall. Merged it is one.
 *
 * The other job here is texel density. A BoxGeometry maps 0-1 across every face
 * regardless of that face's size, so a pier and a wall panel drawn with the same
 * material would show stones of wildly different sizes. Every box therefore has its
 * UVs rescaled into world units against a shared tile size, and the materials that
 * consume them keep `repeat` at 1.
 */

/** World units covered by one repeat of a stone texture. */
export const TILE = 2.2;
export const FLOOR_TILE = 1.7;

export function makeRandom(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

export type BlockSpec = {
  w: number;
  h: number;
  d: number;
  x: number;
  y: number;
  z: number;
  rx?: number;
  ry?: number;
  rz?: number;
  tile?: number;
};

const FACE_SPANS = (w: number, h: number, d: number): [number, number][] => [
  [d, h], // +x
  [d, h], // -x
  [w, d], // +y
  [w, d], // -y
  [w, h], // +z
  [w, h], // -z
];

/**
 * One dressed block, UV-mapped in world units and offset into the tile at random so
 * two blocks of the same size do not show the same stones.
 */
export function block(spec: BlockSpec, rand: () => number): THREE.BufferGeometry {
  const { w, h, d, x, y, z, rx = 0, ry = 0, rz = 0, tile = TILE } = spec;
  const geometry = new THREE.BoxGeometry(w, h, d);

  const uv = geometry.attributes.uv as THREE.BufferAttribute;
  const spans = FACE_SPANS(w, h, d);
  for (let face = 0; face < 6; face++) {
    const [su, sv] = spans[face];
    const ou = rand() * 4;
    const ov = rand() * 4;
    for (let i = 0; i < 4; i++) {
      const index = face * 4 + i;
      uv.setXY(index, (uv.getX(index) * su) / tile + ou, (uv.getY(index) * sv) / tile + ov);
    }
  }
  uv.needsUpdate = true;

  if (rx || ry || rz) {
    geometry.applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)));
  }
  geometry.translate(x, y, z);
  return geometry;
}

export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  // A phone-width strip can end up with no sconces and therefore no brackets to
  // merge. mergeGeometries reads geometries[0] without checking, so the empty case
  // has to be caught here rather than at every call site.
  if (parts.length === 0) {
    const empty = new THREE.BufferGeometry();
    empty.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
    empty.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(9), 3));
    empty.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(6), 2));
    return empty;
  }
  const merged = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!merged) throw new Error('corridor: geometries did not merge');
  merged.computeBoundingSphere();
  return merged;
}

/**
 * A round-arched opening: a rectangle whose head is a half circle, so the arch is
 * semicircular and its springing is at `straight`. Romanesque rather than Gothic,
 * which is what a barrel vault implies structurally.
 */
export function archShape(halfWidth: number, straight: number): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(-halfWidth, 0);
  shape.lineTo(-halfWidth, straight);
  shape.absarc(0, straight, halfWidth, Math.PI, 0, true);
  shape.lineTo(halfWidth, 0);
  shape.closePath();
  return shape;
}

/** The same outline as a Path, for use as a hole. */
export function archHole(cx: number, y0: number, halfWidth: number, straight: number): THREE.Path {
  const path = new THREE.Path();
  path.moveTo(cx - halfWidth, y0);
  path.lineTo(cx - halfWidth, y0 + straight);
  path.absarc(cx, y0 + straight, halfWidth, Math.PI, 0, true);
  path.lineTo(cx + halfWidth, y0);
  path.closePath();
  return path;
}

/**
 * The far wall as one extruded slab with its openings cut clean through.
 *
 * Cutting real holes rather than assembling the wall out of piers and spandrels is
 * what gives every opening a reveal: the thickness of the wall is visible down the
 * side of each arch, and a torch two bays away lights one jamb and not the other.
 * The bevel is the chamfer a mason would work on the arris.
 *
 * ExtrudeGeometry's default UV generator emits world coordinates, so the material that
 * consumes this keeps `repeat` at 1 / TILE rather than at 1.
 */
export function wallGeometry(
  width: number,
  bottom: number,
  top: number,
  depth: number,
  holes: THREE.Path[],
): THREE.BufferGeometry {
  const outline = new THREE.Shape();
  outline.moveTo(-width / 2, bottom);
  outline.lineTo(width / 2, bottom);
  outline.lineTo(width / 2, top);
  outline.lineTo(-width / 2, top);
  outline.closePath();
  outline.holes = holes;

  const geometry = new THREE.ExtrudeGeometry(outline, {
    depth,
    curveSegments: 14,
    bevelEnabled: true,
    bevelThickness: 0.045,
    bevelSize: 0.045,
    bevelOffset: 0,
    bevelSegments: 1,
  });
  geometry.computeVertexNormals();
  return geometry;
}

export type RibSpec = {
  x: number;
  springY: number;
  vaultZ: number;
  radius: number;
  /** Voussoirs across the full half circle. */
  count: number;
  /** Along the corridor. */
  width: number;
  /** Radially inward from the vault surface. */
  thickness: number;
};

/**
 * A transverse rib: a half ring of voussoirs stepping round the barrel from one wall
 * head to the other, with a taller keystone at the crown.
 *
 * Only the far quarter of the arc is ever on screen, the rest passes above and behind
 * the camera, but the whole ring is built anyway. It is one draw call either way, and
 * the near haunch is what stops the frame's top edge from being a hard line.
 *
 * The ring lies in the y-z plane. A point at angle t sits at y = springY + r sin t and
 * z = vaultZ - r cos t, so t = 0 lands on the far wall head and t = pi on the near one.
 * Rotating each voussoir by t - pi/2 about x turns its local y radial and its local z
 * tangential, which is the orientation a wedge of stone is actually cut to.
 */
export function ribGeometry(spec: RibSpec, rand: () => number): THREE.BufferGeometry {
  const { x, springY, vaultZ, radius, count, width, thickness } = spec;
  const step = Math.PI / count;
  const parts: THREE.BufferGeometry[] = [];

  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) * step;
    const keystone = Math.abs(t - Math.PI / 2) < step * 0.5;
    const depth = thickness * (keystone ? 1.5 : 0.9 + rand() * 0.22);
    const r = radius - depth / 2 + (rand() - 0.5) * 0.016;
    parts.push(
      block(
        {
          w: width * (keystone ? 1.2 : 0.93 + rand() * 0.14),
          h: depth,
          d: radius * step * (keystone ? 1.05 : 0.94),
          x,
          y: springY + r * Math.sin(t),
          z: vaultZ - r * Math.cos(t),
          rx: t - Math.PI / 2,
        },
        rand,
      ),
    );
  }

  return merge(parts);
}
