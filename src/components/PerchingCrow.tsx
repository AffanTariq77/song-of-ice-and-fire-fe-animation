'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { instantiate, type LoadedModel } from '@/lib/gltf-cache';
import { useInteractive } from './Interactions';

const CROW_URL = '/models/crow.glb';
const CLIP = {
  fly: 'SKM_Crow|SKM_Crow|Crow_Fly',
  flyUp: 'SKM_Crow|SKM_Crow|Crow_FlyUp',
  look: 'SKM_Crow|SKM_Crow|Crow_Look',
  look2: 'SKM_Crow|SKM_Crow|Crow_Look2',
} as const;

const APPROACH_SECONDS = 2.4;
const SIT_SECONDS = { min: 9, max: 26 };
const RETURN_SECONDS = { min: 6, max: 20 };

type Phase = 'away' | 'incoming' | 'perched' | 'leaving';

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

/**
 * A crow that flies in, lands on a perch point, sits looking around, and eventually
 * leaves — or leaves immediately if clicked.
 *
 * The model ships with the clips this needs (Crow_Fly, Crow_FlyUp, Crow_Look,
 * Crow_Look2), so a landing reads as a landing rather than a bird frozen mid-flap.
 */
export function PerchingCrow({
  id,
  point,
  side,
  viewport,
  targetWidth,
}: {
  id: string;
  point: THREE.Vector3;
  side: 'left' | 'right';
  viewport: { width: number; height: number };
  /** World width, sized by the caller against whatever the bird is standing on. */
  targetWidth: number;
}) {
  const group = useRef<THREE.Group>(null);
  const [model, setModel] = useState<LoadedModel | null>(null);
  const mixer = useRef<THREE.AnimationMixer | null>(null);
  const actions = useRef<Record<string, THREE.AnimationAction | undefined>>({});

  const phase = useRef<Phase>('away');
  const timer = useRef(randomBetween(1.5, 7));
  const progress = useRef(0);
  const from = useRef(new THREE.Vector3());
  const velocity = useRef(new THREE.Vector3());

  useEffect(() => {
    let cancelled = false;
    instantiate(CROW_URL).then((m) => {
      if (!cancelled) setModel(m);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!model) return;
    const m = new THREE.AnimationMixer(model.scene);
    const by = (name: string) => {
      const clip = model.animations.find((c) => c.name === name);
      if (!clip) return undefined;
      clip.optimize();
      return m.clipAction(clip);
    };
    actions.current = { fly: by(CLIP.fly), flyUp: by(CLIP.flyUp), look: by(CLIP.look), look2: by(CLIP.look2) };
    mixer.current = m;
    return () => {
      m.stopAllAction();
      mixer.current = null;
    };
  }, [model]);

  function play(name: keyof typeof actions.current, fade = 0.35) {
    const next = actions.current[name];
    if (!next) return;
    for (const [key, action] of Object.entries(actions.current)) {
      if (key !== name && action?.isRunning()) action.fadeOut(fade);
    }
    next.reset().fadeIn(fade).play();
  }

  // Facing: perched birds look inward, toward the page's content.
  const yaw = side === 'left' ? Math.PI / 2 : -Math.PI / 2;
  useInteractive({
    objectRef: group,
    radius: targetWidth * 1.4,
    onClick: () => {
      if (phase.current !== 'perched' && phase.current !== 'incoming') return;
      phase.current = 'leaving';
      velocity.current.set(side === 'left' ? -3 : 3, 5.5, 0);
      play('flyUp', 0.12);
      if (mixer.current) mixer.current.timeScale = 1.6;
    },
  });

  useFrame((_, delta) => {
    mixer.current?.update(delta);
    const g = group.current;
    if (!g || !model) return;

    switch (phase.current) {
      case 'away': {
        g.visible = false;
        timer.current -= delta;
        if (timer.current <= 0) {
          // Enter from beyond the outer edge, a little above the perch.
          const offX = (viewport.width / 2 + 2) * (side === 'left' ? -1 : 1);
          from.current.set(point.x + offX, point.y + viewport.height * 0.28, 0);
          g.position.copy(from.current);
          g.visible = true;
          progress.current = 0;
          phase.current = 'incoming';
          if (mixer.current) mixer.current.timeScale = 1;
          play('fly', 0.01);
        }
        return;
      }

      case 'incoming': {
        progress.current = Math.min(progress.current + delta / APPROACH_SECONDS, 1);
        const t = progress.current;
        // Ease out, so the approach decelerates into the landing instead of arriving
        // at cruising speed and stopping dead.
        const e = 1 - Math.pow(1 - t, 3);
        g.position.lerpVectors(from.current, point, e);
        // Drop in along a shallow arc rather than a straight line.
        g.position.y += Math.sin(Math.PI * e) * viewport.height * 0.06;
        const climbing = e < 0.5 ? 0 : -(1 - e) * 0.5;
        g.rotation.set(0, yaw, climbing * (side === 'left' ? 1 : -1));
        if (t >= 1) {
          phase.current = 'perched';
          timer.current = randomBetween(SIT_SECONDS.min, SIT_SECONDS.max);
          g.rotation.set(0, yaw, 0);
          play('look', 0.45);
        }
        return;
      }

      case 'perched': {
        g.position.copy(point);
        timer.current -= delta;
        // Alternate the two idle looks so a long sit does not loop visibly.
        if (timer.current > 1 && Math.random() < delta * 0.12) play(Math.random() < 0.5 ? 'look' : 'look2', 0.6);
        if (timer.current <= 0) {
          phase.current = 'leaving';
          velocity.current.set(side === 'left' ? -2.5 : 2.5, 4.2, 0);
          play('flyUp', 0.2);
        }
        return;
      }

      case 'leaving': {
        velocity.current.y = Math.min(velocity.current.y + delta * 6, 16);
        velocity.current.x *= 1 + delta * 2.2;
        g.position.addScaledVector(velocity.current, delta);
        g.rotation.set(0, yaw, 0);
        if (g.position.y > point.y + viewport.height || Math.abs(g.position.x) > viewport.width) {
          phase.current = 'away';
          timer.current = randomBetween(RETURN_SECONDS.min, RETURN_SECONDS.max);
          if (mixer.current) mixer.current.timeScale = 1;
        }
        return;
      }
    }
  });

  if (!model) return null;
  return <primitive ref={group} object={model.scene} scale={targetWidth / model.width} visible={false} name={id} />;
}
