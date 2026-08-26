'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { instantiate, type LoadedModel } from '@/lib/gltf-cache';
import { useInteractive } from './Interactions';

const DRAGON_URL = '/models/dragon.glb';
const CLIP = { fly: 'flying', idle: 'idle' } as const;

const EMBER_COUNT = 90;
const CIRCUITS = { min: 2, max: 4 };
const ROOST_SECONDS = { min: 12, max: 30 };

type Phase = 'circling' | 'landing' | 'roosting' | 'launching';

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

/** Reused every frame; allocating a Vector3 per frame would churn the heap. */
const scratch = new THREE.Vector3();

/**
 * A soft round sprite for the embers.
 *
 * Without it PointsMaterial draws flat squares, and a trail of squares reads as a
 * chain of gold dominoes rather than sparks. Built once, shared by every ember.
 */
let emberSprite: THREE.CanvasTexture | null = null;
function getEmberSprite() {
  if (emberSprite) return emberSprite;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,236,200,1)');
  gradient.addColorStop(0.35, 'rgba(255,176,102,0.75)');
  gradient.addColorStop(1, 'rgba(242,130,58,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  emberSprite = new THREE.CanvasTexture(canvas);
  return emberSprite;
}

type EmberState = {
  geometry: THREE.BufferGeometry;
  positions: Float32Array;
  velocities: Float32Array;
  life: Float32Array;
  next: number;
};

/**
 * The dragon: circles the band on a long banking arc, settles onto its roost, sits,
 * and takes off again — or launches immediately if clicked.
 *
 * The "magic" is three things working together rather than one effect: the flight path
 * is a lissajous rather than a line, so it never repeats a stroke exactly; a warm light
 * rides with it, so the stone below actually brightens as it passes; and it trails
 * embers that keep their own velocity after being shed, so they drift and fade behind
 * it instead of moving as a rigid tail.
 */
