import * as THREE from 'three';

export type LoadedModel = {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
  /** Rendered width in world units, resolving any transform baked into the node hierarchy. */
  width: number;
  /** Distance from the model's authored origin down to its lowest point, for grounding. */
  groundOffset: number;
};

/**
 * One parse per model URL, shared by every instance.
 *
 * Each creature used to run its own GLTFLoader against the same file. The browser
 * serves the bytes from cache, but every instance still parsed them and uploaded its
 * own copy to the GPU — six rats meant six parses of a 33MB GLB, and the sky holds
 * five crows against a 6.4MB one. That is almost certainly what was behind the
 * "THREE.WebGLRenderer: Context Lost" seen during the white-glow investigation.
 */
const cache = new Map<string, Promise<LoadedModel>>();

function load(url: string): Promise<LoadedModel> {
  const existing = cache.get(url);
  if (existing) return existing;

  const pending = (async () => {
    // Fully dynamic import of three's own loader rather than drei's useGLTF, which
    // drags in Draco/Meshopt decoder wiring these plain models do not need and which
    // was blowing up Turbopack's build memory sitewide.
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
    const gltf = await new GLTFLoader().loadAsync(url);
    const box = new THREE.Box3().setFromObject(gltf.scene);
    const size = box.getSize(new THREE.Vector3());
    return {
      scene: gltf.scene,
      animations: gltf.animations,
      width: Math.max(size.x, size.z) || 1,
      groundOffset: -box.min.y,
    };
  })();

  cache.set(url, pending);
  return pending;
}

/**
 * An independently animatable copy of a cached model.
 *
 * Must go through SkeletonUtils rather than Object3D.clone(): these models are skinned,
 * and a plain clone leaves every copy bound to the original's skeleton, so all of them
 * animate as one.
 */
export async function instantiate(url: string): Promise<LoadedModel> {
  const base = await load(url);
  const { clone } = await import('three/examples/jsm/utils/SkeletonUtils.js');
  return { ...base, scene: clone(base.scene) as THREE.Group };
}
