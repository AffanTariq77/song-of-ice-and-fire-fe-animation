# RESOLVED

**Cause:** `color-scheme`. The host page (`song-of-ice-and-fire-fe`) sets
`color-scheme: dark` on its `<html>` (compiled into its stylesheet from
`globals.css`). A color-scheme does not inherit across a frame boundary, so this
app's document resolved to `light`, and Chrome filled the frame's base background
with the light canvas colour -- opaque white -- *underneath* this document.
`html, body { background: transparent }` cannot win against that, because the fill
sits beneath the document rather than being part of it.

The soft-edged oval shape is the host's own vignette: `GrainOverlay`'s
`radial-gradient(ellipse at center, transparent 45%, rgba(5,7,13,0.65) 100%)`
darkens the edges of that white surface and leaves a centred ellipse roughly 55%
of the viewport wide -- ~880px at 1600px, matching the "800-1000px" that was
measured. The short footer ledge has no room for the falloff, so it reads as a
uniformly white strip.

**Fix:** one line in `src/app/globals.css`:

```css
html {
  color-scheme: dark;
}
```

**How it was finally reproduced.** Contrary to the note below, this *does*
reproduce in headless Chromium -- what never reproduced was the comparison that
had been run. The decisive test is an A/B with the iframe held constant:

| host page | iframe | hero mean luma |
| --- | --- | --- |
| minimal dark page | transparent WebGL child | 8.3 (transparent, correct) |
| real site | same transparent WebGL child | 240.1 (opaque white) |
| real site | `about:blank` | 240.2 (opaque white) |
| minimal page + `html{color-scheme:dark}` only | same child | 255.0 (opaque white) |
| real site | child with `color-scheme: dark` | 55.7 (transparent, correct) |

That `about:blank` reproduces it is the tell: no WebGL, no Three.js, no content of
any kind. And the fourth row isolates the trigger to that single declaration --
nothing else from the host page is needed.

Bisection of the child's own `color-scheme`: `dark` and `only dark` composite
transparently; omitting it, `normal`, and `light` all reproduce.

**Why every earlier hypothesis came back negative.** They were all testing the
iframe's *contents* or the host's *paint*, and the bug is in neither -- it is the
frame surface's base background, which sits under the child document and is
decided before either one paints. Scene content, `antialias`, `setClearAlpha(0)`,
`premultipliedAlpha`, context loss, same-origin vs OOPIF, host filters and blend
modes are all genuinely irrelevant, exactly as those rounds concluded. The
minimal-test-page result was the real clue and was read backwards: minimal pages
do not reproduce it because minimal pages do not set `color-scheme: dark`.

Note that the fixes made along the way are still worth keeping on their own
merits -- the context-restore handler, the bounding-box sizing, the `/rats`
split. They just were not this.

---

# White glow over the hero — investigation handover

## Symptom

A soft-edged white radial glow (an oval, roughly 800-1000px wide, centered
around the hero content) appears over `song-of-ice-and-fire-3l4u.vercel.app`'s
homepage (and other pages) once the ambient-creatures iframe is present.
Text underneath it also reads as blurred, not just brightened.

## How to reproduce

**Headless Chrome never shows this bug.** It uses software rendering
(SwiftShader), which appears to mask it. You need real GPU-accelerated
rendering:

```js
const { chromium } = require('playwright-core'); // npm i --no-save playwright-core
const browser = await chromium.launch({ channel: 'chrome', headless: false }); // headless: false is required
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
await page.goto('https://song-of-ice-and-fire-3l4u.vercel.app/');
// click "SKIP INTRO" if present, wait ~3-4s, screenshot
```

Confirmed GPU backend on the machine this was investigated on:
`ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)`.

## What's been ruled out (all tested directly against the live deployed site)

- **Which creature is in the scene** — reproduces with the old GLTF rat, the
  procedural rat, and a **completely empty Canvas** (no lights, no meshes at
  all). Scene content is not the cause.
- **`antialias: true` (MSAA)** — disabled it (`antialias: false` is what's
  currently deployed), glow unchanged.
- **Clear color / alpha ambiguity** — added explicit
  `gl.setClearColor(0x000000, 0)` and `premultipliedAlpha: false`. No change.
  Confirmed via `gl.getContextAttributes()` inside the live iframe that the
  browser actually granted `alpha: true, premultipliedAlpha: false` as
  requested — so it's not a context-negotiation issue either.
- **CSS filters / backdrop-filters / mix-blend-mode anywhere on the host
  page** — tested by injecting `*, *::before, *::after { filter: none
  !important; backdrop-filter: none !important; mix-blend-mode: normal
  !important; }` via `page.addInitScript()` (runs before the page's own JS,
  so this isn't a "disable after the layer already formed" test — it's clean).
  This specifically also covers `.texture-stone::before`'s
  `filter: url(#noise-stone)` + `mix-blend-mode: overlay` (the Hero section's
  own pseudo-element texture, the most likely-looking suspect) and
  `GrainOverlay`'s `filter: url(#noise-grain)`. No change either way.
- **Rendering the iframe standalone, or embedding it in a minimal test page**
  — built a bare dark-background HTML page (both via `file://` and via a real
  local HTTP server) with just `<iframe src="https://song-of-ice-and-fire-fe-
  animation.vercel.app">`. **Never reproduces**, regardless of protocol. Only
  the real, full `song-of-ice-and-fire-3l4u.vercel.app` page triggers it.
- **Hiding the iframe** (`iframe.style.display = 'none'`) makes the glow
  disappear completely and the hero renders perfectly crisp — so it's
  unambiguously coming from the iframe's presence, not a pre-existing host
  bug.

