'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { useInteractive } from './Interactions';
import { RatController, fleeDirection } from './rat/RatController';
import { instantiate, type LoadedModel } from '@/lib/gltf-cache';

export type GltfRatProps = {
  /** Vertical position as a fraction of viewport height, 0 = top, 1 = bottom, this is where its feet land. */
  y: number;
  /**
   * Cruising speed as a multiple of the speed the run clip was authored at. 1 is the
   * gallop as animated; a third of that lands in the walk.
   */
  pace?: number;
  /** Bolting speed, same units. */
  bolt?: number;
  minDelay: number;
  maxDelay: number;
  direction: 1 | -1;
  scale?: number;
  /** Chance (0-1) this crossing includes a stop to sniff at something. */
  sniffChance?: number;
  /** Pointer hit radius in world units. Defaults to the rat's own on-screen width. */
  hitRadius?: number;
};

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function useLoadedGltf(url: string) {
  const [result, setResult] = useState<LoadedModel | null>(null);

  useEffect(() => {
    let cancelled = false;
    instantiate(url).then((model) => {
      if (!cancelled) setResult(model);
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return result;
}

function RatModel({
  y,
  pace = 0.82,
  bolt = 1.5,
  direction,
  scale = 1,
  sniffChance = 0.5,
  hitRadius,
  onDone,
}: GltfRatProps & { onDone: (bolted: boolean) => void }) {
  const group = useRef<THREE.Group>(null);
  const gltf = useLoadedGltf('/models/rat.glb');
  const controller = useRef<RatController | null>(null);
  const { viewport } = useThree();

  useInteractive({
    objectRef: group,
    radius: hitRadius ?? Math.max((gltf?.width ?? 1) * scale, 0.3),
    onHover: () => {
      const rat = controller.current;
      if (!rat || rat.fleeing) return;
      rat.startle(fleeDirection(rat.x, viewport.width / 2, rat.direction));
    },
  });

  useEffect(() => {
    if (!gltf) return;
    // The corridor casts one shadow, from a sconce onto the walkway. A rat that does
    // not opt in walks over its own shadowless patch of stone, which reads worse than
    // no shadow at all.
    gltf.scene.traverse((object) => {
      if (!(object as THREE.Mesh).isMesh) return;
      object.castShadow = true;
      // Opt in to the creature layer, so a scene that has confined its cool rim light
      // to the animals still reaches this one. Harmless where no light does that: an
      // object on layers 0 and 1 still tests true against a layer 0 light.
      object.layers.enable(1);
    });

    const rat = new RatController(gltf.scene, gltf.animations, direction, {
      scale,
      pace,
      bolt,
      sniffChance,
      random: Math.random,
    });
    controller.current = rat;
    return () => {
      rat.dispose();
      controller.current = null;
    };
  }, [gltf, direction, scale, pace, bolt, sniffChance]);

  // Placed on its first frame rather than in the effect above, because the span it
  // enters from is a function of the viewport, which the effect does not re-run for.
  const placed = useRef(false);

  useFrame((_, delta) => {
    const rat = controller.current;
    if (!gltf || !group.current || !rat) return;

    // Far enough off screen that neither entry nor exit is ever seen.
    const edge = viewport.width * 0.62 + gltf.width * scale;
    if (!placed.current) {
      rat.x = -direction * edge;
      placed.current = true;
    }

    rat.update(delta, edge * 2);

    group.current.position.set(rat.x, viewport.height / 2 - y * viewport.height + gltf.groundOffset * scale, 0);
    group.current.rotation.y = rat.yaw;

    if (Math.abs(rat.x) > edge && Math.sign(rat.velocity) === Math.sign(rat.x)) {
      onDone(rat.fleeing);
    }
  });

  if (!gltf) return null;
  return (
    <group ref={group}>
      <primitive object={gltf.scene} scale={scale} />
    </group>
  );
}

/** Self-scheduling GLTF rat: waits a random delay, crosses once, then reschedules. */
export function GltfRat(props: GltfRatProps) {
  const [active, setActive] = useState(false);
  const [direction, setDirection] = useState<1 | -1>(props.direction);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    timeoutRef.current = setTimeout(() => setActive(true), randomBetween(props.minDelay, props.maxDelay) * 1000);
    return () => clearTimeout(timeoutRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleDone(bolted: boolean) {
    setActive(false);
    // Come back in from the side it left by, so the next crossing continues the story
    // of the same animal rather than teleporting it back to where it started.
    if (bolted) setDirection((d) => (d === 1 ? -1 : 1));
    // A spooked rat also waits a beat longer before it dares come back.
    const scale = bolted ? 1.8 : 1;
    timeoutRef.current = setTimeout(
      () => setActive(true),
      randomBetween(props.minDelay, props.maxDelay) * scale * 1000,
    );
  }

  if (!active) return null;
  return <RatModel {...props} direction={direction} onDone={handleDone} />;
}
