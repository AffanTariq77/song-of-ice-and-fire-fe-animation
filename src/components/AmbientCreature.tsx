'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { useInteractive } from './Interactions';

export type AmbientCreatureProps = {
  url: string;
  clipName: string;
  /**
   * Desired on-screen width in world units (viewport.width is ~15-17 at the
   * default camera). Computed against the model's *actual* rendered bounding
   * box at load time, not its raw mesh data — several of these models bake a
   * scale/rotation into a root node matrix that raw accessor min/max ignores,
   * which is why the old flat `scale` multiplier produced wildly wrong sizes.
   */
  targetWidth: number;
  /** Vertical position as a fraction of viewport height, 0 = top, 1 = bottom. */
  y: number;
  /** Seconds to cross from one side of the viewport to the other. */
  duration: number;
  /** Random delay range (seconds) between one crossing ending and the next starting. */
  minDelay: number;
  maxDelay: number;
  direction: 1 | -1;
  /** Extra turn so the model's forward axis matches its direction of travel; tune per-model. */
  facingOffset?: number;
  /**
   * Vertical wander over a crossing, in world units. A dead-straight lerp reads as a
   * sprite being slid across the screen rather than something flying, so each bird
   * rides a sine over its path. 0 keeps the old straight-line behaviour (the dragon
   * uses this — it is large and slow enough that drift just looks like drift).
   */
  driftAmplitude?: number;
  /** Number of full rise-and-fall cycles across one crossing. Fractional values are fine. */
  driftWaves?: number;
  /**
   * How hard the bird rolls into its own climb and dive. rotation.z is the innermost
   * rotation under three.js's default XYZ Euler order, so it is applied in model space
   * *before* the yaw below — i.e. it is a roll about the axis of travel, which is what
   * banking actually is, rather than a screen-space tilt.
   */
  bank?: number;
  /**
   * Pointer hit radius in world units. Defaults to a shade wider than the bird itself
   * (see HIT_RADIUS_FACTOR).
   */
  hitRadius?: number;
};

/**
 * Hit radius as a multiple of the bird's own on-screen width. A crow at these sizes is
 * only ~50px across and always moving, so an exact-size target is unsatisfying to
 * click; much beyond this and birds start scattering from clicks aimed at links near
 * them, which reads as a bug rather than a flourish.
 */
const HIT_RADIUS_FACTOR = 1.25;

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

/**
 * Loads a GLTF model via a fully dynamic import of three.js's own loader (not drei's
 * useGLTF, which drags in Draco/Meshopt decoder wiring that isn't needed for these
 * plain embedded-texture models and was blowing up Turbopack's build memory sitewide).
 */
