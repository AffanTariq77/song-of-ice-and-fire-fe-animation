import type { QualitySettings } from '@/lib/quality';

/**
 * Where every stone in the corridor goes.
 *
 * Pure arithmetic, kept out of the components so the whole composition can be reasoned
 * about, and corrected, in one place. All units are world units in the rats scene's
 * own space: the camera sits at z = 3.2 with a 50-degree vertical field of view, so a
 * world unit is about a third of the strip's height.
 *
 * The shape of the problem is the aspect ratio. The footer strip is roughly 8:1, which
 * means a corridor bored straight into the screen would have to be about twenty-six
 * units wide to fill it, and its vault would then arch six units above a frame that is
 * three units tall, an invisible ceiling over a wall that reads as flat. So the
 * corridor runs left to right instead, with the camera inside it: the far wall faces
 * us, the barrel vault springs from its head and sweeps up out of frame overhead, and
 * the passage continues past both edges of the strip. Depth comes from the vault's
 * curve, from openings cut clean through a thick wall, and from cross passages that
 * recede to a torch far enough back that the fog takes it.
 */

/** Where the rats' feet land, as a fraction of viewport height from the top. */
export const LEDGE_Y = 0.85;

/** Face of the far wall. */
export const FAR_Z = -2.4;
/** Front nosing of the walkway. */
export const NEAR_Z = 0.42;
/** Thickness of the far wall, and therefore the depth of every reveal cut through it. */
export const WALL_D = 0.55;
/** Walkway surface up to the springing of the vault. */
export const WALL_H = 1.95;
/**
 * Barrel radius. Bounded below, not chosen: the vault has to reach from the far wall
 * back past the camera at z = 3.2, so 2 * R must exceed 3.2 - FAR_Z. Any smaller and
 * the near haunch closes in front of the lens.
 */
export const VAULT_R = 3.05;
/** World units from one pier to the next. */
export const BAY = 3.2;

export type CorridorLayout = {
  /** Walkway surface: the rats' ground line, and the springing of everything above it. */
  walkY: number;
  springY: number;
  /** Vault axis, running along x at this height and depth. */
  vaultZ: number;
  /** Width of the wall and vault: enough to cover the frame at their own depth. */
  width: number;
  /** Pier centres. */
  piers: number[];
  /** Bay centres, where a niche or a passage goes. */
  bayCentres: number[];
  /** Bay centres that are cross passages rather than barred niches. */
  passages: number[];
  /** Pier centres carrying a sconce. */
  torches: number[];
  /** Of those, the ones that get a real point light rather than a painted pool. */
  litTorches: number[];
  /**
   * How much each surviving light has to be turned up to stand in for the ones the tier
   * dropped. Without it a phone renders the same corridor at a third of the exposure of
   * a desktop, which reads as a different scene rather than as a cheaper one.
   */
  lightBoost: number;
};

/**
 * Everything set back from z = 0 covers less of the frame than its own width suggests,
 * because `viewport` is measured at z = 0. Scale by how much further from the camera a
 * thing is, or the corridor ends before the strip does and the footer shows black
 * wedges at both edges. This was already the fix in the flat version; it matters more
 * here, where the wall is further back.
 */
export function spread(cameraZ: number, z: number) {
  return (cameraZ - z) / cameraZ;
}

export function corridorLayout(
  viewportWidth: number,
  viewportHeight: number,
  cameraZ: number,
  quality: QualitySettings,
): CorridorLayout {
  const walkY = viewportHeight / 2 - LEDGE_Y * viewportHeight;
  const springY = walkY + WALL_H;
  const width = viewportWidth * spread(cameraZ, FAR_Z) * 1.1;

  const bays = Math.max(2, Math.ceil(width / BAY));
  const piers: number[] = [];
  const bayCentres: number[] = [];
  for (let i = 0; i <= bays; i++) piers.push(-width / 2 + i * (width / bays));
  for (let i = 0; i < bays; i++) bayCentres.push((piers[i] + piers[i + 1]) / 2);

  // Passages sit off centre and off symmetry. One dead in the middle reads as a
  // diagram; a pair at plus and minus a fifth of the width reads as a building.
  const passages: number[] = [];
  const wanted = quality.passages === 1 ? [-0.19] : [-0.28, 0.22];
  for (const fraction of wanted.slice(0, quality.passages)) {
    const target = width * fraction;
    const nearest = bayCentres.reduce((best, x) =>
      Math.abs(x - target) < Math.abs(best - target) ? x : best,
    );
    if (!passages.includes(nearest)) passages.push(nearest);
  }

  const every = Math.max(1, Math.round(quality.torchSpacing / (width / bays)));
  const inner = piers.filter((_, i) => i > 0 && i < piers.length - 1);
  // On a phone-width strip there may be only two or three piers, and a spacing rule
  // written for a desktop wall can select none of them. An unlit corridor is not a
  // degraded corridor, it is a black bar, so fall back to the middle pier.
  const torches = inner.filter((_, i) => i % every === 0);
  if (torches.length === 0 && inner.length > 0) torches.push(inner[Math.floor(inner.length / 2)]);

  // Real lights are spread across the whole width rather than clustered: an unlit
  // stretch at one end of the strip is far more obvious than slightly dimmer torches.
  const step = Math.max(1, Math.ceil(torches.length / Math.max(1, quality.torchLights)));
  const litTorches = torches.filter((_, i) => i % step === 0).slice(0, quality.torchLights);

  return {
    walkY,
    springY,
    vaultZ: FAR_Z + VAULT_R,
    width,
    piers,
    bayCentres,
    passages,
    torches,
    litTorches,
    lightBoost: Math.min(2.8, torches.length / Math.max(1, litTorches.length)),
  };
}
