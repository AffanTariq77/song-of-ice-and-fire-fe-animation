'use client';

import { Canvas } from '@react-three/fiber';
import { AmbientCreature } from './AmbientCreature';
import { GltfRat } from './GltfRat';

/**
 * The entire content of this standalone app: a transparent, full-viewport 3D
 * scene meant to be embedded via <iframe> into the main site, positioned as an
 * ambient overlay above page backgrounds and below content there. Isolated
 * into its own repo/deployment so its build graph (three.js + GLTFLoader) never
 * shares a build container with the main app's much larger one.
 *
 * Rats use the real GLTF model (small, grounded on their actual feet via a
 * computed bounding-box offset), several at once, scurrying both directions
 * along the bottom edge, some pausing mid-crossing on their idle clip before
 * continuing. Crow/dragon still use their GLTF models pending a follow-up pass.
 *
 * The white-glow bug tracked in docs/white-glow-handover.md turned out to be
 * a WebGL context loss: the live console showed "THREE.WebGLRenderer: Context
 * Lost." — three.js's default context-lost handling calls preventDefault() so
 * the browser auto-restores it, but restoration doesn't re-run onCreated, so
 * the explicit setClearColor below was only ever applied once and silently
 * lost on restore. Re-applying it on 'webglcontextrestored' fixes that.
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
        onCreated={({ gl }) => {
          const applyTransparentClear = () => gl.setClearAlpha(0);
          applyTransparentClear();
          gl.domElement.addEventListener('webglcontextrestored', applyTransparentClear);
        }}
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

        <GltfRat y={0.97} duration={10} minDelay={2} maxDelay={9} direction={1} scale={0.45} />
        <GltfRat y={0.97} duration={9} minDelay={3} maxDelay={11} direction={-1} scale={0.4} />
        <GltfRat y={0.97} duration={12} minDelay={4} maxDelay={13} direction={1} scale={0.5} />
        <GltfRat y={0.97} duration={8} minDelay={5} maxDelay={15} direction={-1} scale={0.55} />
        <GltfRat y={0.97} duration={11} minDelay={1} maxDelay={8} direction={1} scale={0.4} />
        <GltfRat y={0.97} duration={10} minDelay={6} maxDelay={17} direction={-1} scale={0.45} />
      </Canvas>
    </div>
  );
}
