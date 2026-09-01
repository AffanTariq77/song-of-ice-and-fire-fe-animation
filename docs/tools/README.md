# Asset tools

One-off scripts, run by hand, not part of the build. They have their own dependencies
(`@gltf-transform/core`, `@gltf-transform/extensions`, `@gltf-transform/functions`,
`sharp`, `three`); install them in a scratch directory rather than adding them here ,
this app builds in seconds precisely because it has nothing in it.

```
mkdir /tmp/gltftools && cd /tmp/gltftools && npm init -y
npm i @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions sharp three
```

## `fix-rat.mjs`

Produces the `public/models/rat.glb` that ships, from the Sketchfab original.

```
SRC=/path/to/original.glb DST=public/models/rat.glb node fix-rat.mjs
```

The original is exported with every material at `metallicFactor: 1` over a
metallic-roughness texture whose metal channel averages 109, so the fur renders as a
43%-metal surface, a dielectric animal shaded as dull metal, which is most of why it
read as plastic. Its roughness channel averages 0.41, vinyl rather than fur, and
`KHR_materials_specular` sits at 1, which under a warm key spreads a white sheen across
the whole back. The script zeroes the metal, remaps roughness into 0.62–0.96, drops the
coat's specular to 0.22, and re-encodes seven 2048px PNGs (24MB) as 1024px WebP. 33.6MB
to 6.1MB, with the twelve animation clips intact.

Re-run it against the **original**, never against the shipped file: the roughness remap
is not idempotent.

## `measure-stride.mjs`

Prints the ground speed each locomotion clip implies, which is where the two constants
at the top of `src/components/rat/RatController.ts` come from.

```
node measure-stride.mjs          # expects a texture-stripped copy at /root/rat-nomat.glb
```

The clips are in place: the body stays put and the ground is imagined to move under it.
So while a foot is planted it slides backward relative to the body by exactly the
distance the animal would have travelled forward. The script samples the skeleton
through a cycle, finds the stretch where each foot is in the lowest fifth of its
vertical range, and divides that foot's backward travel by the stretch's duration. All
four feet agree to within a few percent on the walk; the hind feet, which do the
propelling, agree on the run.

Strip textures first, three's `GLTFLoader.parse` will try to decode images and there is
no DOM in Node:

```js
for (const m of doc.getRoot().listMaterials()) {
  m.setBaseColorTexture(null); m.setNormalTexture(null); m.setMetallicRoughnessTexture(null);
  for (const e of m.listExtensions()) m.setExtension(e.extensionName, null);
}
for (const t of doc.getRoot().listTextures()) t.dispose();
```
