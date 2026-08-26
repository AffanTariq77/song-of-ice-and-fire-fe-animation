'use client';

import { useSyncExternalStore } from 'react';
import { Canvas } from '@react-three/fiber';
import { getAnchors, subscribeAnchors } from '@/lib/pointer-bridge';
import { CreatureLights } from './CreatureLights';
import { Interactions } from './Interactions';
import { Perch } from './Perch';

const NONE: never[] = [];

/**
 * The perch layer: branches and the crows that sit on them.
 *
 * Embedded by the host absolutely inside whichever section it decorates, not fixed to
 * the viewport, so it scrolls natively with the page and the branches stay welded to
 * the layout. The host reports where the landing spots are; everything else is here.
 */
export default function PerchScene() {
  const anchors = useSyncExternalStore(subscribeAnchors, getAnchors, () => NONE);

  return (
    <div aria-hidden="true" style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
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
        <Interactions />

        <CreatureLights />

        {anchors.map((anchor) => (
          <Perch key={anchor.id} anchor={anchor} />
        ))}
      </Canvas>
    </div>
  );
}
