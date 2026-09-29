import type { LevelDef, Tuning } from "../types";
import { WOLF } from "../types";
import { dist, nearestOnSegment, norm, segmentsIntersect } from "./geom";
import type { FenceSystem } from "./FenceSystem";
import type { ObstacleGrid } from "./ObstacleGrid";
import type { SheepSim } from "./SheepSim";

export type Wolf = {
  id: number;
  state: number;
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  entryKey: string;
  entryX: number;
  entryY: number;
  target: number;
  tutorial: boolean;
  warnLeft: number;
  windupLeft: number;
  sprintLeft: number;
  sprintDx: number;
  sprintDy: number;
  cooldown: number;
  hits: number;
  stunLeft: number;
  stay: number;
  stuck: number;
  stuckX: number;
  stuckY: number;
  carried: number;
  patrolAngle: number;
  retarget: number;
  firstSprint: boolean;
  slowMoArmed: boolean;
};

const NEAR = {
  fenceId: 0,
  ax: 0,
  ay: 0,
  bx: 0,
  by: 0,
  qx: 0,
  qy: 0,
  d: 0,
  nx: 0,
  ny: 0,
};
const HIT = { x: 0, y: 0, t: 0, u: 0 };

export class WolfPack {
  wolves: Wolf[] = [];
  private nextId = 1;
  private spawned = new Set<number>();
  tuning: Tuning;
  width: number;
  height: number;

  constructor(width: number, height: number, tuning: Tuning) {
    this.width = width;
    this.height = height;
    this.tuning = tuning;
  }

  reset(): void {
    this.wolves = [];
    this.nextId = 1;
    this.spawned.clear();
  }

  schedule(levelTime: number, level: LevelDef): Wolf[] {
    const born: Wolf[] = [];
    for (let i = 0; i < level.wolves.length; i++) {
      if (this.spawned.has(i)) continue;
      const spec = level.wolves[i];
      if (levelTime + 1e-6 >= spec.t) {
        this.spawned.add(i);
        const entry = level.entries[spec.entry] ?? { x: this.width - 8, y: this.height * 0.4 };
        const wolf: Wolf = {
          id: this.nextId++,
          state: WOLF.WARN,
          x: entry.x,
          y: entry.y,
          px: entry.x,
          py: entry.y,
          vx: 0,
          vy: 0,
          entryKey: spec.entry,
          entryX: entry.x,
          entryY: entry.y,
          target: -1,
          tutorial: !!spec.tutorial,
          warnLeft: this.tuning.wolf.warnDuration,
          windupLeft: 0,
          sprintLeft: 0,
          sprintDx: 0,
          sprintDy: 0,
          cooldown: 0,
          hits: 0,
          stunLeft: 0,
          stay: 0,
          stuck: 0,
          stuckX: entry.x,
          stuckY: entry.y,
          carried: -1,
          patrolAngle: 0,
          retarget: 0,
          firstSprint: !!spec.tutorial,
          slowMoArmed: !!spec.tutorial,
        };
        this.wolves.push(wolf);
        born.push(wolf);
      }
    }
    return born;
  }

