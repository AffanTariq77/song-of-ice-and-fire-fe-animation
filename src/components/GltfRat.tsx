'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';

export type GltfRatProps = {
  /** Vertical position as a fraction of viewport height, 0 = top, 1 = bottom — this is where its feet land. */
  y: number;
  /** Seconds to cross from one side of the viewport to the other (excludes any pause). */
  duration: number;
  minDelay: number;
  maxDelay: number;
  direction: 1 | -1;
  scale?: number;
  /** Chance (0-1) this crossing includes a stop-and-look pause partway through. */
  pauseChance?: number;
};

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

const RUN_CLIP = 'Mammals|run_A1';
const IDLE_CLIP = 'Mammals|idle_A1';

function useLoadedGltf(url: string) {
  const [result, setResult] = useState<{ scene: THREE.Group; animations: THREE.AnimationClip[]; groundOffset: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    import('three/examples/jsm/loaders/GLTFLoader.js').then(({ GLTFLoader }) => {
      if (cancelled) return;
      new GLTFLoader().load(url, (gltf) => {
        if (cancelled) return;
        // Ground the model on its actual feet regardless of where its authored pivot sits.
        const box = new THREE.Box3().setFromObject(gltf.scene);
        setResult({ scene: gltf.scene, animations: gltf.animations, groundOffset: -box.min.y });
      });
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return result;
}

type Phase = 'running' | 'paused';

function RatModel({ y, duration, direction, scale = 1, pauseChance = 0.5, onDone }: GltfRatProps & { onDone: () => void }) {
  const group = useRef<THREE.Group>(null);
  const gltf = useLoadedGltf('/models/rat.glb');
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const actionsRef = useRef<{ run?: THREE.AnimationAction; idle?: THREE.AnimationAction }>({});
  const { viewport } = useThree();

  const [plan] = useState(() => ({
    willPause: Math.random() < pauseChance,
    pauseAt: randomBetween(0.35, 0.65),
    pauseDuration: randomBetween(1, 2),
  }));

  const elapsed = useRef(0);
  const pauseElapsed = useRef(0);
  const phase = useRef<Phase>('running');

  useEffect(() => {
    if (!gltf) return;
    const mixer = new THREE.AnimationMixer(gltf.scene);
    const run = gltf.animations.find((c) => c.name === RUN_CLIP);
    const idle = gltf.animations.find((c) => c.name === IDLE_CLIP);
    const runAction = run ? mixer.clipAction(run) : undefined;
    const idleAction = idle ? mixer.clipAction(idle) : undefined;
    runAction?.play();
    actionsRef.current = { run: runAction, idle: idleAction };
    mixerRef.current = mixer;
    return () => {
      mixer.stopAllAction();
      mixerRef.current = null;
    };
  }, [gltf]);

  useFrame((_, delta) => {
    if (!gltf || !group.current) return;
    mixerRef.current?.update(delta);

    const groundY = viewport.height / 2 - y * viewport.height;

    if (phase.current === 'paused') {
      pauseElapsed.current += delta;
      group.current.position.y = groundY + gltf.groundOffset * scale;
      if (pauseElapsed.current >= plan.pauseDuration) {
        phase.current = 'running';
        actionsRef.current.idle?.fadeOut(0.3);
        actionsRef.current.run?.reset().fadeIn(0.3).play();
      }
      return;
    }

    elapsed.current += delta;
    const t = Math.min(elapsed.current / duration, 1);
    const span = viewport.width * 1.5;
    const startX = direction === 1 ? -span / 2 : span / 2;
    const endX = -startX;
    group.current.position.x = THREE.MathUtils.lerp(startX, endX, t);
    group.current.position.y = groundY + gltf.groundOffset * scale;
    group.current.rotation.y = direction === 1 ? Math.PI / 2 : -Math.PI / 2;

    if (plan.willPause && pauseElapsed.current === 0 && t >= plan.pauseAt) {
      phase.current = 'paused';
      pauseElapsed.current = 0.0001;
      actionsRef.current.run?.fadeOut(0.3);
      actionsRef.current.idle?.reset().fadeIn(0.3).play();
    }

    if (t >= 1) onDone();
  });

  if (!gltf) return null;
  return <primitive ref={group} object={gltf.scene} scale={scale} rotation={[0, Math.PI / 2, 0]} />;
}

/** Self-scheduling GLTF rat: waits a random delay, scurries across once (maybe pausing to look up midway), then reschedules. */
export function GltfRat(props: GltfRatProps) {
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
  return <RatModel {...props} onDone={handleDone} />;
}
