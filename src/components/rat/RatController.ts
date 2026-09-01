import * as THREE from 'three';

/**
 * The rat's locomotion, as a small state machine over the twelve clips the model
 * actually ships with.
 *
 * The previous version played one run clip at a fixed rate while lerping the rat from
 * one side of the viewport to the other. Two things about that read as cartoon rather
 * than animal. The first is foot sliding: the clip's cadence had no relationship to the
 * ground speed, so the legs cycled at whatever rate the author baked while the body
 * travelled at whatever rate the lerp dictated. The second is that nothing ever started
 * or stopped: a rat appeared at full gallop, held exactly that gallop across the
 * screen, and vanished.
 *
 * So: position and velocity are integrated rather than interpolated, playback rate is
 * derived from ground speed against the speed each clip itself implies, and the model's
 * start/stop transition clips are used for what they were authored for.
 *
 * Speeds are expressed as a multiple of the run clip's own speed, which is the only
 * unit in which they are checkable: a rat set to 1 gallops at exactly the cadence the
 * animator drew, and a third of that lands in the walk.
 */

const CLIPS = {
  idle: ['Mammals|idle_A1', 'Mammals|idle_A2', 'Mammals|idle_A3'],
  walk: ['Mammals|walk_A1', 'Mammals|walk_A2', 'Mammals|walk_A3'],
  run: ['Mammals|run_A1', 'Mammals|run_A2'],
  walkStart: 'Mammals|walk_start_A',
  walkEnd: 'Mammals|walk_end_A',
  runStart: 'Mammals|run_start_A',
  runEnd: 'Mammals|run_end_A',
} as const;

/**
 * The ground speed each clip implies at playback rate 1, in the model's own units.
 *
 * Measured, not guessed. The clips are in place, the body stays put and the ground is
 * imagined to move under it, so while a foot is planted it slides backward relative to
 * the body by exactly the distance the animal would have travelled forward. Sampling
 * the skeleton through a cycle, finding the stretch where a hind foot is on the floor
 * and dividing its backward travel by that stretch's duration gives these two numbers.
 * All four feet agreed to within a few percent on the walk; the hind feet, which do the
 * propelling, agreed to within a few percent on the run.
 *
 * Everything else about the gait follows from them: playback rate is ground speed over
 * the clip's own speed, which is what puts the feet on the floor instead of skating.
 */
const WALK_CLIP_SPEED = 2.3;
const RUN_CLIP_SPEED = 6.5;

/** Clamp on playback rate. Beyond this a gait reads as a fast-forward, not as effort. */
const RATE_MIN = 0.62;
const RATE_MAX = 1.85;

export type Gait = 'idle' | 'walk' | 'run';

/**
 * How much of the viewport counts as "the middle" when a startled rat picks a way out.
 * Inside this band it doubles back the way it came; outside it, it carries on to
 * whichever edge it is already nearer.
 */
export const MIDDLE_BAND = 0.4;

/**
 * Which way a startled rat goes.
 *
 * Near an edge it takes that edge, because an animal runs for the exit it can see. Out
 * in the middle, with both exits equally far, it doubles back along the route it
 * already knows is clear, which is also what makes the reversal legible: the rat you
 * just spooked turns around and goes back the way it came.
 *
 * Pure, and separated from the component, because it is the one piece of this whose
 * behaviour is worth asserting rather than eyeballing.
 */
export function fleeDirection(x: number, halfWidth: number, travelling: 1 | -1): 1 | -1 {
  if (x > halfWidth * MIDDLE_BAND) return 1;
  if (x < -halfWidth * MIDDLE_BAND) return -1;
  return travelling === 1 ? -1 : 1;
}
type Mode = 'travel' | 'sniff' | 'startle' | 'flee';

export type RatOptions = {
  /** Scale the model is rendered at, which converts the clip speeds above into world units. */
  scale: number;
  /** Cruising speed as a multiple of the speed the run clip was authored at. About a third of it is a walk. */
  pace: number;
  /** Bolting speed, same units. */
  bolt: number;
  /** Chance this crossing includes a stop to sniff at something. */
  sniffChance: number;
  random: () => number;
};

