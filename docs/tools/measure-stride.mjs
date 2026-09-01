/**
 * Measures, from the clips themselves, how fast each gait would carry the animal.
 *
 * The animation is in place: the body stays put and the ground is imagined to move
 * under it. So while a foot is planted it slides backward relative to the body by
 * exactly the distance the animal would have travelled forward. Sample the skeleton
 * through a cycle, find the stretch where a foot is on the floor, and the backward
 * travel over that stretch divided by its duration is the speed that clip implies.
 *
 * That number replaces the two guessed stride constants: get it wrong and the legs
 * cycle at a rate unrelated to the ground speed, which is the foot-sliding that reads
 * as cartoon no matter how good the model is.
 */
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const buffer = fs.readFileSync(process.env.GLB ?? '/root/rat-nomat.glb');
const loader = new GLTFLoader();
const gltf = await new Promise((res, rej) =>
  loader.parse(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength), '', res, rej),
);

const scene = gltf.scene;
scene.updateMatrixWorld(true);

const FEET = ['Leg_FootL002_024', 'Leg_FootR002_035', 'Fore_HandL001_087', 'Fore_HandR001_0104'];
const bones = new Map();
scene.traverse((o) => { if (FEET.includes(o.name)) bones.set(o.name, o); });
console.log('found bones:', [...bones.keys()].join(', ') || 'NONE');
if (bones.size === 0) { scene.traverse(o => { if (/Foot|Hand/i.test(o.name)) console.log(' candidate', o.name); }); process.exit(1); }

const SAMPLES = 240;
const world = new THREE.Vector3();

function measure(clipName) {
  const clip = gltf.animations.find((a) => a.name === clipName);
  if (!clip) return null;
  const mixer = new THREE.AnimationMixer(scene);
  const action = mixer.clipAction(clip);
  action.play();

  const track = new Map([...bones.keys()].map((n) => [n, []]));
  const step = clip.duration / SAMPLES;
  mixer.setTime(0);
  for (let i = 0; i <= SAMPLES; i++) {
    mixer.setTime(i * step);
    scene.updateMatrixWorld(true);
    for (const [name, bone] of bones) {
      bone.getWorldPosition(world);
      track.get(name).push([world.x, world.y, world.z]);
    }
  }
  mixer.stopAllAction();

  // Which horizontal axis the animal travels along: the one the feet swing furthest on.
  let best = null;
  for (const [name, pts] of track) {
    const xs = pts.map((p) => p[0]);
    const zs = pts.map((p) => p[2]);
    const spanX = Math.max(...xs) - Math.min(...xs);
    const spanZ = Math.max(...zs) - Math.min(...zs);
    const axis = spanX >= spanZ ? 0 : 2;
    const ys = pts.map((p) => p[1]);
    const floor = Math.min(...ys);
    const ceiling = Math.max(...ys);
    // Planted = in the lowest fifth of the foot's vertical range.
    const threshold = floor + (ceiling - floor) * 0.2;

    // Longest run of consecutive planted samples, and the distance covered in it.
    let bestRun = { length: 0, travel: 0 };
    let start = -1;
    for (let i = 0; i <= SAMPLES + 1; i++) {
      const planted = i <= SAMPLES && ys[i] <= threshold;
      if (planted && start < 0) start = i;
      if (!planted && start >= 0) {
        const length = i - start;
        const travel = Math.abs(pts[i - 1][axis] - pts[start][axis]);
        if (length > bestRun.length) bestRun = { length, travel };
        start = -1;
      }
    }
    const contact = (bestRun.length / SAMPLES) * clip.duration;
    const speed = contact > 0 ? bestRun.travel / contact : 0;
    const row = { name, axis: axis === 0 ? 'x' : 'z', contact: +contact.toFixed(3), travel: +bestRun.travel.toFixed(3), speed: +speed.toFixed(3) };
    console.log('   ', JSON.stringify(row));
    // Hind feet carry the propulsion and give the cleanest read.
    if (name.startsWith('Leg_Foot') && (!best || speed > best.speed)) best = row;
  }
  return { clip: clipName, duration: clip.duration, ...best };
}

for (const name of ['Mammals|walk_A1', 'Mammals|walk_A2', 'Mammals|run_A1', 'Mammals|run_A2']) {
  console.log('\n' + name);
  const r = measure(name);
  if (r) console.log('  => implied ground speed', r.speed.toFixed(3), 'model units/s  (clip', r.duration.toFixed(2) + 's)');
}
