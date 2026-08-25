'use client';

import { Canvas } from '@react-three/fiber';
import { AmbientCreature } from './AmbientCreature';
import { Rat } from './Rat';

/**
 * The entire content of this standalone app: a transparent, full-viewport 3D
 * scene meant to be embedded via <iframe> into the main site, positioned as an
 * ambient overlay above page backgrounds and below content there. Isolated
 * into its own repo/deployment so its build graph (three.js + GLTFLoader) never
 * shares a build container with the main app's much larger one.
 *
 * Rats are procedural (no GLTF) — small, several at once, scurrying both
 * directions along the bottom edge, some pausing mid-crossing to look up
 * before continuing. Crow/dragon still use the GLTF models pending a
 * follow-up pass.
 */
export default function AmbientCreaturesScene() {
  return (
    <div
      aria-hidden="true"
      style={{ position: 'fixed', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}
    >
      <Canvas
        camera={{ position: [0, 0, 10], fov: 50 }}
        gl={{ alpha: true, antialias: false, premultipliedAlpha: false }}
        dpr={[1, 1.5]}
        onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
      >
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

        <Rat y={0.95} duration={10} minDelay={2} maxDelay={9} direction={1} scale={1.1} />
        <Rat y={0.9} duration={9} minDelay={3} maxDelay={11} direction={-1} scale={0.9} />
        <Rat y={0.97} duration={12} minDelay={4} maxDelay={13} direction={1} scale={1} />
        <Rat y={0.88} duration={8} minDelay={5} maxDelay={15} direction={-1} scale={1.2} />
        <Rat y={0.93} duration={11} minDelay={1} maxDelay={8} direction={1} scale={0.85} />
        <Rat y={0.91} duration={10} minDelay={6} maxDelay={17} direction={-1} scale={1} />
      </Canvas>
    </div>
  );
}