function approach(value: number, target: number, maxStep: number) {
  const delta = target - value;
  if (Math.abs(delta) <= maxStep) return target;
  return value + Math.sign(delta) * maxStep;
}

export class RatController {
  readonly mixer: THREE.AnimationMixer;

  /** Along the corridor, world units. */
  x = 0;
  /** Signed, world units per second. */
  velocity = 0;
  /** Rendered heading. Lags `direction` so a reversal is a turn rather than a snap. */
  yaw: number;
  /** Which way it is trying to go. */
  direction: 1 | -1;

  private readonly options: RatOptions;
  private readonly actions = new Map<string, THREE.AnimationAction>();
  /** World units per second at playback rate 1. */
  private readonly walkSpeed: number;
  private readonly runSpeed: number;

  private gait: Gait = 'idle';
  private current: THREE.AnimationAction | null = null;
  /** Loop to fall into when the transition clip now playing finishes. */
  private pending: Gait | null = null;
  private mode: Mode = 'travel';
  private timer = 0;
  private sniffAt: number | null;
  private travelled = 0;

  constructor(scene: THREE.Object3D, clips: THREE.AnimationClip[], direction: 1 | -1, options: RatOptions) {
    this.options = options;
    this.direction = direction;
    this.yaw = direction === 1 ? Math.PI / 2 : -Math.PI / 2;
    this.mixer = new THREE.AnimationMixer(scene);

    for (const clip of clips) {
      this.actions.set(clip.name, this.mixer.clipAction(clip));
    }

    this.walkSpeed = WALK_CLIP_SPEED * options.scale;
    this.runSpeed = RUN_CLIP_SPEED * options.scale;

    // A rat that stops once per crossing reads as curious. One that stops every time
    // reads as a scripted loop, which is what the fixed pause chance was for.
    this.sniffAt = options.random() < options.sniffChance ? 0.3 + options.random() * 0.45 : null;

    this.mixer.addEventListener('finished', this.onFinished);
    // Entering already moving: it has been running since before it came on screen.
    this.velocity = this.cruiseSpeed * direction;
    this.enter(this.velocity === 0 ? 'idle' : 'run', false);
  }

  private get cruiseSpeed() {
    return this.options.pace * this.runSpeed;
  }

  private get fleeSpeed() {
    return this.options.bolt * this.runSpeed;
  }

  private onFinished = () => {
    if (this.pending) {
      const gait = this.pending;
      this.pending = null;
      this.enter(gait, true);
    }
  };

  private pick(names: readonly string[]) {
    return names[Math.floor(this.options.random() * names.length)];
  }

  /** Crossfade to a looping clip for `gait`. */
  private enter(gait: Gait, fade: boolean) {
    const action = this.actions.get(this.pick(CLIPS[gait]));
    if (!action) return;
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = false;
    action.reset().setEffectiveWeight(1).play();
    if (fade && this.current && this.current !== action) {
      action.fadeIn(0.2);
      this.current.fadeOut(0.2);
    }
    this.current = action;
  }

  /** Play a transition clip once, then fall into `then`. */
  private transition(name: string, then: Gait) {
    const action = this.actions.get(name);
    if (!action) {
      this.enter(then, true);
      return;
    }
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.reset().setEffectiveWeight(1).fadeIn(0.12).play();
    this.current?.fadeOut(0.12);
    this.current = action;
    this.pending = then;
  }

  private setGait(next: Gait) {
    if (next === this.gait) return;
    const previous = this.gait;
    this.gait = next;

    if (previous === 'idle' && next === 'walk') this.transition(CLIPS.walkStart, next);
    else if (previous === 'idle' && next === 'run') this.transition(CLIPS.runStart, next);
    else if (previous === 'walk' && next === 'idle') this.transition(CLIPS.walkEnd, next);
    else if (previous === 'run' && next === 'idle') this.transition(CLIPS.runEnd, next);
    else {
      this.pending = null;
      this.enter(next, true);
    }
  }

