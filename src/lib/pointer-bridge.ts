/**
 * Receives pointer activity from the embedding page.
 *
 * The creature iframes are `pointer-events: none` and must stay that way: they are
 * full-viewport and would otherwise swallow every click on the site. So the host
 * listens for pointer activity itself and forwards it here, normalised to 0..1
 * within the iframe's own box, which means the same protocol works for the
 * full-viewport crow layer and the short footer rats strip without either side
 * knowing the other's geometry.
 */

/**
 * A place a crow can land, as reported by the host. All four rect fields are
 * normalised to 0..1 within the iframe's own box, same convention as pointer
 * coordinates.
 *
 * These are only meaningful for a perch iframe, which is positioned *absolutely*
 * inside the section it decorates rather than fixed to the viewport. That matters: a
 * fixed overlay repositioned by postMessage lags the page by exactly one frame while
 * scrolling — measured at 5px, 15px and 40px for slow, normal and fast scrolling — and
 * a branch that slides against the text it is anchored to looks broken. An absolutely
 * positioned frame scrolls natively with the page, so these rects only change on
 * layout, never on scroll.
 */
export type PerchAnchor = {
  id: string;
  /** 'branch' grows a branch from the outer edge; 'ledge' perches on the rect's top edge. */
  kind: 'branch' | 'ledge';
  side: 'left' | 'right';
  x: number;
  y: number;
  w: number;
  h: number;
};

export type AmbientPointerMessage =
  | { source: 'asoiaf-ambient'; v: 1; type: 'pointer'; x: number; y: number }
  | { source: 'asoiaf-ambient'; v: 1; type: 'click'; x: number; y: number }
  | { source: 'asoiaf-ambient'; v: 1; type: 'leave' }
  | { source: 'asoiaf-ambient'; v: 1; type: 'anchors'; anchors: PerchAnchor[] };

/** Mutable, read every frame by <Interactions />. Deliberately not React state. */
export const pointerState = {
  /** Normalised device coordinates, -1..1, y up. Only meaningful while `inside`. */
  ndcX: 0,
  ndcY: 0,
  inside: false,
  /** Increments on each click. Consumers compare against their own last-seen value. */
  clickSeq: 0,
};

/**
 * Origins allowed to drive the creatures. These messages only ever move creatures
 * around, so the blast radius of a bad one is a bird flying away, but an allowlist
 * costs nothing and keeps the surface honest. Override in Vercel with
 * NEXT_PUBLIC_PARENT_ORIGINS (comma-separated) rather than editing this list.
 */
const CONFIGURED = (process.env.NEXT_PUBLIC_PARENT_ORIGINS ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const DEFAULT_ORIGINS = ['https://song-of-ice-and-fire-3l4u.vercel.app'];

function isAllowedOrigin(origin: string) {
  if (CONFIGURED.length > 0) return CONFIGURED.includes(origin);
  if (DEFAULT_ORIGINS.includes(origin)) return true;
  // Vercel preview deployments of the host app, and local development.
  if (/^https:\/\/song-of-ice-and-fire-[a-z0-9-]+\.vercel\.app$/.test(origin)) return true;
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  return false;
}

function isRect(v: unknown): v is PerchAnchor {
  if (typeof v !== 'object' || v === null) return false;
  const a = v as Record<string, unknown>;
  if (typeof a.id !== 'string') return false;
  if (a.kind !== 'branch' && a.kind !== 'ledge') return false;
  if (a.side !== 'left' && a.side !== 'right') return false;
  return (['x', 'y', 'w', 'h'] as const).every((k) => typeof a[k] === 'number' && Number.isFinite(a[k]));
}

function isPointerMessage(data: unknown): data is AmbientPointerMessage {
  if (typeof data !== 'object' || data === null) return false;
  const m = data as Record<string, unknown>;
  if (m.source !== 'asoiaf-ambient' || m.v !== 1) return false;
  if (m.type === 'leave') return true;
  if (m.type === 'anchors') return Array.isArray(m.anchors) && m.anchors.every(isRect);
  if (m.type !== 'pointer' && m.type !== 'click') return false;
  return typeof m.x === 'number' && typeof m.y === 'number' && Number.isFinite(m.x) && Number.isFinite(m.y);
}

/** Latest anchors, plus a subscription so React can re-render when they change. */
let anchors: PerchAnchor[] = [];
const anchorListeners = new Set<() => void>();

export function subscribeAnchors(fn: () => void) {
  anchorListeners.add(fn);
  return () => {
    anchorListeners.delete(fn);
  };
}

export function getAnchors() {
  return anchors;
}

function onMessage(event: MessageEvent) {
  if (!isAllowedOrigin(event.origin)) return;
  if (!isPointerMessage(event.data)) return;

  if (event.data.type === 'leave') {
    pointerState.inside = false;
    return;
  }

  if (event.data.type === 'anchors') {
    anchors = event.data.anchors;
    for (const fn of anchorListeners) fn();
    return;
  }

  pointerState.ndcX = event.data.x * 2 - 1;
  pointerState.ndcY = -(event.data.y * 2 - 1);
  pointerState.inside = true;
  if (event.data.type === 'click') pointerState.clickSeq += 1;
}

let started = false;

/** Idempotent; safe to call from every scene that wants pointer reactions. */
export function startPointerBridge() {
  if (started || typeof window === 'undefined') return;
  started = true;
  window.addEventListener('message', onMessage);

  // Tell the host we are listening, so it does not forward into a dead frame.
  if (window.parent !== window) {
    let parentOrigin = '';
    try {
      parentOrigin = document.referrer ? new URL(document.referrer).origin : '';
    } catch {
      parentOrigin = '';
    }
    if (parentOrigin && isAllowedOrigin(parentOrigin)) {
      window.parent.postMessage({ source: 'asoiaf-ambient', v: 1, type: 'ready' }, parentOrigin);
    }
  }
}
