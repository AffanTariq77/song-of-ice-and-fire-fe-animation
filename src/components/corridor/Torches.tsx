'use client';

import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { glowTexture } from '@/lib/stone-material';
import type { QualitySettings } from '@/lib/quality';
import { FAR_Z, type CorridorLayout } from './layout';
import { block, makeRandom, merge } from './build';

const ARM_Y = 1.02;
const BASKET_Y = 1.2;
const FLAME_Y = 1.44;
/** Front face of a pier, which is what the sconce is bolted to. */
const PIER_FACE = FAR_Z + 0.2;

/**
 * Sconces on the piers, and the light they throw.
 *
 * Only a handful get a real point light, the tier decides how many, because a
 * forward renderer pays for every light on every fragment of every lit surface, and
 * the corridor is almost entirely lit surface. The rest are painted: a flame, a halo,
 * and a soft pool multiplied onto the wall behind them. At this size the difference is
 * invisible, and it is the difference between three lights and fourteen.
 *
 * The flicker is three sines whose periods share no common multiple, so it never
 * settles into a pattern, plus the same figure driving the flame's scale and the pool's
 * opacity. Fire that brightens without also growing reads as a lamp being dimmed.
 */
export function Torches({ layout, quality }: { layout: CorridorLayout; quality: QualitySettings }) {
  const { walkY, torches, litTorches, lightBoost } = layout;
  const peak = 26 * lightBoost;
  const glow = useMemo(() => glowTexture(), []);

  // Instances collected through ref callbacks and driven directly, rather than held in
  // React state: these change sixty times a second and nothing renders off them.
  const lights = useRef<(THREE.PointLight | null)[]>([]);
  const cores = useRef<(THREE.Mesh | null)[]>([]);
  const inners = useRef<(THREE.Mesh | null)[]>([]);
  const halos = useRef<(THREE.Mesh | null)[]>([]);
  const pools = useRef<(THREE.Mesh | null)[]>([]);

  // Irrational-ish stride: neighbouring sconces never flicker together.
  const phases = useMemo(() => torches.map((x, i) => i * 2.399 + Math.abs(x) * 0.31), [torches]);

  const brackets = useMemo(() => {
    const rand = makeRandom(4523);
    const parts: THREE.BufferGeometry[] = [];
    for (const x of torches) {
      // Wall plate, pegged into the pier.
      parts.push(block({ w: 0.15, h: 0.24, d: 0.05, x, y: walkY + ARM_Y, z: PIER_FACE + 0.025 }, rand));
      // One straight arm, the way a forged bracket is. An earlier version raked the arm
      // and ringed the head with five bars, and at this size the whole assembly resolved
      // to a dark smudge with a light in it.
      parts.push(block({ w: 0.065, h: 0.065, d: 0.44, x, y: walkY + ARM_Y + 0.03, z: PIER_FACE + 0.26 }, rand));
      // Stay from low on the plate to the end of the arm: iron this long always has one,
      // and it is the only thing in the scene lit from underneath.
      parts.push(block({ w: 0.05, h: 0.46, d: 0.05, x, y: walkY + ARM_Y - 0.11, z: PIER_FACE + 0.24, rx: 0.86 }, rand));
      // Upstand carrying the cresset.
      parts.push(block({ w: 0.055, h: 0.22, d: 0.055, x, y: walkY + ARM_Y + 0.14, z: PIER_FACE + 0.46 }, rand));

      // Cresset: a shallow iron bowl, wide at the lip, holding the burning bundle.
      const bowl = new THREE.CylinderGeometry(0.14, 0.07, 0.15, 12, 1, false);
      bowl.translate(x, walkY + BASKET_Y + 0.1, PIER_FACE + 0.46);
      parts.push(bowl);
      const rim = new THREE.TorusGeometry(0.142, 0.018, 4, 14);
      rim.rotateX(Math.PI / 2);
      rim.translate(x, walkY + BASKET_Y + 0.175, PIER_FACE + 0.46);
      parts.push(rim);
    }
    return merge(parts);
  }, [torches, walkY]);

  useEffect(() => () => brackets.dispose(), [brackets]);

  const iron = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#16181d', roughness: 0.48, metalness: 0.88 }),
    [],
  );

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    for (let i = 0; i < phases.length; i++) {
      const phase = phases[i];
      const f =
        0.78 +
        0.15 * Math.sin(t * 7.3 + phase) +
        0.09 * Math.sin(t * 11.9 + phase * 2.1) +
        0.05 * Math.sin(t * 23.1 + phase * 0.7);

      const light = lights.current[i];
      if (light) light.intensity = peak * f;
      const core = cores.current[i];
      if (core) core.scale.set(0.92 + 0.12 * f, 0.78 + 0.42 * f, 0.92 + 0.12 * f);
      const inner = inners.current[i];
      if (inner) inner.scale.set(0.9 + 0.2 * f, 0.82 + 0.34 * f, 1);
      const halo = halos.current[i];
      if (halo) halo.scale.setScalar(0.88 + 0.28 * f);
      const pool = pools.current[i];
      if (pool) (pool.material as THREE.MeshBasicMaterial).opacity = 0.22 + 0.15 * f;
    }
  });

  return (
    <group>
      <mesh geometry={brackets} material={iron} castShadow={quality.shadows} />

      {torches.map((x, i) => (
        <group key={`torch-${x.toFixed(3)}`}>
          {/* Pool painted on the wall. This is what makes an unlit sconce look lit. */}
          <mesh
            ref={(mesh) => {
              pools.current[i] = mesh;
            }}
            position={[x, walkY + 1.16, FAR_Z + 0.015]}
          >
            <planeGeometry args={[4.4, 3.5]} />
            <meshBasicMaterial
              map={glow}
              color="#e8813c"
              transparent
              opacity={0.28}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>

          {/* Soot. A torch has burned here for a long time. */}
          <mesh position={[x, walkY + 1.8, FAR_Z + 0.025]}>
            <planeGeometry args={[0.7, 1.1]} />
            <meshBasicMaterial map={glow} color="#07070a" transparent opacity={0.42} depthWrite={false} />
          </mesh>

          <mesh
            ref={(mesh) => {
              cores.current[i] = mesh;
            }}
            position={[x, walkY + FLAME_Y + 0.03, PIER_FACE + 0.46]}
          >
            {/* A cone, not a sphere: a flame has a tip, and at this size a sphere
                behind an additive plane resolves to a white brick sitting in the bowl. */}
            <coneGeometry args={[0.055, 0.21, 8]} />
            <meshBasicMaterial color="#ffcf8e" />
          </mesh>
          <mesh
            ref={(mesh) => {
              inners.current[i] = mesh;
            }}
            position={[x, walkY + FLAME_Y + 0.05, PIER_FACE + 0.5]}
          >
            <planeGeometry args={[0.26, 0.56]} />
            <meshBasicMaterial
              map={glow}
              color="#ff8a2c"
              transparent
              opacity={0.7}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
          <mesh
            ref={(mesh) => {
              halos.current[i] = mesh;
            }}
            position={[x, walkY + FLAME_Y + 0.07, PIER_FACE + 0.52]}
          >
            <planeGeometry args={[1.35, 1.35]} />
            <meshBasicMaterial
              map={glow}
              color="#ef7a2c"
              transparent
              opacity={0.42}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>

          {litTorches.includes(x) && (
            <pointLight
              ref={(light) => {
                lights.current[i] = light;
              }}
              position={[x, walkY + FLAME_Y + 0.02, PIER_FACE + 0.6]}
              color="#f2823a"
              intensity={peak}
              distance={11}
              decay={2}
            />
          )}
        </group>
      ))}
    </group>
  );
}
