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
 *
 * The rim is turned right down in the footer. That scene has a modelled corridor with
 * real torches doing the modelling already, and a directional light strong enough to
 * pick out a crow's wing turns a large flat stone ledge into a pale blue slab.
 */
export function CreatureLights({
  rim = 10,
  ambient = 1.3,
  keyLight = 1.7,
  bounce = 0.85,
  creatureLayer = 0,
}: { rim?: number; ambient?: number; keyLight?: number; bounce?: number; creatureLayer?: number } = {}) {
  // The cool lights can be confined to a layer, so they reach the animals and nothing
  // else. In the footer that is the difference between a corridor and a corridor with
  // a blue stripe down every pier: the rim comes from behind and to one side, which is
  // exactly the angle a pier's return face presents, so the one surface in the scene it
  // lights properly is the one it should not touch at all. Only the creatures opt into
  // the layer (see GltfRat), so a scene that leaves this at 0 is unaffected.
  const mask = 1 << creatureLayer;
  return (
    <>
      <ambientLight intensity={ambient} />
      {/* Key: warm torchlight, matching the site's gold. */}
      <directionalLight position={[3, 5, 4]} intensity={keyLight} color="#f2c14d" />
      {/* Rim: cool, from behind and above, doing the separation work. */}
      <directionalLight position={[-5, 4, -7]} intensity={rim} color="#9db4cf" layers-mask={mask} />
      {/* Bounce: a faint cold fill so undersides are not pure black. */}
      <directionalLight position={[0, -4, 3]} intensity={bounce} color="#3a5170" layers-mask={mask} />
    </>
  );
}