## Round 2 (after the /rats route split)

A live console check turned up `THREE.WebGLRenderer: Context Lost.` — a real
event, not speculation. Three.js auto-restores a lost context (calls
`preventDefault()` internally) but restoration doesn't re-run Canvas's
`onCreated`, so the explicit transparent-clear call was only ever applied
once and silently reverted on restore. Fixed by re-applying
`gl.setClearAlpha(0)` on a `webglcontextrestored` listener
(`AmbientCreaturesScene.tsx` / `RatsScene.tsx`).

**This did not fix the glow.** A follow-up repro (same real-GPU method, same
live site) showed the glow again with **no** "Context Lost" in the console at
all that time. So the context-loss event was real and worth fixing regardless
(it's a legitimate robustness gap), but it is not this bug's cause — or at
least not the only one.

Two more hypotheses tested and ruled out in this round:
- **Two simultaneous iframes** (the sitewide crow/dragon one plus the new
  footer-scoped rats one) — removed the rats iframe via
  `element.remove()` live, glow unchanged. Not an interaction between them;
  the sitewide iframe alone still shows it.
- **`PageTransition.tsx`'s framer-motion wrapper** (`motion.div` with
  `opacity`/`y` animation) leaving a lingering `transform`/`will-change` that
  promotes a GPU layer next to the iframe — checked computed style ~4s after
  load: `transform: none`, `will-change: auto`. Framer Motion had already
  cleaned it up by the time the glow is visible. Not it.

## What this means

Every content-level, config-level, and now several layer-promotion-adjacent
hypotheses are exhausted. The bug requires **both** (a) an R3F `<Canvas>`
mounted in the iframe — any content, even empty — **and** (b) something
specific to the real host page that no minimal test page reproduces. This is
genuinely at the point where scripted browser automation has diminishing
returns; it needs a human (or an agent with real interactive DevTools access)
to open the actual **Layers** panel (Chrome menu → More Tools → Layers, or
`Cmd+Shift+P` → "Show Layers") on `song-of-ice-and-fire-3l4u.vercel.app` with
the iframe present, find the compositing layer at the hero's screen position,
and read its actual compositing reasons directly — a `LayerTree.enable` CDP
scripted attempt during this investigation returned zero layers, so scripted
CDP access alone hasn't been sufficient either.

## Round 3 (footer iframe isolation + forced reflow)

With the footer split into its own `/rats` iframe (absolutely positioned,
~130px tall, separate from the sitewide fixed one), two more tests:

- **Removed the sitewide iframe, kept only the footer one** — the hero
  rendered perfectly (no glow at all) while the footer iframe was scrolled
  out of view. Scrolling down to where the footer iframe actually is showed
  the *same* white glow, but filling almost the entire short strip rather
  than reading as an obviously-radial shape. This is very likely the same
  underlying phenomenon just viewed through a much shorter window — if it's
  genuinely a radial gradient sized independent of the iframe's own pixel
  height, a 130px-tall strip wouldn't have room to show the soft fade-to-
  transparent edges the way the full-viewport sitewide case does, so it
  reads as "the whole strip is white" even though it's probably the same
  shape. Not confirmed either way, but not a strong signal of a *different*
  bug — both iframes show it independently, so it's not an interaction
  between them (already ruled out in round 2) and isn't tied to iframe size
  either.
- **Forced a full reflow/recomposite** (`iframe.style.display = 'none'`,
  forced layout via `offsetHeight` read, restore `display`) — no change.
  Rules out "Chrome painted a stale/blank frame and never repainted" as a
  simple compositing hiccup; whatever's happening, it's stable/reproducible
  on every paint, not a one-time stuck frame.

## Round 4 (cross-origin OOPIF compositing theory)

A very well-reasoned hypothesis from independent debugging (both a user
session and this one converged on it): cross-origin iframes run in a
separate Chromium renderer process (Site Isolation / out-of-process iframes),
and WebGL alpha-transparency compositing back into the parent page across
that process boundary has real, documented Chromium limitations. This would
explain why it only reproduces on the real host page's heavier compositing
load and never on minimal test pages, even though both are cross-origin.

Tested directly: added a Next.js rewrite (`/ambient-layer/:path* →
song-of-ice-and-fire-fe-animation.vercel.app/:path*`) so the iframe is fully
same-origin with the host page, eliminating the OOPIF path entirely.
Confirmed same-origin via `new URL(iframe.src).origin === location.origin`.
**Identical glow, byte-for-byte same shape.** This is now also ruled out.
Reverted (see commit reverting "rats fix" in song-of-ice-and-fire-fe) since
it added a proxy hop for no benefit.

At this point every hypothesis testable via scripted browser automation
(Playwright, real GPU Chrome, live console, CDP, and now same-origin
elimination) has been exhausted across four rounds. This is genuinely at the
point where it needs a human (or an agent with interactive DevTools) looking
at the actual **Layers** panel.

## Where things are

- Currently deployed: `antialias: false`, `setClearAlpha(0)` re-applied on
  context restore, GLTF rat split into its own `/rats` route (grounded via
  bounding-box offset), crow/dragon sized via computed bounding box instead
  of guessed scale multipliers — all real, verified fixes, independent of
  the glow.
- The glow is very likely still present on the sitewide crow/dragon layer.
  Not yet re-tested against the footer-only `/rats` iframe specifically in
  isolation (only tested "remove rats iframe, keep sitewide" — not the
  reverse). Worth checking whether the footer-scoped iframe alone (smaller,
  different camera distance, absolutely positioned instead of fixed) shows
  the same glow or not — if it doesn't, that's a real, novel clue about what
  differs between the two.
