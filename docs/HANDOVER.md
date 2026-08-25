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

# Handover: white-glow bug over the main site's hero/footer

## Project context

Two repos:

- **`song-of-ice-and-fire-fe`** — the main ASOIAF fan site (Next.js 16, App
  Router). Deployed at `https://song-of-ice-and-fire-3l4u.vercel.app`.
- **`song-of-ice-and-fire-fe-animation`** — a standalone Next.js app whose
  only job is rendering an ambient 3D creature layer (crow, dragon, rats;
  `three.js` + `@react-three/fiber`, GLTF models). Deployed at
  `https://song-of-ice-and-fire-fe-animation.vercel.app`. Split into its own
  repo because bundling this into the main app's own build consistently
  OOM'd Vercel's 8GB build container (unrelated to the bug below — that
  problem is solved and not in scope here).

The main site embeds this animation app via `<iframe>` in two places:

- `src/components/decorative/AmbientCreatures.tsx` — sitewide, full-viewport,
  `position: fixed`, `pointer-events: none`, `z-index: 1`. Points at the
  animation app's `/` route (crow + dragon).
- `src/components/layout/Footer.tsx` — a ~130px stone-ledge strip at the top
  of the footer, `position: absolute` within that strip. Points at the
  animation app's `/rats` route (six rat instances, run/pause/look-up
  behavior).

Both iframes are meant to be **fully transparent** so the site's own
background/content shows through, with only the 3D creatures visible on top.

## The bug

A soft-edged, roughly oval white/light-gray glow appears over the iframe's
area on the real deployed site — covering most of the hero section (when the
sitewide iframe is active there) or the whole footer ledge strip (when only
that one is active). Text underneath reads as blurred, not just brightened.
It does not always appear immediately on page load; it can take a few
seconds (roughly matches the idle-callback delay before the iframe mounts,
this part is expected/not mysterious).

**Critical: this bug does not reproduce in headless Chrome.** It requires
real GPU-accelerated rendering. Headless Chrome (via Playwright/Puppeteer,
default config) uses software rendering (SwiftShader) which appears to mask
it entirely — every automated check that used headless mode reported "looks
fine," which was false. You must use `headless: false` (a real visible, or
at least real-GPU, browser window) to see it at all.

```js
const { chromium } = require('playwright-core'); // npm i --no-save playwright-core
const browser = await chromium.launch({ channel: 'chrome', headless: false });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
await page.goto('https://song-of-ice-and-fire-3l4u.vercel.app/');
// Click "SKIP INTRO" if present (first-visit intro animation), wait ~4s, screenshot.
```

Confirmed GPU backend used during this investigation:
`ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)`, i.e. a
real Mac with Apple Silicon, Chrome's default rendering path. If you're on a
different GPU/OS, the bug may or may not reproduce identically — that itself
would be useful information.

## Everything ruled out (with evidence, most useful first)

Each of these was tested **directly against the live/real setup**, not
theorized:

1. **It's the iframe, definitely.** `iframe.style.display = 'none'` makes
   the glow disappear completely and the page renders perfectly crisp.
   Confirms it's coming from the iframe's presence, not a pre-existing host
   bug.

2. **Not the WebGL canvas's own rendered pixels.** Hiding just the
   `<canvas>` element *inside* the iframe (not the whole iframe) does **not**
   remove the glow. Whatever it is, it's not literally what Three.js draws.

3. **Not scene content.** Reproduces identically with the full creature
   scene, with the procedural (non-GLTF) rat that was tried at one point, and
   with a **completely empty `<Canvas>`** — no lights, no meshes, nothing.

4. **Not lighting, not antialiasing (MSAA).** Tried `antialias: false`
   (currently deployed that way). No change.

5. **Not clear-color/alpha ambiguity.** Explicit `gl.setClearAlpha(0)` (and
   earlier `gl.setClearColor(0x000000, 0)`), `premultipliedAlpha: false`.
   Confirmed via `gl.getContextAttributes()` inside the live iframe that
   Chrome actually granted `alpha: true, premultipliedAlpha: false` as
   requested. No change.

6. **Not a WebGL context-loss/restore issue** — although this **was** a real
   bug, now fixed and worth keeping: the live console showed
   `THREE.WebGLRenderer: Context Lost.` at one point. Three.js
   auto-restores (calls `preventDefault()` internally) but restoration
   doesn't re-run React Three Fiber's `onCreated`, so the transparent-clear
   call was only ever applied once and silently lost on restore. Fixed by
   re-applying `gl.setClearAlpha(0)` on a `webglcontextrestored` listener
   (see `AmbientCreaturesScene.tsx` / `RatsScene.tsx`). **This did not fix
   the glow** — a later repro showed the glow again with zero "Context Lost"
   in the console. Real bug, wrong bug.