export function Dragon({
  roost,
  width,
  height,
  span,
  targetWidth,
  centerX,
}: {
  /** World position of the top of the roost, where the feet land. */
  roost: THREE.Vector3;
  width: number;
  height: number;
  span: number;
  targetWidth: number;
  /**
   * Where the circling path is centred, in this group's local space. The group sits on
   * the roost, which is deliberately off to one side, so a path centred on the group
   * would carry the dragon off the edge of the band on every lap.
   */
  centerX: number;
}) {
  const group = useRef<THREE.Group>(null);
  const [model, setModel] = useState<LoadedModel | null>(null);
  const mixer = useRef<THREE.AnimationMixer | null>(null);
  const actions = useRef<Record<string, THREE.AnimationAction | undefined>>({});
  const light = useRef<THREE.PointLight>(null);
  const embers = useRef<THREE.Points>(null);

  const phase = useRef<Phase>('circling');
  // Seeded in an effect rather than at render time: the flight path must start at a
  // different point per mount, but render has to stay pure.
  const t = useRef(0);
  const timer = useRef(0);
  const circuitsLeft = useRef(3);
  const landFrom = useRef(new THREE.Vector3());
  const landProgress = useRef(0);
  const previous = useRef(new THREE.Vector3());

  // Ember buffers are rewritten every frame, so they are built once into a ref rather
  // than memoised: they are mutable state that React should never try to reason about.
  const emberState = useRef<EmberState | null>(null);

  useEffect(() => {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(EMBER_COUNT * 3);
    const velocities = new Float32Array(EMBER_COUNT * 3);
    const life = new Float32Array(EMBER_COUNT);
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('alpha', new THREE.BufferAttribute(life, 1));
    emberState.current = { geometry, positions, velocities, life, next: 0 };
    // Swapped onto the already-mounted points object rather than passed as a prop:
    // this buffer is rewritten every frame, so it is mutable state React should not
    // be asked to reason about.
    const node = embers.current;
    if (node) node.geometry = geometry;
    t.current = Math.random() * 10;
    circuitsLeft.current = randomBetween(CIRCUITS.min, CIRCUITS.max);
    return () => geometry.dispose();
    // Depends on the model: the <points> node is not rendered until the dragon has
    // loaded, so on mount there is nothing to attach the buffer to yet.
  }, [model]);

  useEffect(() => {
    let cancelled = false;
    instantiate(DRAGON_URL).then((m) => {
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
    actions.current = { fly: by(CLIP.fly), idle: by(CLIP.idle) };
    // Slow, deliberate wingbeats. At full rate it flaps like a sparrow.
    m.timeScale = 0.55;
    actions.current.fly?.play();
    mixer.current = m;
    return () => {
      m.stopAllAction();
      mixer.current = null;
    };
  }, [model]);

  function play(name: 'fly' | 'idle', fade = 0.5) {
    const next = actions.current[name];
    if (!next) return;
    for (const [key, action] of Object.entries(actions.current)) {
      if (key !== name && action?.isRunning()) action.fadeOut(fade);
    }
    next.reset().fadeIn(fade).play();
  }

  /** The circling path: a lissajous, so the two axes never come back into step. */
  function pathAt(time: number, out: THREE.Vector3) {
    return out.set(
      centerX + Math.sin(time * 0.34) * span * 0.36,
      roost.y + height * 0.24 + Math.sin(time * 0.53 + 1.1) * height * 0.14,
      Math.sin(time * 0.21) * 2.2 - 1.2,
    );
  }

  useInteractive({
    objectRef: group,
    radius: targetWidth * 0.55,
    onClick: () => {
      if (phase.current === 'roosting') {
        phase.current = 'launching';
        timer.current = 1.1;
        play('fly', 0.18);
        if (mixer.current) mixer.current.timeScale = 1.15;
      } else if (phase.current === 'circling') {
        // Startled mid-flight: a hard climb and an extra lap before settling.
        circuitsLeft.current += 1;
        t.current += 0.9;
      }
    },
  });

  useFrame((_, delta) => {
    mixer.current?.update(delta);
    const g = group.current;
    const s = emberState.current;
    if (!g || !model || !s) return;

    previous.current.copy(g.position);

    switch (phase.current) {
      case 'circling': {
        t.current += delta;
        circuitsLeft.current -= delta * 0.06;
        pathAt(t.current, g.position);
        if (circuitsLeft.current <= 0) {
          phase.current = 'landing';
          landFrom.current.copy(g.position);
          landProgress.current = 0;
        }
        break;
      }
      case 'landing': {
        landProgress.current = Math.min(landProgress.current + delta / 3.4, 1);
        const e = 1 - Math.pow(1 - landProgress.current, 3);
        g.position.lerpVectors(landFrom.current, roost, e);
        // Flare: rise slightly before settling, the way a big bird checks its descent.
        g.position.y += Math.sin(Math.PI * e) * height * 0.1;
        if (landProgress.current >= 1) {
          phase.current = 'roosting';
          timer.current = randomBetween(ROOST_SECONDS.min, ROOST_SECONDS.max);
          play('idle', 0.7);
          if (mixer.current) mixer.current.timeScale = 0.5;
        }
        break;
      }
      case 'roosting': {
        g.position.copy(roost);
        timer.current -= delta;
        if (timer.current <= 0) {
          phase.current = 'launching';
          timer.current = 1.1;
          play('fly', 0.35);
          if (mixer.current) mixer.current.timeScale = 1.15;
        }
        break;
      }
      case 'launching': {
        timer.current -= delta;
        g.position.y += delta * height * 0.5;
        g.position.x += delta * span * 0.12;
        if (timer.current <= 0) {
          phase.current = 'circling';
          circuitsLeft.current = randomBetween(CIRCUITS.min, CIRCUITS.max);
          // Re-enter the path where it currently is, so there is no jump.
          t.current = Math.asin(THREE.MathUtils.clamp((g.position.x - centerX) / (span * 0.36), -1, 1)) / 0.34;
          if (mixer.current) mixer.current.timeScale = 0.55;
        }
        break;
      }
    }

    // Face the direction of travel, and bank into the turn.
    scratch.subVectors(g.position, previous.current);
    const speed = scratch.length();
    if (speed > 1e-5) {
      const heading = Math.atan2(scratch.x, scratch.z);
      g.rotation.y = THREE.MathUtils.lerp(g.rotation.y, heading, Math.min(delta * 3, 1));
      const bank = THREE.MathUtils.clamp(-scratch.x / (speed + 1e-6) * 0.5, -0.5, 0.5);
      g.rotation.z = THREE.MathUtils.lerp(g.rotation.z, phase.current === 'roosting' ? 0 : bank, Math.min(delta * 2.5, 1));
    }

    if (light.current) {
      light.current.position.copy(g.position);
      light.current.intensity = phase.current === 'roosting' ? 2.4 : 4.4;
    }

    // Embers: shed one every few frames from just behind the dragon, then left to
    // drift on their own so the trail lags and spreads instead of following rigidly.
    if (phase.current !== 'roosting' || Math.random() < 0.25) {
      const i = s.next % EMBER_COUNT;
      s.next += 1;
      s.positions[i * 3] = g.position.x - scratch.x * 2;
      s.positions[i * 3 + 1] = g.position.y - scratch.y * 2;
      s.positions[i * 3 + 2] = g.position.z;
      s.positions[i * 3] += (Math.random() - 0.5) * targetWidth * 0.25;
      s.positions[i * 3 + 1] += (Math.random() - 0.5) * targetWidth * 0.18;
      s.velocities[i * 3] = (Math.random() - 0.5) * 1.1;
      s.velocities[i * 3 + 1] = 0.35 + Math.random() * 1.1;
      s.velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.5;
      s.life[i] = 1;
    }
    for (let i = 0; i < EMBER_COUNT; i++) {
      if (s.life[i] <= 0) {
        // Park spent embers far off-screen: PointsMaterial has no per-point opacity,
        // so an expired one left in place would sit there as a permanent dot.
        s.positions[i * 3 + 1] = 1e6;
        continue;
      }
      s.life[i] -= delta * 0.55;
      s.positions[i * 3] += s.velocities[i * 3] * delta;
      s.positions[i * 3 + 1] += s.velocities[i * 3 + 1] * delta;
      s.positions[i * 3 + 2] += s.velocities[i * 3 + 2] * delta;
    }
    s.geometry.attributes.position.needsUpdate = true;
    s.geometry.attributes.alpha.needsUpdate = true;

    void width;
  });

  if (!model) return null;

  return (
    <group>
      <primitive ref={group} object={model.scene} scale={targetWidth / model.width} />
      <pointLight ref={light} color="#f2823a" intensity={4.4} distance={span * 0.55} decay={2} />
      <points ref={embers}>
        <bufferGeometry />
        <pointsMaterial
          size={Math.max(targetWidth * 0.075, 0.08)}
          map={getEmberSprite()}
          color="#ffc98a"
          transparent
          opacity={0.9}
          sizeAttenuation
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
    </group>
  );
}
