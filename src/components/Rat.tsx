'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';

export type RatProps = {
  /** Vertical position as a fraction of viewport height, 0 = top, 1 = bottom. */
  y: number;
  /** Seconds to cross from one side of the viewport to the other (excludes any pause). */
  duration: number;
  minDelay: number;
  maxDelay: number;
  direction: 1 | -1;
  scale?: number;
  /** Chance (0-1) this crossing includes a stop-and-look-up pause partway through. */
  pauseChance?: number;
};

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

// Shared across every rat instance.
const MATERIAL = new THREE.MeshStandardMaterial({ color: '#0b0b0d', roughness: 0.9 });
const BODY_GEOMETRY = new THREE.CapsuleGeometry(0.045, 0.14, 4, 8);
const HEAD_GEOMETRY = new THREE.SphereGeometry(0.05, 8, 6);
const EAR_GEOMETRY = new THREE.SphereGeometry(0.018, 6, 5);
const TAIL_GEOMETRY = new THREE.CylinderGeometry(0.006, 0.002, 0.22, 5);

type Phase = 'running' | 'paused';

function RatModel({ y, duration, direction, scale = 1, pauseChance = 0.5, onDone }: RatProps & { onDone: () => void }) {
  const group = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const { viewport } = useThree();

  // Fixed per-crossing plan, chosen once when this instance mounts.
  const [plan] = useState(() => ({
    willPause: Math.random() < pauseChance,
    pauseAt: randomBetween(0.35, 0.65),
    pauseDuration: randomBetween(0.9, 1.8),
  }));

  const elapsed = useRef(0);
  const pauseElapsed = useRef(0);
  const phase = useRef<Phase>('running');
  const runProgress = useRef(0);

  useFrame((_, delta) => {
    if (!group.current) return;

    // Scurrying bob, always animating regardless of phase.
    const scurry = phase.current === 'running' ? Math.abs(Math.sin(elapsed.current * 16)) * 0.02 : 0;
    group.current.position.y = viewport.height / 2 - y * viewport.height + scurry;

    if (phase.current === 'paused') {
      pauseElapsed.current += delta;
      if (head.current) head.current.rotation.x = THREE.MathUtils.lerp(head.current.rotation.x, -0.6, delta * 6);
      if (pauseElapsed.current >= plan.pauseDuration) {
        phase.current = 'running';
      }
      return;
    }

    if (head.current) head.current.rotation.x = THREE.MathUtils.lerp(head.current.rotation.x, 0, delta * 6);

    elapsed.current += delta;
    runProgress.current = Math.min(elapsed.current / duration, 1);
    const span = viewport.width * 1.5;
    const startX = direction === 1 ? -span / 2 : span / 2;
    const endX = -startX;
    group.current.position.x = THREE.MathUtils.lerp(startX, endX, runProgress.current);
    group.current.rotation.y = direction === 1 ? Math.PI / 2 : -Math.PI / 2;

    if (plan.willPause && pauseElapsed.current === 0 && runProgress.current >= plan.pauseAt) {
      phase.current = 'paused';
      pauseElapsed.current = 0.0001;
    }

    if (runProgress.current >= 1) {
      onDone();
    }
  });

  return (
    <group ref={group} scale={scale} rotation={[0, 0, Math.PI / 2]}>
      <mesh geometry={BODY_GEOMETRY} material={MATERIAL} rotation={[0, 0, Math.PI / 2]} />
      <group ref={head} position={[0.1, 0.01, 0]}>
        <mesh geometry={HEAD_GEOMETRY} material={MATERIAL} />
        <mesh geometry={EAR_GEOMETRY} material={MATERIAL} position={[-0.01, 0.045, 0.03]} />
        <mesh geometry={EAR_GEOMETRY} material={MATERIAL} position={[-0.01, 0.045, -0.03]} />
      </group>
      <mesh geometry={TAIL_GEOMETRY} material={MATERIAL} position={[-0.17, 0, 0]} rotation={[0, 0, Math.PI / 2 + 0.15]} />
    </group>
  );
}

/** Self-scheduling procedural rat: waits a random delay, scurries across once (maybe pausing to look up midway), then reschedules. */
export function Rat(props: RatProps) {
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
