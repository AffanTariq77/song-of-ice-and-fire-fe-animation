'use client';

import { Canvas } from '@react-three/fiber';
import { AmbientCreature } from './AmbientCreature';
import { CreatureLights } from './CreatureLights';
import { Interactions } from './Interactions';

/**
 * The entire content of this standalone app's main route: the sitewide,
 * full-viewport ambient layer — crow and dragon crossing the sky. Rats moved
 * to the /rats route, embedded only over the footer on the host site instead
 * of sitewide (see src/app/rats/page.tsx and RatsScene.tsx).
 *
 * Isolated into its own repo/deployment so its build graph (three.js +
 * GLTFLoader) never shares a build container with the main app's much
 * larger one.
 *
 * Sizes are given as targetWidth (world units) rather than a raw scale
 * multiplier — several of these GLB files bake a scale/rotation into a root
 * node matrix that a naive raw-mesh-size estimate misses entirely, which is
 * why the crow rendered far too small and the dragon was never seen at all
 * despite "reasonable-looking" scale values. AmbientCreature now computes
 * the model's actual rendered bounding box after load and derives the scale
 * needed to hit targetWidth, so this isn't guesswork anymore.
 *
 * The white-glow bug tracked in docs/white-glow-handover.md turned out to be
 * a WebGL context loss: the live console showed "THREE.WebGLRenderer: Context
 * Lost." — three.js's default context-lost handling calls preventDefault() so
 * the browser auto-restores it, but restoration doesn't re-run onCreated, so
 * the explicit clear-alpha below was only ever applied once and silently
 * lost on restore. Re-applying it on 'webglcontextrestored' fixes that.
 */
/**
 * The flock. Five birds rather than one, at roughly half the previous size, crossing
 * in both directions across the upper band of the viewport.
 *
 * Every field varies per bird on purpose. Five identical crows on staggered timers
 * still read as five copies of one animation, because the eye picks up the shared
 * altitude, speed and wing rhythm immediately. Different `duration` breaks the rhythm,
 * different `y` breaks the rank, and different `driftWaves`/`driftAmplitude` mean no
 * two share a path shape even when they happen to cross together.
 *
 * `targetWidth` averages 0.65 (down from a single crow at 1.3) with a spread, so the
 * flock also reads as having depth rather than sitting on one plane.
 */
const CROWS = [
  { targetWidth: 0.72, y: 0.1, duration: 19, minDelay: 2, maxDelay: 10, direction: 1 as const, driftAmplitude: 0.5, driftWaves: 1.5 },
  { targetWidth: 0.6, y: 0.19, duration: 25, minDelay: 5, maxDelay: 16, direction: -1 as const, driftAmplitude: 0.75, driftWaves: 1 },
  { targetWidth: 0.68, y: 0.15, duration: 16, minDelay: 3, maxDelay: 12, direction: 1 as const, driftAmplitude: 0.35, driftWaves: 2.5 },
  { targetWidth: 0.56, y: 0.26, duration: 29, minDelay: 8, maxDelay: 22, direction: -1 as const, driftAmplitude: 0.9, driftWaves: 1.5 },
  { targetWidth: 0.66, y: 0.08, duration: 22, minDelay: 3, maxDelay: 14, direction: 1 as const, driftAmplitude: 0.45, driftWaves: 2 },
];

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
        <Interactions />

        <CreatureLights />

        {CROWS.map((crow, i) => (
          <AmbientCreature
            key={i}
            url="/models/crow.glb"
            clipName="SKM_Crow|SKM_Crow|Crow_Fly"
            {...crow}
          />
        ))}

        <AmbientCreature
          url="/models/dragon.glb"
          clipName="flying"
          targetWidth={4.5}
          y={0.12}
          duration={46}
          minDelay={55}
          maxDelay={100}
          direction={-1}
        />
      </Canvas>
    </div>
  );
}