  /**
   * Startle. `fleeDirection` is decided by the caller, which is the only thing that
   * knows where this rat is relative to the edges of the strip.
   */
  startle(fleeDirection: 1 | -1) {
    if (this.mode === 'flee' || this.mode === 'startle') return;
    this.mode = 'startle';
    this.direction = fleeDirection;
    // A beat of nothing before it goes. Animals freeze before they run, and without it
    // a reversal looks like the sprite was simply reassigned a new velocity.
    this.timer = 0.11;
    this.sniffAt = null;
  }

  get fleeing() {
    return this.mode === 'flee' || this.mode === 'startle';
  }

  /** For diagnostics: which clip family is playing, and how fast. */
  get gaitName(): Gait {
    return this.gait;
  }

  get playbackRate() {
    return this.mixer.timeScale;
  }

  update(delta: number, span: number) {
    this.timer -= delta;

    if (this.mode === 'startle' && this.timer <= 0) this.mode = 'flee';
    if (this.mode === 'sniff' && this.timer <= 0) this.mode = 'travel';

    if (this.mode === 'travel' && this.sniffAt !== null) {
      this.travelled = Math.min(1, (this.x + span / 2) / span);
      const progress = this.direction === 1 ? this.travelled : 1 - this.travelled;
      if (progress >= this.sniffAt) {
        this.sniffAt = null;
        this.mode = 'sniff';
        this.timer = 1.1 + this.options.random() * 1.6;
      }
    }

    // Desired velocity, and how hard it is willing to change it. A startled animal
    // accelerates several times harder than a cruising one, which is most of what
    // separates a bolt from a change of pace.
    let wanted: number;
    let accel: number;
    if (this.mode === 'sniff' || this.mode === 'startle') {
      wanted = 0;
      accel = 5 * this.runSpeed;
    } else if (this.mode === 'flee') {
      wanted = this.fleeSpeed * this.direction;
      accel = 6 * this.runSpeed;
    } else {
      wanted = this.cruiseSpeed * this.direction;
      accel = 1.8 * this.runSpeed;
    }

    this.velocity = approach(this.velocity, wanted, accel * delta);
    this.x += this.velocity * delta;

    // Turn toward where it is going, not instantly. Only once it is actually moving
    // that way, so a rat reversing decelerates facing forward and pivots as it picks up
    // speed in the new direction, which is what a real reversal looks like.
    const heading = this.velocity === 0 ? this.direction : Math.sign(this.velocity);
    const target = heading === 1 ? Math.PI / 2 : -Math.PI / 2;
    let difference = target - this.yaw;
    while (difference > Math.PI) difference -= Math.PI * 2;
    while (difference < -Math.PI) difference += Math.PI * 2;
    this.yaw += Math.sign(difference) * Math.min(Math.abs(difference), 11 * delta);

    // Gait from ground speed, with hysteresis so a rat hovering at a threshold does not
    // flutter between two clips.
    const speed = Math.abs(this.velocity);
    let gait: Gait = this.gait;
    if (speed < this.walkSpeed * 0.2) gait = 'idle';
    else if (gait === 'run' ? speed < this.walkSpeed * 1.35 : speed < this.walkSpeed * 1.7) gait = 'walk';
    else gait = 'run';
    this.setGait(gait);

    // Playback rate: ground speed over the speed this clip would carry the animal at
    // rate 1. This is the line that puts the feet on the floor.
    const reference = this.gait === 'run' ? this.runSpeed : this.walkSpeed;
    this.mixer.timeScale =
      this.gait === 'idle' ? 1 : Math.min(RATE_MAX, Math.max(RATE_MIN, speed / reference));
    this.mixer.update(delta);
  }

  dispose() {
    this.mixer.removeEventListener('finished', this.onFinished);
    this.mixer.stopAllAction();
  }
}