7. **Not any CSS filter, backdrop-filter, or mix-blend-mode on the host
   page** — including pseudo-elements. Tested by injecting
   `*, *::before, *::after { filter: none !important; backdrop-filter: none
   !important; mix-blend-mode: normal !important; }` via
   `page.addInitScript()`, which runs *before* the page's own JS/CSS applies
   (not a "disable after the layer already formed" test). This specifically
   covers `.texture-stone::before`'s `filter: url(#noise-stone)` +
   `mix-blend-mode: overlay` (the hero section's own textured pseudo-element
   — the most plausible-looking suspect) and `GrainOverlay`'s
   `filter: url(#noise-grain)`. No change.

8. **Not reproducible on any minimal test host.** Built a bare page with
   just `<iframe src="https://song-of-ice-and-fire-fe-animation.vercel.app">`
   on a black background — tested via `file://`, via a local Python
   `http.server`, and via the local `song-of-ice-and-fire-fe` dev server
   itself. **Never reproduces on a minimal page.** Only the real, full,
   complex host page triggers it. (This means it needs *both* the iframe
   *and* something about the real host page's complexity/load — see below.)

9. **Not two iframes interacting.** After splitting rats into their own
   footer-scoped iframe (so the page has two simultaneous iframes: sitewide
   crow/dragon + footer rats), removed just the footer one via
   `element.remove()` live — glow unchanged on the sitewide one. Removed the
   sitewide one instead, kept only the footer one — the footer strip *alone*
   also shows the same glow (filling almost its whole ~130px height, since a
   strip that short doesn't have room to show a gradient's soft fade-out the
   way the full-viewport case does — likely the same underlying shape, just
   viewed through a much smaller window). Not an interaction between the two;
   each iframe shows it independently.

10. **Not `PageTransition.tsx`'s framer-motion wrapper.** It animates
    `opacity`/`y` (→ `transform: translateY(...)`) on page mount, which could
    plausibly leave a `transform`/`will-change` promoting a GPU layer next to
    the iframe. Checked computed style ~4s after load, well past the 0.35s
    transition: `transform: none`, `will-change: auto`. Framer Motion had
    already cleaned it up by the time the glow is visible.

11. **Not a stuck/stale compositor frame.** Forced a full reflow of the
    iframe (`display:none` → force layout via reading `offsetHeight` →
    restore `display`). No change — rules out "Chrome painted one bad frame
    and never repainted."

12. **Not cross-origin out-of-process-iframe (OOPIF) compositing.** A
    strong, well-reasoned theory: cross-origin iframes run in a separate
    Chromium renderer process (Site Isolation), and WebGL alpha-transparency
    compositing back into the parent across that process boundary has real
    documented Chromium limitations. Tested directly: added a Next.js
    rewrite (`/ambient-layer/:path*` → the animation app) so the iframe
    became fully same-origin with the host. Confirmed same-origin via
    `new URL(iframe.src).origin === location.origin` (`true`). **Identical
    glow.** Reverted (see main repo commit history around "rats fix" /
    the revert immediately after it).

## What has *not* been tried

- **Actual Chrome DevTools Layers panel** (Chrome menu → More Tools →
  Layers, or `Cmd+Shift+P` → "Show Layers") with the iframe present on the
  live site, to see which compositing layer is actually painting white and
  read its real compositing reasons. A scripted CDP `LayerTree.enable`
  attempt during this investigation returned zero layers — possibly needs a
  different attach sequence, or just needs a human driving real DevTools
  rather than the automation protocol.
- **Chrome's Paint Profiler** for the same reason.
- Reproducing on a **different GPU/OS** than Apple Silicon + Metal ANGLE, to
  see if it's GPU/driver-specific.
- Filing this as a **Chromium bug report** if a DevTools session confirms
  it's a genuine compositor issue rather than something fixable in app code.
- **`chrome://gpu`** on the affected machine, to check for any reported
  driver bugs/workarounds already active for this GPU.

## Everything else fixed this session (for context — don't undo these)

- Crow and dragon were rendering at wildly wrong sizes because their GLB
  files bake a scale/rotation into a root node **matrix**, which a naive
  raw-mesh-accessor size check completely misses (only catches separate TRS
  `scale`, not baked matrices). `AmbientCreature.tsx` now computes the
  model's actual rendered bounding box after load (`new
  THREE.Box3().setFromObject(gltf.scene)`, which resolves the full transform
  chain automatically) and derives scale from a `targetWidth` in world
  units, instead of a guessed flat multiplier.
- Rats are grounded via the same bounding-box technique (offset so their
  *feet*, not their authored pivot, land on the target line) — see
  `GltfRat.tsx`.
- `dragon.glb` requires the deprecated `KHR_materials_pbrSpecularGlossiness`
  extension, which modern `GLTFLoader` doesn't support (warns, falls back to
  default materials). Confirmed via inspecting the GLB's
  `extensionsUsed`/`extensionsRequired`. **Not fixed** — needs re-exporting
  the model with standard metallic-roughness PBR materials (a Blender job).
  `rat.glb` uses `KHR_materials_specular` + `KHR_materials_clearcoat`, both
  supported, no issue there.
