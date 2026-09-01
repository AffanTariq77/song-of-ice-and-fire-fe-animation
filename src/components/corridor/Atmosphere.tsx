'use client';

import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { cobwebTexture, glowTexture } from '@/lib/stone-material';
import type { QualitySettings } from '@/lib/quality';
import { FAR_Z, VAULT_R, type CorridorLayout } from './layout';
import { makeRandom } from './build';

/**
 * Everything in the corridor that is not stone: dust in the torchlight, water off the
 * vault, and webs in the corners nobody reaches.
 *
 * All of it is optional and all of it is counted by tier, because none of it is load
 * bearing: the corridor reads correctly with the lot switched off. What it buys is
 * movement in the parts of the frame the rats never cross, so the strip is not a
 * photograph with six animals walking over it.
 *
 * Everything that changes per frame is written through a ref, either to an instance
 * collected by a ref callback or to a scratch array the ref owns. Nothing here is
 * React state: none of it renders anything.
 */
export function Atmosphere({ layout, quality }: { layout: CorridorLayout; quality: QualitySettings }) {
  return (
    <group>
      {quality.dust > 0 && <Dust layout={layout} count={quality.dust} />}
      {quality.drips > 0 && <Drips layout={layout} count={quality.drips} />}
      {quality.cobwebs > 0 && <Cobwebs layout={layout} count={quality.cobwebs} />}
    </group>
  );
}

/**
 * Motes drifting in front of the wall.
 *
 * Clustered on the sconces rather than spread evenly: dust is only ever visible where
 * a light catches it, so scattering it uniformly would put most of the particles in
 * the dark, paying for them and seeing nothing. Warm where a torch is close, cold and
 * nearly invisible between. The colour is baked per particle at build time, because a
 * mote never travels far enough to change which torch it belongs to.
 */
function Dust({ layout, count }: { layout: CorridorLayout; count: number }) {
  const { walkY, springY, torches, width } = layout;
  const glow = useMemo(() => glowTexture(), []);
  const positionAttribute = useRef<THREE.BufferAttribute>(null);

  const { positions, colors, bases, drift } = useMemo(() => {
    const rand = makeRandom(60013);
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const bases = new Float32Array(count * 3);
    const drift = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      // Two thirds hug a sconce, the rest fill the gaps so the band does not read as
      // a row of clouds.
      const anchor =
        torches.length && rand() < 0.68 ? torches[Math.floor(rand() * torches.length)] : (rand() - 0.5) * width;
      const x = anchor + (rand() - 0.5) * 2.6;
      const y = walkY + 0.1 + rand() * (springY - walkY + 0.5);
      const z = FAR_Z + 0.3 + rand() * 2.1;
      bases.set([x, y, z], i * 3);
      positions.set([x, y, z], i * 3);

      const near = torches.length ? Math.min(...torches.map((t) => Math.abs(t - x))) : 99;
      const warmth = Math.max(0, 1 - near / 2.4);
      colors.set([0.55 + warmth * 0.45, 0.38 + warmth * 0.32, 0.24 + warmth * 0.14], i * 3);

      // Slow, and slower vertically than horizontally: still air in a stone passage.
      drift.set([0.1 + rand() * 0.22, 0.05 + rand() * 0.12, rand() * Math.PI * 2], i * 3);
    }

    return { positions, colors, bases, drift };
  }, [count, torches, width, walkY, springY]);

  useFrame(({ clock }) => {
    const attribute = positionAttribute.current;
    if (!attribute) return;
    const t = clock.elapsedTime;
    for (let i = 0; i < count; i++) {
      const o = i * 3;
      const phase = drift[o + 2];
      attribute.setXYZ(
        i,
        bases[o] + Math.sin(t * drift[o] + phase) * 0.42,
        // Rises, then starts again from below: a mote that only oscillates reads as a
        // spark stuck on a wire.
        bases[o + 1] + (((t * drift[o + 1] + phase) % 1.6) - 0.4),
        bases[o + 2] + Math.cos(t * drift[o] * 0.7 + phase) * 0.22,
      );
    }
    attribute.needsUpdate = true;
  });

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute ref={positionAttribute} attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.045}
        map={glow}
        vertexColors
        transparent
        opacity={0.7}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  );
}

/** Runtime slots per drip, packed into one scratch array the ref owns. */
const WAIT = 0;
const ELAPSED = 1;
const FALLING = 2;
const SPLASH = 3;
const SLOTS = 4;

/**
 * Water off the vault.
 *
 * Each drip is one stretched bead falling under gravity and a ring that opens where it
 * lands. Rare on purpose: on a timer short enough to be reliably seen it stops being
 * weather and becomes a leak.
 */
