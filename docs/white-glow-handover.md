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

## What this means

The bug requires **both** (a) an R3F `<Canvas>` mounted in the iframe — any
content, even empty — **and** (b) something specific to the real host page
that a minimal test page doesn't have. CSS filters/blend-modes (the most
obvious candidates) are ruled out. That leaves things like: `will-change` /
`transform: translate3d(...)` elsewhere on the page (there are a few in
`globals.css`, in the fog-drift animation, not yet tested with early
neutralization), the sheer number of stacked `position: fixed` full-viewport
layers on this site (AmbientBackground, SvgFilters, GrainOverlay, Navbar, this
iframe — five-plus fixed layers is unusual), or genuinely something in Chrome's
GPU compositing layer promotion that needs the actual DevTools **Layers** or
**Paint Profiler** panel (not CDP scripted access — a `LayerTree.enable` CDP
attempt during this investigation returned zero layers, possibly needs a
different attach sequence) to see which layer is doing this and why.

## Where things are

- Currently deployed: `antialias: false`, explicit `setClearColor`, GLTF rat
  (grounded via bounding-box offset), all in
  `src/components/AmbientCreaturesScene.tsx`.
- The glow is very likely still present. This doc exists because further
  progress needs actual visual GPU debugging tools this environment doesn't
  have — open the real DevTools **Layers** panel (Chrome menu → More Tools →
  Layers, or `Cmd+Shift+P` → "Show Layers") on
  `song-of-ice-and-fire-3l4u.vercel.app` with the iframe present, find the
  layer at the hero's screen position, and check what's compositing it.
