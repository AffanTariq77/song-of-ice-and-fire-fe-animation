'use client';

import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { QualityWatchdog, useQuality } from '@/lib/quality';
import { Corridor, LEDGE_Y } from './Corridor';
import { GltfRat } from './GltfRat';
import { CreatureLights } from './CreatureLights';
import { Interactions } from './Interactions';

/**
 * Rats-only scene, meant to be embedded at the footer's own size (a short,
 * wide strip) rather than the full viewport. The camera sits much closer
 * than the sitewide scene's, a fixed vertical FOV maps to the same number
 * of world-units regardless of how short the canvas is in pixels, so a short
 * strip needs a closer camera to keep the rats from rendering too small.
 *
 * The camera is load bearing for the corridor too, and must not move: the vault's
 * radius is chosen so its near haunch clears z = 3.2, and every depth in
 * ./corridor/layout.ts is measured from there.
 */
export default function RatsScene() {
  const [quality, downgrade] = useQuality();

  return (
    <div
      aria-hidden="true"
      style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}
    >
      <Canvas
        camera={{ position: [0, 0, 3.2], fov: 50 }}
        gl={{
          alpha: true,
          antialias: false,
          premultipliedAlpha: false,
          // Khronos PBR Neutral instead of react-three-fiber's default ACES. ACES is a
          // film curve, and what it does to a saturated orange near the top of its
          // range is desaturate it toward white, exactly the colour a torch flame
          // occupies. Neutral compresses highlights without pulling the hue, so the
          // flames stay orange and the stone keeps the blue cast that separates it
          // from them. Passed as a gl prop rather than set in onCreated because
          // react-three-fiber only defaults tone mapping on first configure but
          // re-applies gl props on every one, and the quality tier changes dpr.
          toneMapping: THREE.NeutralToneMapping,
          toneMappingExposure: 1.08,
        }}
        dpr={quality.dpr}
        shadows={quality.shadows ? 'soft' : false}
        onCreated={({ gl }) => {
          const applyTransparentClear = () => gl.setClearAlpha(0);
          applyTransparentClear();
          gl.domElement.addEventListener('webglcontextrestored', applyTransparentClear);
        }}
      >
        <QualityWatchdog onDowngrade={downgrade} />
        <Interactions />

        {/* Depth haze. Fogging to the site's own --midnight-950 rather than to grey
            means the far end of a cross passage resolves to exactly the colour of the
            page behind the iframe, so the corridor appears to open into the site. */}
        <fog attach="fog" args={['#05070d', 5.4, 16]} />

        {/* Much lower than the sitewide rig. That one has to model a black bird against
            a black page on its own; here the torches do the modelling, and every unit
            of ambient light spent is a unit of torchlight that stops reading. */}
        <CreatureLights rim={1.2} ambient={0.34} keyLight={0.26} bounce={0.3} creatureLayer={1} />

        <Corridor quality={quality} />

        {/* Pace is a multiple of the speed the run clip was authored at, so a rat set
            to 1 gallops at exactly the cadence the animator drew and its feet do not
            slide. A third of that lands in the walk clip instead, which is how one of
            these ambles across while the rest scurry.

            `lane` is where each one runs across the walkway, 0 at the front lip and 1
            against the wall. They are deliberately spread and paired off rather than
            evenly spaced: six animals on one line reads as a row of icons, and six on
            six neat lanes reads as a chart. Depth also sets how big each draws and how
            long it takes to cross, so the near ones are the big slow-looking ones. */}
        <GltfRat y={LEDGE_Y} lane={0.08} pace={0.86} minDelay={2} maxDelay={13} direction={1} scale={0.5} />
        <GltfRat y={LEDGE_Y} lane={0.74} pace={0.34} minDelay={6} maxDelay={22} direction={-1} scale={0.44} sniffChance={0.85} />
        <GltfRat y={LEDGE_Y} lane={0.21} pace={0.95} minDelay={1} maxDelay={11} direction={1} scale={0.56} sniffChance={0.25} />
        <GltfRat y={LEDGE_Y} lane={0.63} pace={0.72} minDelay={5} maxDelay={18} direction={-1} scale={0.58} />
        <GltfRat y={LEDGE_Y} lane={0.9} pace={0.4} minDelay={4} maxDelay={16} direction={1} scale={0.4} sniffChance={0.7} />
        <GltfRat y={LEDGE_Y} lane={0.42} pace={0.8} minDelay={8} maxDelay={24} direction={-1} scale={0.47} />
      </Canvas>
    </div>
  );
}
