'use client';

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { glowTexture, stoneMaps, tiled } from '@/lib/stone-material';
import type { QualitySettings } from '@/lib/quality';
import { FAR_Z, WALL_D, type CorridorLayout } from './layout';
import { TILE, block, makeRandom, merge } from './build';

/** Clear width of the passage, and therefore the radius of its own little barrel. */
const HALF = 1.15;
const SPRING = 0.62;
/** How far back it runs. Beyond the fog's reach on purpose: the end is never resolved. */
const LENGTH = 4.6;

/**
 * A passage running back out of the far wall, at right angles to the corridor.
 *
 * This is what makes the strip read as a building rather than as a wall. The main
 * corridor's depth is bounded by the frame; the passage is not, so it carries the
 * whole recession on its own: rib rings shrinking toward a vanishing point, a torch
 * far enough back that the haze has most of it, and no visible end.
 *
 * Its vault is a half cylinder with its axis along z. Rotating a quarter turn about x
 * sends the cylinder's own axis down the passage and puts theta's upper half at
 * pi/2 to 3pi/2, which is the half that ends up above the floor.
 */
export function CrossPassage({
  x,
  layout,
  quality,
}: {
  x: number;
  layout: CorridorLayout;
  quality: QualitySettings;
}) {
  const { walkY } = layout;
  const size = quality.textureSize;
  const mouth = FAR_Z - WALL_D;
  const axisY = walkY + SPRING;
  const backZ = mouth - LENGTH;

  const stone = useMemo(() => {
    const maps = stoneMaps('rubble', { size, damp: 0.9, tone: 70, seed: 31627 });
    return maps;
  }, [size]);

  const vaultMaterial = useMemo(() => {
    const arc = Math.PI * HALF;
    const maps = tiled(stone, arc / TILE, LENGTH / TILE);
    return new THREE.MeshStandardMaterial({
      ...maps,
      color: '#6a635a',
      roughness: 1,
      metalness: 0,
      side: THREE.BackSide,
    });
  }, [stone]);

  const stoneMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ ...stone, color: '#6a635a', roughness: 1, metalness: 0 }),
    [stone],
  );

  const endMaterial = useMemo(() => new THREE.MeshBasicMaterial({ color: '#04060a' }), []);

  const parts = useMemo(() => {
    const rand = makeRandom(1481 + Math.round(x * 100));
    const pieces: THREE.BufferGeometry[] = [];

    // Floor, running back level with the walkway so a rat could in principle turn down it.
    pieces.push(block({ w: HALF * 2, h: 0.12, d: LENGTH, x, y: walkY - 0.06, z: mouth - LENGTH / 2 }, rand));
    // Side walls below the springing.
    for (const side of [-1, 1]) {
      pieces.push(block({ w: 0.12, h: SPRING, d: LENGTH, x: x + side * HALF, y: walkY + SPRING / 2, z: mouth - LENGTH / 2 }, rand));
    }

    // Rib rings, spaced so they crowd together as they recede, the spacing does as
    // much for the sense of distance as the diminishing size does.
    for (let i = 0; i < quality.passageRings; i++) {
      const t = (i + 1) / (quality.passageRings + 1);
      const z = mouth - LENGTH * Math.pow(t, 0.78);
      const ring = new THREE.TorusGeometry(HALF - 0.05, 0.075, 5, 16, Math.PI);
      ring.translate(x, axisY, z);
      pieces.push(ring);
      // A pilaster under each rib, so the ring lands on something.
      for (const side of [-1, 1]) {
        pieces.push(block({ w: 0.14, h: SPRING, d: 0.2, x: x + side * (HALF - 0.09), y: walkY + SPRING / 2, z }, rand));
      }
    }

    return merge(pieces);
  }, [x, walkY, axisY, mouth, quality.passageRings]);

  useEffect(() => () => parts.dispose(), [parts]);

  const glow = useMemo(() => glowTexture(), []);
  const lampRef = useMemo(() => ({ current: null as THREE.PointLight | null }), []);
  const haloRef = useMemo(() => ({ current: null as THREE.Mesh | null }), []);
  const phase = useMemo(() => Math.abs(x) * 1.7, [x]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const flicker = 0.8 + 0.13 * Math.sin(t * 5.1 + phase) + 0.07 * Math.sin(t * 9.4 + phase * 1.9);
    if (lampRef.current) lampRef.current.intensity = 24 * flicker;
    if (haloRef.current) haloRef.current.scale.setScalar(1 + (flicker - 0.8) * 0.7);
  });

  // Far enough back that the fog has taken most of it: what reaches the strip is a
  // warm smudge at the end of a dark passage, which is the whole point of it.
  const lampZ = mouth - LENGTH * 0.42;

  return (
    <group>
      <mesh material={vaultMaterial} position={[x, axisY, mouth - LENGTH / 2]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[HALF, HALF, LENGTH, 20, 1, true, Math.PI / 2, Math.PI]} />
      </mesh>
      <mesh geometry={parts} material={stoneMaterial} />

      {/* Back stop. Fully fogged out, but without it the passage is a hole in the page. */}
      <mesh material={endMaterial} position={[x, walkY + 0.9, backZ]}>
        <planeGeometry args={[HALF * 2.4, 3]} />
      </mesh>

      <mesh position={[x - HALF + 0.16, axisY - 0.12, lampZ]}>
        <boxGeometry args={[0.12, 0.045, 0.045]} />
        <meshStandardMaterial color="#16181d" roughness={0.5} metalness={0.85} />
      </mesh>
      <mesh position={[x - HALF + 0.22, axisY, lampZ]}>
        <coneGeometry args={[0.045, 0.17, 7]} />
        <meshBasicMaterial color="#ffcf8e" />
      </mesh>
      <mesh ref={haloRef} position={[x - HALF + 0.22, axisY + 0.02, lampZ + 0.05]}>
        <planeGeometry args={[1.8, 1.8]} />
        <meshBasicMaterial
          map={glow}
          color="#f08a3e"
          transparent
          opacity={0.75}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      {quality.tier !== 'low' && (
        <pointLight ref={lampRef} position={[x - HALF + 0.3, axisY, lampZ]} color="#f0873a" intensity={24} distance={7} decay={2} />
      )}
    </group>
  );
}