function useLoadedGltf(url: string) {
  const [result, setResult] = useState<{ scene: THREE.Group; animations: THREE.AnimationClip[]; scaleFactor: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    import('three/examples/jsm/loaders/GLTFLoader.js').then(({ GLTFLoader }) => {
      if (cancelled) return;
      new GLTFLoader().load(url, (gltf) => {
        if (cancelled) return;
        // Actual post-transform size — accounts for any scale/rotation baked
        // into the model's own node hierarchy, unlike raw accessor min/max.
        const box = new THREE.Box3().setFromObject(gltf.scene);
        const size = box.getSize(new THREE.Vector3());
        const width = Math.max(size.x, size.z) || 1;
        setResult({ scene: gltf.scene, animations: gltf.animations, scaleFactor: width });
      });
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return result;
}

function CreatureModel({
  url,
  clipName,
  targetWidth,
  y,
  duration,
  direction,
  facingOffset = 0,
  driftAmplitude = 0,
  driftWaves = 1,
  bank = 0.55,
  hitRadius,
  onDone,
}: AmbientCreatureProps & { onDone: () => void }) {
  const group = useRef<THREE.Group>(null);
  const gltf = useLoadedGltf(url);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const { viewport } = useThree();
  const elapsed = useRef(0);
  const doneRef = useRef(false);

  // Per-crossing phase, so several birds sharing a drift shape never rise and fall
  // in unison. Picked once per mount; each crossing is a fresh mount.
  const [phase] = useState(() => Math.random());

  /**
   * Set on click. Once startled the bird abandons its scheduled path entirely and is
   * integrated by velocity instead: it accelerates along its heading, climbs hard, and
   * rolls level again as it goes, until it clears the viewport and reschedules as a
   * normal crossing.
   */
  const startle = useRef<{ speed: number; climb: number; roll: number } | null>(null);

  useInteractive({
    objectRef: group,
    radius: hitRadius ?? targetWidth * HIT_RADIUS_FACTOR,
    onClick: () => {
      if (startle.current || doneRef.current) return;
      startle.current = { speed: (viewport.width * 1.6) / duration, climb: 2.5, roll: 0.6 };
      // Panicked wingbeats, not cruising ones.
      if (mixerRef.current) mixerRef.current.timeScale = 2.2;
    },
  });

  useEffect(() => {
    if (!gltf) return;
    const mixer = new THREE.AnimationMixer(gltf.scene);
    const clip = gltf.animations.find((c) => c.name === clipName) ?? gltf.animations[0];
    clip?.optimize();
    if (clip) mixer.clipAction(clip).play();
    mixerRef.current = mixer;
    return () => {
      mixer.stopAllAction();
      mixerRef.current = null;
    };
  }, [gltf, clipName]);

  useFrame((_, delta) => {
    mixerRef.current?.update(delta);
    if (doneRef.current || !group.current) return;

    const yaw = (direction === 1 ? Math.PI / 2 : -Math.PI / 2) + facingOffset;

    if (startle.current) {
      const s = startle.current;
      s.speed = Math.min(s.speed + delta * 24, 32);
      s.climb = Math.min(s.climb + delta * 14, 17);
      s.roll = THREE.MathUtils.lerp(s.roll, 0, Math.min(delta * 2.2, 1));
      group.current.position.x += direction * s.speed * delta;
      group.current.position.y += s.climb * delta;
      group.current.rotation.set(0, yaw, -s.roll * direction);
      const limitX = viewport.width * 0.9 + 3;
      const limitY = viewport.height / 2 + 3;
      if (Math.abs(group.current.position.x) > limitX || group.current.position.y > limitY) {
        doneRef.current = true;
        onDone();
      }
      return;
    }

    elapsed.current += delta;
    const t = Math.min(elapsed.current / duration, 1);

    const span = viewport.width * 1.6;
    const startX = direction === 1 ? -span / 2 : span / 2;
    const endX = -startX;
    group.current.position.x = THREE.MathUtils.lerp(startX, endX, t);

    const baseY = viewport.height / 2 - y * viewport.height;
    if (driftAmplitude === 0) {
      group.current.position.y = baseY;
      group.current.rotation.set(0, yaw, 0);
      if (t >= 1) {
        doneRef.current = true;
        onDone();
      }
      return;
    }

    const angle = (t * driftWaves + phase) * Math.PI * 2;
    // Fade the drift in and out at the edges so a bird never enters or leaves
    // mid-climb, which reads as it being cut off rather than flying past.
    const envelope = Math.sin(Math.PI * t);
    group.current.position.y = baseY + driftAmplitude * Math.sin(angle) * envelope;

    // Roll into the climb. d(sin)/dt is cos, scaled by the same envelope; the
    // constant folds into `bank` so this stays one multiply.
    const slope = Math.cos(angle) * driftWaves * envelope;
    group.current.rotation.set(0, yaw, THREE.MathUtils.clamp(-slope * bank * direction, -0.45, 0.45));

    if (t >= 1) {
      doneRef.current = true;
      onDone();
    }
  });

  if (!gltf) return null;
  const scale = targetWidth / gltf.scaleFactor;
  return <primitive ref={group} object={gltf.scene} scale={scale} />;
}

/** Self-scheduling ambient creature: waits a random delay, crosses the screen once, then reschedules. */
export function AmbientCreature(props: AmbientCreatureProps) {
  const [active, setActive] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    timeoutRef.current = setTimeout(() => setActive(true), randomBetween(props.minDelay, props.maxDelay) * 1000);
    return () => clearTimeout(timeoutRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleDone() {
    setActive(false);
    timeoutRef.current = setTimeout(() => setActive(true), randomBetween(props.minDelay, props.maxDelay) * 1000);
  }

  if (!active) return null;
  return <CreatureModel {...props} onDone={handleDone} />;
}
