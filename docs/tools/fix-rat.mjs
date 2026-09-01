/**
 * Repairs and slims the black rat asset.
 *
 * Two problems, one of which is why it reads like plastic. The exporter left every
 * material at metallicFactor 1 over a metallic-roughness texture whose blue channel
 * averages 109, so the fur renders as a 43%-metal surface: a dielectric animal shaded
 * as if it were made of dull metal, which is exactly the flat, waxy, cartoon look.
 * The same texture's green channel averages 104, i.e. roughness 0.41, glossy vinyl,
 * where real fur sits around 0.7 to 0.9.
 *
 * The other is size. Seven 2048px PNGs is 24MB of texture for an animal that is forty
 * pixels tall in the footer, and it was very likely the "Context Lost" in the earlier
 * investigation. Resized and re-encoded, the file drops from 33MB to about one.
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, quantize, resample, textureCompress } from '@gltf-transform/functions';
import sharp from 'sharp';

const SRC = process.env.SRC ?? 'original.glb';
const DST = process.env.DST ?? 'rat.glb';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(SRC);
const root = doc.getRoot();

// --- 1. Fur is not metal ---------------------------------------------------------
for (const material of root.listMaterials()) {
  material.setMetallicFactor(0);
}

// --- 2. Rewrite the shared metallic-roughness map ---------------------------------
// Blue (metal) to zero so nothing downstream can reintroduce it, and green (roughness)
// remapped into the range fur actually occupies, keeping the texture's own variation:
// r' = 0.62 + 0.34 r, which puts the coat between 0.62 and 0.96, where fur sits.
const seen = new Set();
for (const material of root.listMaterials()) {
  const texture = material.getMetallicRoughnessTexture();
  if (!texture || seen.has(texture)) continue;
  seen.add(texture);

  const image = Buffer.from(texture.getImage());
  const { data, info } = await sharp(image).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    data[i + 1] = Math.round(255 * (0.62 + 0.34 * (data[i + 1] / 255)));
    data[i + 2] = 0;
  }
  const out = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toBuffer();
  texture.setImage(out).setMimeType('image/png');
  console.log('remapped roughness on', info.width + 'x' + info.height);
}

// --- 3. Fur is not varnished -------------------------------------------------------
// KHR_materials_specular at 1 gives the coat a full dielectric highlight, and under a
// bright warm key that spreads into a white sheen across the whole back, the animal
// reads as wet plastic. Guard hairs do glint, but faintly. The eyes keep theirs, and
// their clearcoat, because eyes genuinely are wet.
for (const material of root.listMaterials()) {
  const specular = material.getExtension('KHR_materials_specular');
  if (!specular || material.getName().includes('eyes')) continue;
  specular.setSpecularFactor(material.getName().includes('fur') ? 0.22 : 0.3);
}

// --- 4. Fur alpha ------------------------------------------------------------------
// Left where the author set it. Lowering the cutoff to fatten the fur cards was tried
// and is worse: resampling the texture already softens the alpha, so a lower threshold
// on a blurred mask inflates every card until the ears, eye and snout disappear into a
// fuzzy mass. The card edges are the silhouette; they need the hard threshold.

await doc.transform(
  dedup(),
  prune({ keepAttributes: false, keepLeaves: false }),
  // Most of the animation payload is scale tracks that never leave 1,1,1 and rotation
  // tracks sampled at a fixed rate through stretches where nothing moves.
  resample({ tolerance: 1e-4 }),
  // Positions are left alone: quantising them on a skinned mesh introduces a node
  // scale that has to survive every clip, and the saving is not worth the class of bug
  // it invites. Everything else quantises safely.
  quantize({ pattern: /^(NORMAL|TANGENT|TEXCOORD|COLOR|WEIGHTS)(_\d+)?$/ }),
  // 1024 is already twenty-five times the size this animal is ever drawn at. WebP
  // rather than PNG because the alpha survives it and the fur mask is the only channel
  // that would notice.
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 86 }),
);

await io.write(DST, doc);
console.log('written', DST);
