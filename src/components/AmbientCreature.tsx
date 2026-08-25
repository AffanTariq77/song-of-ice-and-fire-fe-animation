'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';

export type AmbientCreatureProps = {
  url: string;
  clipName: string;
  /** Multiplies the model's native size to a sane on-screen scale. */
  scale: number;
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
};

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

/**
 * Loads a GLTF model via a fully dynamic import of three.js's own loader (not drei's
 * useGLTF, which drags in Draco/Meshopt decoder wiring that isn't needed for these
 * plain embedded-texture models and was blowing up Turbopack's build memory sitewide).
 */
function useLoadedGltf(url: string) {
  const [result, setResult] = useState<{ scene: THREE.Group; animations: THREE.AnimationClip[] } | null>(null);

  useEffect(() => {
    let cancelled = false;
    import('three/examples/jsm/loaders/GLTFLoader.js').then(({ GLTFLoader }) => {
      if (cancelled) return;
      new GLTFLoader().load(url, (gltf) => {
        if (!cancelled) setResult({ scene: gltf.scene, animations: gltf.animations });
      });
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return result;
}

function CreatureModel({ url, clipName, scale, y, duration, direction, facingOffset = 0, onDone }: AmbientCreatureProps & { onDone: () => void }) {
  const group = useRef<THREE.Group>(null);
  const gltf = useLoadedGltf(url);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const { viewport } = useThree();
  const elapsed = useRef(0);
  const doneRef = useRef(false);

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
    elapsed.current += delta;
    const t = Math.min(elapsed.current / duration, 1);
    const span = viewport.width * 1.6;
    const startX = direction === 1 ? -span / 2 : span / 2;
    const endX = -startX;
    group.current.position.x = THREE.MathUtils.lerp(startX, endX, t);
    group.current.position.y = viewport.height / 2 - y * viewport.height;
    group.current.rotation.y = (direction === 1 ? Math.PI / 2 : -Math.PI / 2) + facingOffset;
    if (t >= 1) {
      doneRef.current = true;
      onDone();
    }
  });

  if (!gltf) return null;
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
