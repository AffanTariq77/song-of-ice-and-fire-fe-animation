'use client';

import { Canvas } from '@react-three/fiber';
import { GltfRat } from './GltfRat';

/**
 * Rats-only scene, meant to be embedded at the footer's own size (a short,
 * wide strip) rather than the full viewport. The camera sits much closer
 * than the sitewide scene's — a fixed vertical FOV maps to the same number
 * of world-units regardless of how short the canvas is in pixels, so a short
 * strip needs a closer camera to keep the rats from rendering too small.
 */
export default function RatsScene() {
  return (
    <div
      aria-hidden="true"
      style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}
    >
      <Canvas
        camera={{ position: [0, 0, 3.2], fov: 50 }}
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

        <GltfRat y={0.85} duration={9} minDelay={1} maxDelay={6} direction={1} scale={0.4} />
        <GltfRat y={0.85} duration={8} minDelay={2} maxDelay={8} direction={-1} scale={0.35} />
        <GltfRat y={0.85} duration={11} minDelay={0.5} maxDelay={5} direction={1} scale={0.45} />
        <GltfRat y={0.85} duration={7} minDelay={3} maxDelay={9} direction={-1} scale={0.5} />
        <GltfRat y={0.85} duration={10} minDelay={1.5} maxDelay={7} direction={1} scale={0.35} />
        <GltfRat y={0.85} duration={9} minDelay={4} maxDelay={10} direction={-1} scale={0.4} />
      </Canvas>
    </div>
  );
}