  step(
    dt: number,
    sheep: SheepSim,
    fences: FenceSystem,
    obstacles: ObstacleGrid,
    pen: { gx: number; gy: number; g2x: number; g2y: number },
  ): { blocked: Wolf[]; grabbed: Wolf[]; lost: number[]; rescued: number[]; windup: Wolf[] } {
    const blocked: Wolf[] = [];
    const grabbed: Wolf[] = [];
    const lost: number[] = [];
    const rescued: number[] = [];
    const windup: Wolf[] = [];
    const t = this.tuning.wolf;

    sheep.grid.rebuild(sheep.x, sheep.y, (i) => sheep.isFree(i), sheep.n);

    for (const w of this.wolves) {
      if (w.state === WOLF.NONE) continue;
      w.px = w.x;
      w.py = w.y;
      if (w.cooldown > 0) w.cooldown -= dt;

      if (w.state === WOLF.WARN) {
        w.warnLeft -= dt;
        if (w.warnLeft <= 0) {
          w.state = WOLF.PATROL;
        }
        continue;
      }

      if (w.state !== WOLF.RETREAT) {
        w.stay += dt;
        if (w.stay >= t.stayMaxTime && w.state !== WOLF.CARRY) {
          this.beginRetreat(w);
        }
      }

      if (w.state === WOLF.BLOCKED) {
        w.stunLeft -= dt;
        w.vx = 0;
        w.vy = 0;
        if (w.stunLeft <= 0) {
          if (w.hits >= t.maxHits || (w.tutorial && w.hits >= 1)) this.beginRetreat(w);
          else w.state = WOLF.PATROL;
        }
        continue;
      }

      if (w.state === WOLF.WINDUP) {
        w.windupLeft -= dt;
        w.vx = 0;
        w.vy = 0;
        if (w.windupLeft <= 0) {
          w.state = WOLF.SPRINT;
          w.sprintLeft = t.sprintMaxTime;
        }
        continue;
      }

      this.think(w, dt, sheep, fences, pen);
      this.integrate(w, dt, obstacles);
      const hit = this.collideFences(w, fences, t.radius);
      if (hit) {
        if (w.state === WOLF.CARRY && w.carried >= 0) {
          const nx = hit.nx;
          const ny = hit.ny;
          sheep.release(w.carried, w.x, w.y, nx, ny);
          rescued.push(w.carried);
          w.carried = -1;
        }
        fences.damage(hit.fenceId, t.hitCost);
        w.state = WOLF.BLOCKED;
        w.stunLeft = w.state === WOLF.SPRINT || w.state === WOLF.CARRY ? t.stunSprint : t.stunWalk;
        // After assignment state is BLOCKED, use previous motion to pick stun.
        w.stunLeft = Math.hypot(w.vx, w.vy) > t.approachSpeed + 10 ? t.stunSprint : t.stunWalk;
        w.hits += 1;
        w.vx = 0;
        w.vy = 0;
        blocked.push(w);
        continue;
      }

      if (w.state === WOLF.SPRINT && w.target >= 0 && sheep.isFree(w.target)) {
        const d = dist(w.x, w.y, sheep.x[w.target], sheep.y[w.target]);
        if (w.firstSprint && d < t.tutorialMissDist) {
          w.firstSprint = false;
          w.state = WOLF.PATROL;
          w.cooldown = t.sprintCooldown;
          w.vx *= 0.2;
          w.vy *= 0.2;
          continue;
        }
        if (d < t.grabRadius) {
          sheep.markCarried(w.target);
          w.carried = w.target;
          w.state = WOLF.CARRY;
          grabbed.push(w);
        }
      }

      if (w.state === WOLF.CARRY && w.carried >= 0) {
        sheep.x[w.carried] = w.x;
        sheep.y[w.carried] = w.y;
        sheep.px[w.carried] = w.px;
        sheep.py[w.carried] = w.py;
      }

      if (this.offMap(w) && (w.state === WOLF.RETREAT || w.state === WOLF.CARRY)) {
        if (w.carried >= 0) {
          sheep.markLost(w.carried);
          lost.push(w.carried);
          w.carried = -1;
        }
        w.state = WOLF.NONE;
      }

      const moved = dist(w.x, w.y, w.stuckX, w.stuckY);
      if (moved < t.stuckDist) w.stuck += dt;
      else {
        w.stuck = 0;
        w.stuckX = w.x;
        w.stuckY = w.y;
      }
      if (w.stuck >= t.stuckTime && w.state !== WOLF.RETREAT && w.state !== WOLF.WARN) {
        this.beginRetreat(w);
      }
    }

    this.wolves = this.wolves.filter((w) => w.state !== WOLF.NONE);
    return { blocked, grabbed, lost, rescued, windup };
  }

  activeDisplay(): { x: number; y: number; active: boolean }[] {
    return this.wolves
      .filter((w) => w.state !== WOLF.WARN && w.state !== WOLF.NONE)
      .map((w) => ({ x: w.x, y: w.y, active: true }));
  }

  private beginRetreat(w: Wolf): void {
    w.state = WOLF.RETREAT;
    w.target = -1;
  }