function Drips({ layout, count }: { layout: CorridorLayout; count: number }) {
  const { walkY, springY, width } = layout;
  const beads = useRef<(THREE.Mesh | null)[]>([]);
  const rings = useRef<(THREE.Mesh | null)[]>([]);
  const runtime = useRef<Float32Array | null>(null);

  // Where each drip forms. Fixed: a ceiling leaks in the same place every time.
  const spots = useMemo(() => {
    const rand = makeRandom(7793);
    return Array.from({ length: count }, () => ({
      x: (rand() - 0.5) * width * 0.82,
      z: FAR_Z + 0.5 + rand() * 1.4,
      top: springY + 0.15 + rand() * Math.min(1.2, VAULT_R * 0.3),
      wait: 2 + rand() * 11,
      offset: rand() * 6,
    }));
  }, [count, width, springY]);

  useFrame((_, delta) => {
    let state = runtime.current;
    if (!state || state.length !== count * SLOTS) {
      state = new Float32Array(count * SLOTS);
      for (let i = 0; i < count; i++) {
        state[i * SLOTS + WAIT] = spots[i].wait;
        state[i * SLOTS + ELAPSED] = spots[i].offset;
      }
      runtime.current = state;
    }

    for (let i = 0; i < count; i++) {
      const spot = spots[i];
      const base = i * SLOTS;
      const bead = beads.current[i];
      const ring = rings.current[i];
      state[base + ELAPSED] += delta;

      if (state[base + FALLING] === 0) {
        if (bead) bead.visible = false;
        if (state[base + ELAPSED] >= state[base + WAIT]) {
          state[base + FALLING] = 1;
          state[base + ELAPSED] = 0;
        }
      } else {
        // s = 1/2 g t^2 with a gentle g: real gravity crosses this frame in a couple of
        // frames at this scale and reads as a flicker rather than as a drop.
        const elapsed = state[base + ELAPSED];
        const y = spot.top - 0.5 * 5.2 * elapsed * elapsed;
        if (bead) {
          bead.visible = true;
          bead.position.set(spot.x, y, spot.z);
          bead.scale.set(1, 1 + Math.min(3.4, elapsed * 5), 1);
        }
        if (y <= walkY + 0.02) {
          state[base + FALLING] = 0;
          state[base + ELAPSED] = 0;
          state[base + WAIT] = 3 + (i * 2.7) % 9;
          state[base + SPLASH] = 0.0001;
        }
      }

      const splash = state[base + SPLASH];
      if (splash > 0) {
        const life = Math.min(1, splash / 0.85);
        state[base + SPLASH] = life >= 1 ? 0 : splash + delta;
        if (ring) {
          ring.visible = true;
          ring.position.set(spot.x, walkY + 0.012, spot.z);
          ring.scale.setScalar(0.06 + life * 0.42);
          (ring.material as THREE.MeshBasicMaterial).opacity = 0.4 * (1 - life);
        }
      } else if (ring) {
        ring.visible = false;
      }
    }
  });

  return (
    <group>
      {spots.map((spot, i) => (
        <group key={`drip-${spot.x.toFixed(3)}-${i}`}>
          <mesh
            ref={(mesh) => {
              beads.current[i] = mesh;
            }}
            visible={false}
          >
            <sphereGeometry args={[0.016, 6, 6]} />
            <meshStandardMaterial color="#9db4cf" roughness={0.05} metalness={0.2} />
          </mesh>
          <mesh
            ref={(mesh) => {
              rings.current[i] = mesh;
            }}
            rotation={[-Math.PI / 2, 0, 0]}
            visible={false}
          >
            <ringGeometry args={[0.7, 1, 20]} />
            <meshBasicMaterial color="#8fa8c4" transparent opacity={0} depthWrite={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Webs in the corners of the arcade, swaying just enough to be alive. */
function Cobwebs({ layout, count }: { layout: CorridorLayout; count: number }) {
  const { walkY, springY, piers } = layout;
  const web = useMemo(() => cobwebTexture(), []);
  const webs = useRef<(THREE.Mesh | null)[]>([]);

  const placed = useMemo(() => {
    const rand = makeRandom(3701);
    const spots: { x: number; y: number; z: number; rotation: number; size: number; phase: number }[] = [];
    const usable = piers.filter((_, i) => i > 0 && i < piers.length - 1);
    for (let i = 0; i < count && usable.length; i++) {
      const pier = usable[Math.floor(rand() * usable.length)];
      const side = rand() < 0.5 ? -1 : 1;
      spots.push({
        x: pier + side * 0.34,
        // Under the impost or in the head of an arch: the two places nothing disturbs.
        y: rand() < 0.6 ? springY - 0.24 : walkY + 1.62,
        z: FAR_Z + 0.24,
        rotation: side > 0 ? Math.PI / 2 : 0,
        size: 0.34 + rand() * 0.34,
        phase: rand() * 6.28,
      });
    }
    return spots;
  }, [count, piers, springY, walkY]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    for (let i = 0; i < placed.length; i++) {
      const mesh = webs.current[i];
      if (mesh) mesh.rotation.z = placed[i].rotation + Math.sin(t * 0.6 + placed[i].phase) * 0.035;
    }
  });

  return (
    <group>
      {placed.map((spot, i) => (
        <mesh
          key={`web-${spot.x.toFixed(3)}-${i}`}
          ref={(mesh) => {
            webs.current[i] = mesh;
          }}
          position={[spot.x, spot.y, spot.z]}
          rotation={[0, 0, spot.rotation]}
        >
          <planeGeometry args={[spot.size, spot.size]} />
          <meshBasicMaterial
            map={web}
            color="#aebdcd"
            transparent
            opacity={0.22}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}
