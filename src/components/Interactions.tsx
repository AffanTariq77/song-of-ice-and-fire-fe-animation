'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { pointerState, startPointerBridge } from '@/lib/pointer-bridge';

type TargetEntry = {
  objectRef: { current: THREE.Object3D | null };
  radius: number;
  onClick: () => void;
};

/**
 * Module-level rather than React context: the set is read once per frame inside a
 * useFrame loop, and routing it through context would re-render every creature
 * whenever one registers or unregisters — which happens constantly, since each
 * crossing is a fresh mount.
 */
const targets = new Set<TargetEntry>();

/**
 * Registers a creature as clickable. The callback is read through a ref, so it does not
 * need to be referentially stable at the call site.
 */
export function useInteractive(opts: {
  objectRef: { current: THREE.Object3D | null };
  radius: number;
  onClick: () => void;
}) {
  const entry = useRef<TargetEntry>({ objectRef: opts.objectRef, radius: opts.radius, onClick: opts.onClick });

  // Refreshed after every render rather than during it, so the frame loop always sees
  // the latest callbacks without the caller having to memoise them.
  useEffect(() => {
    entry.current.objectRef = opts.objectRef;
    entry.current.radius = opts.radius;
    entry.current.onClick = opts.onClick;
  });

  useEffect(() => {
    const e = entry.current;
    targets.add(e);
    return () => {
      targets.delete(e);
    };
  }, []);
}

const worldPos = new THREE.Vector3();

/**
 * Hit-tests the host's forwarded click against every registered creature. Mount inside
 * a <Canvas>.
 *
 * This is a screen-space ellipse test rather than a THREE.Raycaster pass. Raycasting
 * these models means testing skinned, animated meshes every frame for a target that is
 * a few dozen pixels across and moving — expensive, and unforgiving to actually click.
 * Projecting one point per creature and comparing against a generous radius is far
 * cheaper and much nicer to hit.
 */
export function Interactions() {
  const { viewport, camera } = useThree();
  const lastClickSeq = useRef(pointerState.clickSeq);

  useEffect(() => {
    startPointerBridge();
  }, []);

  useFrame(() => {
    // Nothing to do on a frame with no new click, which is all but a handful of them.
    // The previous version hit-tested every creature every frame against a forwarded
    // cursor position; this one does nothing at all until someone actually clicks.
    if (pointerState.clickSeq === lastClickSeq.current) return;
    lastClickSeq.current = pointerState.clickSeq;

    // The camera is a fixed perspective one and the creatures all sit near z = 0, so
    // NDC-per-world-unit is constant across the plane and needs no per-target projection.
    const ndcPerWorldX = 2 / viewport.width;
    const ndcPerWorldY = 2 / viewport.height;

    let best: TargetEntry | null = null;
    let bestDistance = Infinity;

    for (const target of targets) {
      const object = target.objectRef.current;
      if (!object) continue;
      object.getWorldPosition(worldPos).project(camera);
      const dx = (worldPos.x - pointerState.ndcX) / (target.radius * ndcPerWorldX);
      const dy = (worldPos.y - pointerState.ndcY) / (target.radius * ndcPerWorldY);
      const distance = dx * dx + dy * dy;
      if (distance <= 1 && distance < bestDistance) {
        bestDistance = distance;
        best = target;
      }
    }

    best?.onClick();
  });

  return null;
}