  private think(
    w: Wolf,
    dt: number,
    sheep: SheepSim,
    fences: FenceSystem,
    pen: { gx: number; gy: number; g2x: number; g2y: number },
  ): void {
    const t = this.tuning.wolf;
    if (w.state === WOLF.SPRINT) {
      w.sprintLeft -= dt;
      const sp = t.sprintSpeed;
      w.vx = w.sprintDx * sp;
      w.vy = w.sprintDy * sp;
      if (w.sprintLeft <= 0) {
        w.state = WOLF.PATROL;
        w.cooldown = t.sprintCooldown;
      }
      return;
    }
    if (w.state === WOLF.CARRY) {
      const [dx, dy] = this.nearestEdge(w.x, w.y);
      w.vx = dx * t.carrySpeed;
      w.vy = dy * t.carrySpeed;
      return;
    }
    if (w.state === WOLF.RETREAT) {
      const [dx, dy] = norm(w.entryX - w.x, w.entryY - w.y);
      w.vx = dx * t.retreatSpeed;
      w.vy = dy * t.retreatSpeed;
      return;
    }

    w.retarget -= dt;
    if (w.retarget <= 0 || w.target < 0 || !sheep.isFree(w.target)) {
      w.retarget = 0.5;
      w.target = this.pickTarget(w, sheep, pen);
      if (w.target < 0 && w.state === WOLF.APPROACH) w.state = WOLF.PATROL;
    }

    if (w.target >= 0 && (w.state === WOLF.PATROL || w.state === WOLF.APPROACH)) {
      w.state = WOLF.APPROACH;
      const tx = sheep.x[w.target];
      const ty = sheep.y[w.target];
      let aimX = tx;
      let aimY = ty;
      if (this.lineBlocked(w.x, w.y, tx, ty, fences)) {
        const detour = this.detour(w.x, w.y, tx, ty, fences);
        aimX = detour.x;
        aimY = detour.y;
      }
      const [dx, dy] = norm(aimX - w.x, aimY - w.y);
      w.vx = dx * t.approachSpeed;
      w.vy = dy * t.approachSpeed;
      const d = dist(w.x, w.y, tx, ty);
      if (
        d <= t.sprintTriggerRange &&
        w.cooldown <= 0 &&
        !this.lineBlocked(w.x, w.y, tx, ty, fences)
      ) {
        w.state = WOLF.WINDUP;
        w.windupLeft = w.tutorial ? Math.max(t.sprintWindup, 0.8) : t.sprintWindup;
        const [sx, sy] = norm(tx - w.x, ty - w.y);
        w.sprintDx = sx;
        w.sprintDy = sy;
      }
      return;
    }

    const { cx, cy, radius } = this.flockOrbit(sheep);
    const desiredR = radius + t.patrolOrbitPad;
    w.patrolAngle += (t.patrolSpeed / Math.max(80, desiredR)) * dt;
    const ox = cx + Math.cos(w.patrolAngle) * desiredR;
    const oy = cy + Math.sin(w.patrolAngle) * desiredR;
    const [dx, dy] = norm(ox - w.x, oy - w.y);
    w.vx = dx * t.patrolSpeed;
    w.vy = dy * t.patrolSpeed;
  }

  private integrate(w: Wolf, dt: number, obstacles: ObstacleGrid): void {
    const obs = { x: 0, y: 0 };
    obstacles.sampleForce(w.x, w.y, 28, 80, obs);
    w.vx += obs.x * dt;
    w.vy += obs.y * dt;
    w.x += w.vx * dt;
    w.y += w.vy * dt;
    const resolved = obstacles.resolvePoint(w.x, w.y, this.tuning.wolf.radius);
    w.x = resolved.x;
    w.y = resolved.y;
  }

  private collideFences(
    w: Wolf,
    fences: FenceSystem,
    radius: number,
  ): { fenceId: number; nx: number; ny: number } | null {
    if (fences.nearest(w.x, w.y, w.px, w.py, NEAR) && NEAR.d < radius) {
      w.x = NEAR.qx + NEAR.nx * (radius + 0.5);
      w.y = NEAR.qy + NEAR.ny * (radius + 0.5);
      return { fenceId: NEAR.fenceId, nx: NEAR.nx, ny: NEAR.ny };
    }
    let found: { fenceId: number; nx: number; ny: number } | null = null;
    fences.forEachSegment((ax, ay, bx, by, fid) => {
      if (found) return;
      if (segmentsIntersect(w.px, w.py, w.x, w.y, ax, ay, bx, by, HIT)) {
        nearestOnSegment(w.x, w.y, ax, ay, bx, by, {
          x: 0,
          y: 0,
          t: 0,
          d: 0,
        });
        const nx = w.px - HIT.x;
        const ny = w.py - HIT.y;
        const nl = Math.hypot(nx, ny) || 1;
        w.x = HIT.x + (nx / nl) * (radius + 0.5);
        w.y = HIT.y + (ny / nl) * (radius + 0.5);
        found = { fenceId: fid, nx: nx / nl, ny: ny / nl };
      }
    });
    return found;
  }

