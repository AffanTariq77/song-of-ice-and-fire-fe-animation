/**
 * One lighting rig for every creature scene.
 *
 * These are near-black animals on a near-black site (--midnight-950 is #05070d), so a
 * warm key light alone leaves them as smudges. The rim light is what makes them
 * legible: a cool back-light in the site's own frost tone catches the edge of a wing
 * and the curve of a back, separating the animal from the page without lifting its
 * body colour into something that stops looking like a crow.
 *
 * Tuned by measuring, not by eye. Contrast of the rendered bird against #05070d,
 * sweeping rim intensity:
 *
 *   rim   body (p75)   edges (p95)   overall (mean)
 *   2.6      1.22          1.71          1.22
 *   8.0      1.24          3.02          1.35
 *  12.0      1.24          3.99          1.45
 *  16.0      1.30          4.99          1.58
 *
 * The body barely moves while the edges climb, which is the whole point: the shape
 * reads, the plumage stays black. Past about 12 the highlight starts looking like a
 * light source rather than a reflection, so this sits just under that.
 */
export function CreatureLights() {
  return (
    <>
      <ambientLight intensity={1.3} />
      {/* Key: warm torchlight, matching the site's gold. */}
      <directionalLight position={[3, 5, 4]} intensity={1.7} color="#f2c14d" />
      {/* Rim: cool, from behind and above, doing the separation work. */}
      <directionalLight position={[-5, 4, -7]} intensity={10} color="#9db4cf" />
      {/* Bounce: a faint cold fill so undersides are not pure black. */}
      <directionalLight position={[0, -4, 3]} intensity={0.85} color="#3a5170" />
    </>
  );
}
