'use client';

import { useMemo } from 'react';
import { stoneTexture } from '@/lib/stone-texture';

/**
 * A broken stone spire for the dragon to sit on: a weathered column, narrowing and
 * leaning as it rises, with a snapped-off crown.
 *
 * Built from geometry so it scales to whatever width the host gives it, and so it
 * shares the corridor's masonry texture rather than introducing another asset.
 */
export function Roost({ height, radius }: { height: number; radius: number }) {
  const texture = useMemo(() => {
    const t = stoneTexture().clone();
    t.needsUpdate = true;
    t.repeat.set(1.1, 1.5);
    return t;
  }, []);

  const drums = useMemo(() => {
    // Seeded, so the ruin is the same one on every visit.
    let seed = 5150411;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    const COUNT = 7;
    const out: { y: number; h: number; rb: number; rt: number; tilt: number; turn: number; dx: number }[] = [];
    let y = 0;
    let dx = 0;
    for (let i = 0; i < COUNT; i++) {
      const h = (height / COUNT) * (0.85 + rnd() * 0.4);
      const shrink = 1 - i / (COUNT + 2.5);
      const rb = radius * shrink;
      const rt = radius * (1 - (i + 1) / (COUNT + 2.5));
      const tilt = (rnd() - 0.5) * 0.09;
      out.push({ y: y + h / 2, h, rb, rt, tilt, turn: rnd() * Math.PI, dx });
      // Each drum sits slightly off the one below, so the stack leans and reads as
      // a ruin rather than a lathe-turned cone.
      dx += tilt * h * 1.6;
      y += h * 0.97;
    }
    return out;
  }, [height, radius]);

  return (
    <group>
      {drums.map((d, i) => (
        <mesh key={i} position={[d.dx, d.y, 0]} rotation={[0, d.turn, d.tilt]}>
          <cylinderGeometry args={[d.rt, d.rb, d.h, 9, 1]} />
          <meshStandardMaterial map={texture} color="#ffffff" roughness={0.9} metalness={0} />
        </mesh>
      ))}
      {/* A broken lip at the crown, where the column sheared off. */}
      <mesh position={[drums[drums.length - 1].dx, height * 1.0, 0]} rotation={[0, 0.7, 0.06]}>
        <cylinderGeometry args={[radius * 0.32, radius * 0.26, height * 0.05, 7, 1]} />
        <meshStandardMaterial map={texture} color="#ffffff" roughness={0.88} metalness={0} />
      </mesh>
    </group>
  );
}

/** Where a dragon's feet land on a roost of this height. */
export function roostTop(height: number) {
  return height * 1.03;
}
