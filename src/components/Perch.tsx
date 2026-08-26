'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { instantiate, type LoadedModel } from '@/lib/gltf-cache';
import type { PerchAnchor } from '@/lib/pointer-bridge';
import { PerchingCrow } from './PerchingCrow';

const BRANCH_URL = '/models/branch.glb';
/** How far along the main limb a bird stands. Far enough out to look perched and to
 *  clear the page edge, far enough in that the limb is still thick enough to hold it. */
const PERCH_ALONG = 0.58;

/**
 * Finds the top surface of the branch at a given fraction along its length by casting
 * a ray straight down onto the real geometry, rather than hard-coding a height that
 * would silently drift the moment the model is regenerated.
 */
function findPerchPoint(model: THREE.Object3D) {
  const box = new THREE.Box3().setFromObject(model);
  const x = THREE.MathUtils.lerp(box.min.x, box.max.x, PERCH_ALONG);
  const ray = new THREE.Raycaster(new THREE.Vector3(x, box.max.y + 1, 0), new THREE.Vector3(0, -1, 0));
  const hits = ray.intersectObject(model, true);
  return new THREE.Vector3(x, hits.length ? hits[0].point.y : (box.min.y + box.max.y) / 2, 0);
}

function useBranch() {
  const [branch, setBranch] = useState<(LoadedModel & { perch: THREE.Vector3; length: number }) | null>(null);
  useEffect(() => {
    let cancelled = false;
    instantiate(BRANCH_URL).then((model) => {
      if (cancelled) return;
      const box = new THREE.Box3().setFromObject(model.scene);
      setBranch({ ...model, perch: findPerchPoint(model.scene), length: box.max.x - box.min.x || 1 });
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return branch;
}

/**
 * One landing spot, placed from a host-reported rect.
 *
 * The rect arrives normalised to this iframe's box, and the iframe is positioned
 * absolutely inside the section it decorates, so the mapping below is exact and stays
 * exact while the page scrolls — see the note on PerchAnchor.
 */
export function Perch({ anchor }: { anchor: PerchAnchor }) {
  const { viewport } = useThree();
  const branch = useBranch();
  const group = useRef<THREE.Group>(null);

  const world = useMemo(() => {
    const toWorldX = (n: number) => (n - 0.5) * viewport.width;
    const toWorldY = (n: number) => (0.5 - n) * viewport.height;
    return {
      left: toWorldX(anchor.x),
      right: toWorldX(anchor.x + anchor.w),
      top: toWorldY(anchor.y),
      width: anchor.w * viewport.width,
    };
  }, [anchor, viewport.width, viewport.height]);

  // A bird is sized by what it is standing on, not by the frame. A perch band is a
  // wide, short strip, so anything measured against its world *width* comes out
  // microscopic; anything measured against a house card's width comes out enormous.
  const targetWidth = THREE.MathUtils.clamp(
    world.width * (anchor.kind === 'branch' ? 0.3 : 0.2),
    viewport.height * 0.12,
    viewport.height * 0.3,
  );

  if (anchor.kind === 'ledge') {
    // Nothing to draw: the bird stands on the page element itself.
    return (
      <PerchingCrow
        id={anchor.id}
        point={new THREE.Vector3((world.left + world.right) / 2, world.top, 0)}
        side={anchor.side}
        viewport={viewport}
        targetWidth={targetWidth}
      />
    );
  }

  if (!branch) return null;

  // The limb grows inward from the outer edge of the margin and spans it exactly, so it
  // never reaches across into the text column.
  const scale = world.width / branch.length;
  const originX = anchor.side === 'left' ? world.left : world.right;
  const mirror = anchor.side === 'left' ? 1 : -1;
  const perchWorld = new THREE.Vector3(
    originX + branch.perch.x * scale * mirror,
    world.top + branch.perch.y * scale,
    0,
  );

  return (
    <group ref={group}>
      <primitive object={branch.scene} position={[originX, world.top, 0]} scale={[scale * mirror, scale, scale]} />
      <PerchingCrow id={anchor.id} point={perchWorld} side={anchor.side} viewport={viewport} targetWidth={targetWidth} />
    </group>
  );
}
