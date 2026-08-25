'use client';

import { Canvas } from '@react-three/fiber';

/**
 * TEMP DIAGNOSTIC: stripped to a bare empty Canvas (no lights, no creatures)
 * to isolate whether the white-glow bug is scene-content-dependent or a pure
 * compositing artifact of any R3F Canvas mounted in this iframe.
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
      />
    </div>
  );
}
