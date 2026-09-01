'use client';

import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import type { QualitySettings } from '@/lib/quality';
import { Atmosphere } from './corridor/Atmosphere';
import { CrossPassage } from './corridor/CrossPassage';
import { FAR_Z, LEDGE_Y, corridorLayout, type CorridorLayout } from './corridor/layout';
import { Shell } from './corridor/Shell';
import { Torches } from './corridor/Torches';

export { LEDGE_Y };

/**
 * The footer's corridor: a barrel-vaulted undercroft running the width of the strip,
 * seen from inside it, with the rats on the walkway along its far wall.
 *
 * Assembled here, laid out in ./corridor/layout.ts, and built from merged geometry in
 * ./corridor/*. The reasoning behind the composition, why the corridor runs across
 * the frame rather than into it, and why the recession is carried by cross passages
 * rather than by the corridor itself, is in that layout file, next to the numbers it
 * decides.
 */
export function Corridor({ quality }: { quality: QualitySettings }) {
  const { viewport, camera } = useThree();
  const cameraZ = camera.position.z;

  const layout = useMemo(
    () => corridorLayout(viewport.width, viewport.height, cameraZ, quality),
    [viewport.width, viewport.height, cameraZ, quality],
  );

  return (
    <group>
      {/* Bounce. Every surface in here is warm stone lit from below by fire, so the
          indirect light is warm and comes from the vault downward, a hemisphere does
          that in one light, where the sitewide rig's cool directional fill turns every
          pier and rib into a blue stripe. */}
      <hemisphereLight args={['#8a5c33', '#0a0c12', 1.15]} />

      <Shell layout={layout} quality={quality} />
      {layout.passages.map((x) => (
        <CrossPassage key={`passage-${x.toFixed(3)}`} x={x} layout={layout} quality={quality} />
      ))}
      <Torches layout={layout} quality={quality} />
      <Atmosphere layout={layout} quality={quality} />
      {quality.shadows && <WalkwayShadow layout={layout} />}
    </group>
  );
}

/**
 * The one shadow-casting light in the scene, so the rats have something under them.
 *
 * A spot rather than a point light, even though the source it stands in for is a
 * torch. A point light's shadow is a cube: six renders of the whole corridor every
 * frame. A spot's is one. It is placed on an actual sconce and aimed down the walkway,
 * so what it casts still falls the way the torchlight does, and its own contribution
 * is kept low, it is here for the shadow, not for the light.
 */
function WalkwayShadow({ layout }: { layout: CorridorLayout }) {
  const { walkY, litTorches } = layout;
  const target = useMemo(() => new THREE.Object3D(), []);
  const light = useRef<THREE.SpotLight>(null);
  const x = litTorches.length ? litTorches[Math.floor(litTorches.length / 2)] : 0;

  return (
    <>
      <primitive object={target} position={[x + 0.6, walkY, -0.5]} />
      <spotLight
        ref={light}
        target={target}
        position={[x, walkY + 1.4, FAR_Z + 0.75]}
        color="#f2a45e"
        intensity={7}
        distance={9}
        decay={2}
        angle={1.05}
        penumbra={0.92}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-bias={-0.0009}
        shadow-normalBias={0.022}
        shadow-camera-near={0.4}
        shadow-camera-far={9}
      />
    </>
  );
}
