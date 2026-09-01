'use client';

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { stoneMaps, tiled } from '@/lib/stone-material';
import type { QualitySettings } from '@/lib/quality';
import { FAR_Z, NEAR_Z, VAULT_R, WALL_D, type CorridorLayout } from './layout';
import { TILE, FLOOR_TILE, archHole, block, makeRandom, merge, ribGeometry, wallGeometry } from './build';

/** Window opening, measured up from the walkway. */
const SILL_TOP = 0.5;
const LIGHT_HALF = 0.62;
const LIGHT_STRAIGHT = 0.61;
/** Passage opening, from the walkway itself: no sill, you could walk through it. */
const PASSAGE_HALF = 1.15;
const PASSAGE_STRAIGHT = 0.62;

const PIER_W = 0.5;
const PIER_D = 0.2;
const PLINTH_H = 0.4;

/**
 * The masonry: far wall, plinth, piers, imposts, transverse ribs, barrel vault and
 * walkway. Everything static, everything merged, four draw calls in total.
 */
export function Shell({ layout, quality }: { layout: CorridorLayout; quality: QualitySettings }) {
  const { walkY, springY, vaultZ, width, piers, bayCentres, passages } = layout;
  const size = quality.textureSize;

  // --- materials -----------------------------------------------------------------

  const wallMaterial = useMemo(() => {
    // The wall slab is an ExtrudeGeometry, whose UV generator emits world coordinates,
    // so its tiling is set on the texture rather than baked into the geometry.
    const maps = tiled(stoneMaps('ashlar', { size, damp: 0.5, seed: 991733 }), 1 / TILE, 1 / TILE);
    return new THREE.MeshStandardMaterial({ ...maps, color: '#8d8478', roughness: 1, metalness: 0 });
  }, [size]);

  const dressingMaterial = useMemo(() => {
    // Merged blocks carry world-unit UVs already, so this stays at repeat 1.
    const maps = stoneMaps('ashlar', { size, damp: 0.35, tone: 104, seed: 40213 });
    return new THREE.MeshStandardMaterial({ ...maps, color: '#948a7d', roughness: 1, metalness: 0 });
  }, [size]);

  const plinthMaterial = useMemo(() => {
    // Repeat 1 vertically on purpose: the moss is drawn along the bottom edge of the
    // tile, and tiling it up the plinth would stripe the wall with hedges.
    const maps = tiled(stoneMaps('plinth', { size, damp: 0.85, moss: 0.8, seed: 55231 }), width / TILE, 1);
    return new THREE.MeshStandardMaterial({ ...maps, color: '#7d7568', roughness: 1, metalness: 0 });
  }, [size, width]);

  const vaultMaterial = useMemo(() => {
    const arc = Math.PI * VAULT_R;
    const maps = tiled(stoneMaps('vault', { size, damp: 0.5, seed: 70117 }), arc / TILE, width / TILE);
    return new THREE.MeshStandardMaterial({
      ...maps,
      color: '#7f776c',
      roughness: 1,
      metalness: 0,
      side: THREE.BackSide,
    });
  }, [size, width]);

  const floorMaterial = useMemo(() => {
    const maps = stoneMaps('flagstone', { size, damp: 0.2, seed: 13337 });
    return new THREE.MeshStandardMaterial({ ...maps, color: '#77705f', roughness: 1, metalness: 0 });
  }, [size]);

  const floorTopMaterial = useMemo(() => {
    // Depth maps to exactly one tile so the moss band lands along the wall joint,
    // where water sits and nothing ever walks.
    // No damp streaks on the wearing surface. They tile along v, which on a floor runs
    // front to back, so what they produce is a set of diagonal glossy slats catching
    // every cool light in the rig, a corridor with a blue cattle grid down it. Water
    // on the walkway is the puddles, which are placed rather than tiled.
    const maps = tiled(stoneMaps('flagstone', { size, moss: 0.55, seed: 8821 }), width / FLOOR_TILE, 1, true);
    return new THREE.MeshStandardMaterial({ ...maps, color: '#7b7468', roughness: 1, metalness: 0 });
  }, [size, width]);

  const ironMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#191b20', roughness: 0.52, metalness: 0.85 }),
    [],
  );

  const voidMaterial = useMemo(
    () => new THREE.MeshBasicMaterial({ color: '#04060a' }),
    [],
  );

  const puddleMaterial = useMemo(
    () =>
      // Standing water, not ice. Roughness this low on a large surface turns the whole
      // walkway into a mirror for the cool rim light, which is how a corridor ends up
      // with a blue slick down the middle of it.
      new THREE.MeshStandardMaterial({
        color: '#090d13',
        roughness: 0.18,
        metalness: 0,
        transparent: true,
        opacity: 0.85,
      }),
    [],
  );

  // --- geometry ------------------------------------------------------------------

  const lights = useMemo(
    () => bayCentres.filter((x) => !passages.includes(x)),
    [bayCentres, passages],
  );

  const wall = useMemo(() => {
    const holes = [
      ...lights.map((x) => archHole(x, walkY + SILL_TOP, LIGHT_HALF, LIGHT_STRAIGHT)),
      ...passages.map((x) => archHole(x, walkY, PASSAGE_HALF, PASSAGE_STRAIGHT)),
    ];
    // Down to walkY - 0.7 so the wall foot is buried behind the walkway rather than
    // meeting it in a line that opens up the moment the strip changes height.
    return wallGeometry(width, walkY - 0.7, springY, WALL_D, holes);
  }, [width, walkY, springY, lights, passages]);

  const dressing = useMemo(() => {
    const rand = makeRandom(6151);
    const parts: THREE.BufferGeometry[] = [];
    const face = FAR_Z;

    // Impost course: the horizontal band the whole vault sits on, and the strongest
    // line in the composition. Everything above it curves, everything below it stands.
    parts.push(block({ w: width, h: 0.16, d: 0.3, x: 0, y: springY - 0.08, z: face + 0.02 }, rand));
    parts.push(block({ w: width, h: 0.07, d: 0.38, x: 0, y: springY - 0.19, z: face + 0.05 }, rand));

    for (const x of piers) {
      // Pier, plinth-to-impost, with a chamfered base and a corbel under the cap.
      parts.push(block({ w: PIER_W, h: springY - walkY - 0.22, d: PIER_D, x, y: walkY + (springY - walkY - 0.22) / 2, z: face + PIER_D / 2 }, rand));
      parts.push(block({ w: PIER_W + 0.16, h: 0.18, d: PIER_D + 0.08, x, y: walkY + 0.09, z: face + (PIER_D + 0.08) / 2 }, rand));
      parts.push(block({ w: PIER_W + 0.2, h: 0.14, d: PIER_D + 0.14, x, y: springY - 0.29, z: face + (PIER_D + 0.14) / 2 }, rand));
      // Corbel: a wedge under the cap, tilted so it reads as carrying a load.
      parts.push(block({ w: PIER_W - 0.06, h: 0.2, d: 0.26, x, y: springY - 0.5, z: face + 0.14, rx: 0.22 }, rand));
    }

    for (const x of lights) {
      // Sill, tilted to throw water clear of the wall.
      parts.push(block({ w: LIGHT_HALF * 2 + 0.5, h: 0.13, d: 0.42, x, y: walkY + SILL_TOP - 0.05, z: face + 0.1, rx: -0.13 }, rand));
      // Hood mould over the arch, half a torus lying in the wall plane.
      const hood = new THREE.TorusGeometry(LIGHT_HALF + 0.13, 0.055, 5, 14, Math.PI);
      hood.translate(x, walkY + SILL_TOP + LIGHT_STRAIGHT, face + 0.06);
      parts.push(hood);
    }

    for (const x of passages) {
      const hood = new THREE.TorusGeometry(PASSAGE_HALF + 0.15, 0.07, 5, 18, Math.PI);
      hood.translate(x, walkY + PASSAGE_STRAIGHT, face + 0.07);
      parts.push(hood);
      // Threshold: a worn step across the mouth of the passage.
      parts.push(block({ w: PASSAGE_HALF * 2 + 0.2, h: 0.09, d: 0.34, x, y: walkY + 0.045, z: face + 0.1 }, rand));
    }

    // Kerb along the wall foot, and a chamfered nosing along the front lip. The nosing
    // is the only edge in the scene a torch can catch from underneath, which is what
    // separates the walkway from the black below it.
    parts.push(block({ w: width, h: 0.1, d: 0.22, x: 0, y: walkY + 0.05, z: FAR_Z + 0.42 }, rand));
    parts.push(block({ w: width, h: 0.14, d: 0.14, x: 0, y: walkY - 0.02, z: NEAR_Z - 0.03, rx: Math.PI / 4 }, rand));

    return merge(parts);
  }, [width, walkY, springY, piers, lights, passages]);

  const ribs = useMemo(() => {
    const rand = makeRandom(3391);
    return merge(
      piers.map((x) =>
        ribGeometry(
          { x, springY, vaultZ, radius: VAULT_R, count: quality.voussoirs, width: PIER_W - 0.02, thickness: 0.17 },
          rand,
        ),
      ),
    );
  }, [piers, springY, vaultZ, quality.voussoirs]);

  const bars = useMemo(() => {
    const rand = makeRandom(7717);
    const parts: THREE.BufferGeometry[] = [];
    // Set into the middle of the reveal, so the wall's own thickness shades them and
    // a torch to one side lights the bars and not the jamb behind.
    const z = FAR_Z - WALL_D * 0.55;
    for (const x of lights) {
      const top = walkY + SILL_TOP + LIGHT_STRAIGHT + LIGHT_HALF * 0.55;
      const height = top - (walkY + SILL_TOP);
      for (const offset of [-0.36, 0, 0.36]) {
        parts.push(block({ w: 0.042, h: height, d: 0.042, x: x + offset, y: walkY + SILL_TOP + height / 2, z }, rand));
      }
      parts.push(block({ w: LIGHT_HALF * 1.75, h: 0.04, d: 0.05, x, y: walkY + SILL_TOP + height * 0.62, z }, rand));
      parts.push(block({ w: LIGHT_HALF * 1.75, h: 0.04, d: 0.05, x, y: walkY + SILL_TOP + height * 0.24, z }, rand));
    }
    return merge(parts);
  }, [lights, walkY]);

  const backing = useMemo(() => {
    const rand = makeRandom(2029);
    // Whatever is behind the wall is not lit and not modelled: a flat black panel a
    // little way back, so each window reads as an opening onto somewhere rather than
    // as a hole onto nothing.
    return merge(
      lights.map((x) =>
        block(
          { w: LIGHT_HALF * 2 + 0.5, h: LIGHT_STRAIGHT + LIGHT_HALF + SILL_TOP + 0.4, d: 0.05, x, y: walkY + 0.9, z: FAR_Z - WALL_D - 0.34 },
          rand,
        ),
      ),
    );
  }, [lights, walkY]);

  const puddles = useMemo(() => {
    const rand = makeRandom(9631);
    const parts: THREE.BufferGeometry[] = [];
    const count = Math.max(2, Math.round(width / 13));
    for (let i = 0; i < count; i++) {
      const w = 0.35 + rand() * 0.7;
      const d = 0.16 + rand() * 0.26;
      parts.push(
        block(
          {
            w,
            h: 0.01,
            d,
            x: (rand() - 0.5) * width * 0.94,
            y: walkY + 0.006,
            z: FAR_Z + 0.6 + rand() * 1.5,
            tile: FLOOR_TILE,
          },
          rand,
        ),
      );
    }
    return merge(parts);
  }, [width, walkY]);

  // Merged geometry is rebuilt whenever the strip is resized; without this the old
  // buffers stay on the GPU for the life of the page.
  useEffect(() => () => wall.dispose(), [wall]);
  useEffect(() => () => dressing.dispose(), [dressing]);
  useEffect(() => () => ribs.dispose(), [ribs]);
  useEffect(() => () => bars.dispose(), [bars]);
  useEffect(() => () => backing.dispose(), [backing]);
  useEffect(() => () => puddles.dispose(), [puddles]);

  const shadows = quality.shadows;

  return (
    <group>
      <mesh geometry={backing} material={voidMaterial} />
      <mesh geometry={wall} material={wallMaterial} position={[0, 0, FAR_Z - WALL_D]} receiveShadow={shadows} />
      <mesh geometry={dressing} material={dressingMaterial} receiveShadow={shadows} />
      <mesh geometry={bars} material={ironMaterial} />

      {/* Plinth. Its own box rather than part of the merged dressing, because its UVs
          have to map the moss band to the bottom of the stone and nowhere else. */}
      <mesh position={[0, walkY + PLINTH_H / 2, FAR_Z + 0.05]} material={plinthMaterial} receiveShadow={shadows}>
        <boxGeometry args={[width, PLINTH_H, 0.1]} />
      </mesh>

      {/* Barrel vault. A half cylinder with its axis along the corridor, seen from the
          inside, so BackSide. Rotating it a quarter turn about z puts the cylinder's
          own axis along x and leaves theta running from one wall head to the other. */}
      <mesh
        material={vaultMaterial}
        position={[0, springY, vaultZ]}
        rotation={[0, 0, Math.PI / 2]}
        receiveShadow={shadows}
      >
        <cylinderGeometry args={[VAULT_R, VAULT_R, width, 28, 1, true, 0, Math.PI]} />
      </mesh>
      <mesh geometry={ribs} material={dressingMaterial} castShadow={shadows} receiveShadow={shadows} />

      {/* Walkway: a solid block for the front face and sides, with its wearing surface
          laid on top as its own plane so the moss and the damp know which way is back. */}
      <mesh
        position={[0, walkY - 0.71, (FAR_Z + NEAR_Z) / 2]}
        material={floorMaterial}
        receiveShadow={shadows}
      >
        <boxGeometry args={[width, 1.4, NEAR_Z - FAR_Z]} />
      </mesh>
      <mesh
        position={[0, walkY, (FAR_Z + NEAR_Z) / 2]}
        rotation={[-Math.PI / 2, 0, 0]}
        material={floorTopMaterial}
        receiveShadow={shadows}
      >
        <planeGeometry args={[width, NEAR_Z - FAR_Z]} />
      </mesh>
      <mesh geometry={puddles} material={puddleMaterial} />
    </group>
  );
}
