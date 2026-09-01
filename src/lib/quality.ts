'use client';

import { useCallback, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';

/**
 * How much corridor the machine gets.
 *
 * The footer strip is small in pixels (roughly 1600x208 on a desktop, 390x160 on a
 * phone) so fill rate is never the problem here. Draw calls, real lights and
 * generated texture memory are. Every knob below is one of those three.
 */
export type QualityTier = 'low' | 'mid' | 'high';

export type QualitySettings = {
  tier: QualityTier;
  /** Edge length of every generated stone texture. Powers of two: the normal-map pass wraps with a bitmask. */
  textureSize: number;
  /** How many torches get a real point light. The rest get a painted pool of light and a flame. */
  torchLights: number;
  /**
   * World units between sconces. The same on every tier: dropping sconces as well as
   * lights would change the architecture rather than the rendering of it.
   */
  torchSpacing: number;
  /** Voussoir blocks per transverse rib, across the full half circle. */
  voussoirs: number;
  /** Rib rings inside a cross passage, deepest first. */
  passageRings: number;
  /** Cross passages cut through the far wall. */
  passages: number;
  dust: number;
  drips: number;
  cobwebs: number;
  /** One shadow-casting spot light on the walkway. Point-light shadows are six renders a frame; this is one. */
  shadows: boolean;
  dpr: [number, number];
};

export const QUALITY: Record<QualityTier, QualitySettings> = {
  low: {
    tier: 'low',
    textureSize: 256,
    torchLights: 3,
    torchSpacing: 6.4,
    voussoirs: 10,
    passageRings: 2,
    passages: 1,
    dust: 0,
    drips: 0,
    cobwebs: 0,
    shadows: false,
    dpr: [1, 1],
  },
  mid: {
    tier: 'mid',
    textureSize: 512,
    torchLights: 6,
    torchSpacing: 6.4,
    voussoirs: 16,
    passageRings: 3,
    passages: 2,
    dust: 70,
    drips: 2,
    cobwebs: 4,
    shadows: false,
    dpr: [1, 1.5],
  },
  high: {
    tier: 'high',
    textureSize: 1024,
    torchLights: 10,
    torchSpacing: 6.4,
    voussoirs: 23,
    passageRings: 5,
    passages: 2,
    dust: 150,
    drips: 4,
    cobwebs: 7,
    shadows: true,
    dpr: [1, 2],
  },
};

const ORDER: QualityTier[] = ['low', 'mid', 'high'];

/**
 * A first guess from what the browser will admit to.
 *
 * Deliberately pessimistic. `deviceMemory` is Chromium-only and clamped to 8, and
 * `hardwareConcurrency` says nothing about the GPU, so this is a floor rather than a
 * measurement, the frame-time watchdog below is what actually decides.
 */
export function detectTier(): QualityTier {
  if (typeof window === 'undefined') return 'mid';

  const nav = navigator as Navigator & { deviceMemory?: number };
  const memory = nav.deviceMemory ?? 4;
  const cores = nav.hardwareConcurrency ?? 4;
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const narrow = window.innerWidth < 820;

  if (coarse || narrow || memory <= 3 || cores <= 3) return 'low';
  if (memory >= 8 && cores >= 8) return 'high';
  return 'mid';
}

/**
 * Watches frame time and drops a tier when the scene cannot hold its own.
 *
 * Only ever downgrades. Upgrading on a good run would let the corridor oscillate
 * between tiers, and every tier change rebuilds textures and merged geometry.
 */
export function QualityWatchdog({ onDowngrade }: { onDowngrade: () => void }) {
  const slow = useRef(0);
  const warmup = useRef(0);

  useFrame((_, delta) => {
    // Ignore the first second: texture generation and geometry merging land there.
    if (warmup.current < 1) {
      warmup.current += delta;
      return;
    }
    // 28ms is a hair under 36fps. Half a second of that in a row is a real problem,
    // not a stutter from a garbage collection or another tab waking up.
    slow.current = delta > 0.028 ? slow.current + delta : 0;
    if (slow.current > 0.5) {
      slow.current = 0;
      warmup.current = 0;
      onDowngrade();
    }
  });

  return null;
}

/** Detected tier plus the downgrade path the watchdog drives. */
export function useQuality(): [QualitySettings, () => void] {
  // Detected in the state initialiser rather than in an effect: this scene is mounted
  // through a dynamic import with ssr disabled, so window is already there on the
  // first render, and detecting later would build one tier's textures and throw them
  // away a frame afterwards.
  const [tier, setTier] = useState<QualityTier>(detectTier);

  const downgrade = useCallback(() => {
    setTier((current) => ORDER[Math.max(0, ORDER.indexOf(current) - 1)]);
  }, []);

  return [QUALITY[tier], downgrade];
}
