'use client';

import { Canvas } from '@react-three/fiber';
import { AmbientCreature } from './AmbientCreature';

/**
 * The entire content of this standalone app: a transparent, full-viewport 3D
 * scene meant to be embedded via <iframe> into the main site, positioned as an
 * ambient overlay above page backgrounds and below content there. Isolated
 * into its own repo/deployment so its build graph (three.js + GLTFLoader) never
 * shares a build container with the main app's much larger one.
 */
export default function AmbientCreaturesScene() {
  return (
    <div
      aria-hidden="true"
      style={{ position: 'fixed', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}
    >
      <Canvas camera={{ position: [0, 0, 10], fov: 50 }} gl={{ alpha: true, antialias: true }} dpr={[1, 1.5]}>
        <ambientLight intensity={1.3} />
        <directionalLight position={[3, 5, 4]} intensity={1.6} color="#f2c14d" />

        <AmbientCreature
          url="/models/crow.glb"
          clipName="SKM_Crow|SKM_Crow|Crow_Fly"
          scale={0.012}
          y={0.16}
          duration={22}
          minDelay={18}
          maxDelay={40}
          direction={1}
        />
        <AmbientCreature
          url="/models/dragon.glb"
          clipName="flying"
          scale={0.05}
          y={0.12}
          duration={46}
          minDelay={55}
          maxDelay={100}
          direction={-1}
        />
        <AmbientCreature
          url="/models/rat.glb"
          clipName="run_A1"
          scale={1.4}
          y={0.93}
          duration={12}
          minDelay={30}
          maxDelay={65}
          direction={1}
        />
      </Canvas>
    </div>
  );
}