  private pickTarget(w: Wolf, sheep: SheepSim, pen: { gx: number; gy: number; g2x: number; g2y: number }): number {
    const t = this.tuning.wolf;
    const gx = (pen.gx + pen.g2x) * 0.5;
    const gy = (pen.gy + pen.g2y) * 0.5;
    let best = -1;
    let bestScore = -1e9;
    for (let i = 0; i < sheep.n; i++) {
      if (!sheep.isFree(i)) continue;
      if (dist(sheep.x[i], sheep.y[i], gx, gy) < t.targetSafeZone) continue;
      const d = dist(w.x, w.y, sheep.x[i], sheep.y[i]);
      if (d > t.targetMaxRange) continue;
      const iso = sheep.neighborsWithin(i, t.targetIsoRadius);
      if (iso > t.targetMaxNeighbors) continue;
      const isoScore = (t.targetMaxNeighbors + 1 - iso) / (t.targetMaxNeighbors + 1);
      const score = isoScore * t.targetIsoWeight + (1 - d / t.targetMaxRange) * t.targetDistWeight;
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    if (w.tutorial && best < 0) {
      for (let i = 0; i < sheep.n; i++) {
        if (sheep.isFree(i)) return i;
      }
    }
    return best;
  }

  private flockOrbit(sheep: SheepSim): { cx: number; cy: number; radius: number } {
    let sx = 0, sy = 0, c = 0;
    for (let i = 0; i < sheep.n; i++) {
      if (!sheep.isFree(i)) continue;
      sx += sheep.x[i];
      sy += sheep.y[i];
      c++;
    }
    if (c === 0) return { cx: this.width * 0.4, cy: this.height * 0.4, radius: 80 };
    const cx = sx / c;
    const cy = sy / c;
    let r = 40;
    for (let i = 0; i < sheep.n; i++) {
      if (!sheep.isFree(i)) continue;
      r = Math.max(r, dist(cx, cy, sheep.x[i], sheep.y[i]));
    }
    return { cx, cy, radius: r };
  }

  private lineBlocked(ax: number, ay: number, bx: number, by: number, fences: FenceSystem): boolean {
    let blocked = false;
    fences.forEachSegment((x1, y1, x2, y2) => {
      if (blocked) return;
      if (segmentsIntersect(ax, ay, bx, by, x1, y1, x2, y2)) blocked = true;
    });
    return blocked;
  }

  private detour(
    ax: number,
    ay: number,
    bx: number,
    by: number,
    fences: FenceSystem,
  ): { x: number; y: number } {
    let best = { x: bx, y: by };
    let bestD = 1e9;
    fences.forEachSegment((x1, y1, x2, y2) => {
      if (!segmentsIntersect(ax, ay, bx, by, x1, y1, x2, y2)) return;
      for (const p of [
        { x: x1, y: y1 },
        { x: x2, y: y2 },
      ]) {
        const d = dist(ax, ay, p.x, p.y) + dist(p.x, p.y, bx, by);
        if (d < bestD) {
          bestD = d;
          const [nx, ny] = norm(p.x - (x1 + x2) * 0.5, p.y - (y1 + y2) * 0.5);
          best = { x: p.x + nx * 30, y: p.y + ny * 30 };
        }
      }
    });
    return best;
  }

  private nearestEdge(x: number, y: number): [number, number] {
    const left = x;
    const right = this.width - x;
    const top = y;
    const bot = this.height - y;
    const m = Math.min(left, right, top, bot);
    if (m === left) return [-1, 0];
    if (m === right) return [1, 0];
    if (m === top) return [0, -1];
    return [0, 1];
  }

  private offMap(w: Wolf): boolean {
    return w.x < -20 || w.y < -20 || w.x > this.width + 20 || w.y > this.height + 20;
  }
}
