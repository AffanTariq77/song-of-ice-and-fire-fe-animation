'use client';

import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { stoneTexture } from '@/lib/stone-texture';

/** Where the rats' feet land, as a fraction of viewport height from the top. */
export const LEDGE_Y = 0.85;

/** World units between one arched window and the next. */
const BAY_WIDTH = 3.4;

/**
 * The footer's stone undercroft: a coursed wall of round-arched barred windows with
 * torch sconces between them, and a ledge along the base for the rats to run on.
 *
 * Built from geometry rather than an image so it spans any viewport width without
 * tiling seams, and so the torches are real lights: the rats are lit by them, pass
 * through the pools they cast, and darken between them.
 */
export function Corridor() {
  const { viewport, camera } = useThree();
  const texture = useMemo(() => stoneTexture(), []);

  const ledgeY = viewport.height / 2 - LEDGE_Y * viewport.height;

  /**
   * viewport is measured at z = 0, but the wall sits behind that, so under perspective
   * it covers less of the frame than its own width suggests. Everything set back has
   * to be scaled by how much further from the camera it is, or the corridor ends
   * before the strip does and the footer shows black wedges at both edges.
   */
  const camZ = camera.position.z;
  const spread = (z: number) => (camZ - z) / camZ;

  const WALL_Z = -1.8;
  const wallSpread = spread(WALL_Z);
  const wallWidth = viewport.width * wallSpread * 1.06;
  const wallHeight = Math.max(viewport.height * wallSpread * 1.9, 6);
  const bays = Math.ceil(wallWidth / BAY_WIDTH) + 1;
  const ledgeWidth = viewport.width * spread(-0.55) * 1.06;

  const wallTexture = useMemo(() => {
    const t = texture.clone();
    t.needsUpdate = true;
    t.repeat.set(wallWidth / 4.5, wallHeight / 4.5);
    return t;
  }, [texture, wallWidth, wallHeight]);

  // One arch outline, reused for every window: a rectangle whose top is a half circle.
  const archShape = useMemo(() => {
    const w = 0.62;
    const straight = 0.34;
    const shape = new THREE.Shape();
    shape.moveTo(-w, 0);
    shape.lineTo(-w, straight);
    shape.absarc(0, straight, w, Math.PI, 0, true);
    shape.lineTo(w, 0);
    shape.closePath();
    return shape;
  }, []);

  const torches = useRef<{ light: THREE.PointLight; flame: THREE.Mesh; phase: number }[]>([]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    for (const torch of torches.current) {
      if (!torch) continue;
      // Two incommensurate sines plus a fast wobble: no repeating pattern, but
      // deterministic, so it never flashes distractingly.
      const f =
        0.78 +
        0.14 * Math.sin(t * 7.3 + torch.phase) +
        0.09 * Math.sin(t * 11.9 + torch.phase * 2.1) +
        0.05 * Math.sin(t * 23.1 + torch.phase * 0.7);
      torch.light.intensity = 4.2 * f;
      // Only a slight vertical stretch: any more and the flame reads as a wobbling
      // blob rather than a fire.
      torch.flame.scale.set(1, 0.92 + 0.16 * f, 1);
    }
  });

  const bayItems = [];
  for (let i = 0; i < bays; i++) {
    const x = -wallWidth / 2 + (i + 0.5) * BAY_WIDTH;
    const windowY = ledgeY + 1.15;
    const torchX = x + BAY_WIDTH / 2;
    const phase = i * 2.399;

    bayItems.push(
      <group key={`bay-${i}`}>
        {/* Recess: the dark of whatever is behind the wall. */}
        <mesh position={[x, windowY, -1.55]}>
          <shapeGeometry args={[archShape]} />
          <meshBasicMaterial color="#070a10" />
        </mesh>
        {/* Surround, sitting slightly proud of the wall face. */}
        <mesh position={[x, windowY, -1.72]} scale={[1.16, 1.16, 1]}>
          <shapeGeometry args={[archShape]} />
          <meshStandardMaterial map={wallTexture} color="#9d9284" roughness={0.95} metalness={0} />
        </mesh>
        {/* Bars. */}
        {[-0.32, 0, 0.32].map((bx) => (
          <mesh key={bx} position={[x + bx, windowY + 0.42, -1.5]}>
            <boxGeometry args={[0.045, 1.5, 0.045]} />
            <meshStandardMaterial color="#22252c" roughness={0.6} metalness={0.75} />
          </mesh>
        ))}
        <mesh position={[x, windowY + 0.36, -1.5]}>
          <boxGeometry args={[1.2, 0.045, 0.045]} />
          <meshStandardMaterial color="#22252c" roughness={0.6} metalness={0.75} />
        </mesh>

        {/* Torch: bracket, flame, and the light it actually casts. */}
        <mesh position={[torchX, windowY + 0.1, -1.35]}>
          <boxGeometry args={[0.1, 0.42, 0.1]} />
          <meshStandardMaterial color="#1b1d22" roughness={0.8} metalness={0.5} />
        </mesh>
        <mesh
          position={[torchX, windowY + 0.44, -1.3]}
          ref={(mesh) => {
            if (!mesh) return;
            torches.current[i] = { ...(torches.current[i] ?? { phase }), flame: mesh, phase } as never;
          }}
        >
          <sphereGeometry args={[0.085, 10, 10]} />
          <meshBasicMaterial color="#ffd9a0" />
        </mesh>
        {/* Halo: a soft additive bloom, so the flame reads as burning rather than as a
            bright dot painted on the wall. */}
        <mesh position={[torchX, windowY + 0.46, -1.34]}>
          <sphereGeometry args={[0.22, 12, 12]} />
          <meshBasicMaterial color="#f2823a" transparent opacity={0.3} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
        <pointLight
          position={[torchX, windowY + 0.5, -1.05]}
          color="#f2823a"
          intensity={4.2}
          distance={5.2}
          decay={2}
          ref={(light) => {
            if (!light) return;
            torches.current[i] = { ...(torches.current[i] ?? { phase }), light, phase } as never;
          }}
        />
      </group>,
    );
  }

  return (
    <group>
      {/* Back wall. */}
      <mesh position={[0, ledgeY + wallHeight / 2 - 0.2, WALL_Z]}>
        <planeGeometry args={[wallWidth, wallHeight]} />
        <meshStandardMaterial map={wallTexture} color="#8a8175" roughness={0.98} metalness={0} />
      </mesh>

      {bayItems}

      {/* The ledge the rats run along, its top exactly on their ground line. */}
      <mesh position={[0, ledgeY - 0.3, -0.55]}>
        <boxGeometry args={[ledgeWidth, 0.6, 1.5]} />
        <meshStandardMaterial map={wallTexture} color="#4a453e" roughness={0.97} metalness={0} />
      </mesh>
      {/* A lip along the front edge, catching the torchlight. */}
      <mesh position={[0, ledgeY - 0.06, 0.18]}>
        <boxGeometry args={[ledgeWidth, 0.12, 0.22]} />
        <meshStandardMaterial map={wallTexture} color="#5d564b" roughness={0.9} metalness={0} />
      </mesh>
    </group>
  );
}
