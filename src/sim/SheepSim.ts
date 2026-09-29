import type { Tuning } from "../types";
import { SHEEP } from "../types";
import { SpatialGrid } from "./grid";
import { clamp, nearestOnSegment, segmentsIntersect } from "./geom";
import type { FenceSystem, NearHit } from "./FenceSystem";
import type { ObstacleGrid } from "./ObstacleGrid";

const NEAR: NearHit = {
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
const OBS = { x: 0, y: 0 };

export class SheepSim {
  n: number;
  x: Float32Array;
  y: Float32Array;
  px: Float32Array;
  py: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  state: Uint8Array;
  panic: Float32Array;
  panicHop: Float32Array;
  phase: Float32Array;
  grazeCd: Float32Array;
  grazeLeft: Float32Array;
  stuck: Float32Array;
  wander: Float32Array;
  startle: Float32Array;
  enterT: Float32Array;
  slotX: Float32Array;
  slotY: Float32Array;
  comboFrom: Float32Array;
  grid: SpatialGrid;
  tuning: Tuning;
  width: number;
  height: number;
  radius: number;
  penned = 0;
  lost = 0;
  combo = 0;
  comboTimer = 0;
  lastEnterAt = -99;
  rng: () => number;

  constructor(cap: number, width: number, height: number, tuning: Tuning, rng: () => number) {
    this.n = 0;
    this.x = new Float32Array(cap);
    this.y = new Float32Array(cap);
    this.px = new Float32Array(cap);
    this.py = new Float32Array(cap);
    this.vx = new Float32Array(cap);
    this.vy = new Float32Array(cap);
    this.state = new Uint8Array(cap);
    this.panic = new Float32Array(cap);
    this.panicHop = new Float32Array(cap);
    this.phase = new Float32Array(cap);
    this.grazeCd = new Float32Array(cap);
    this.grazeLeft = new Float32Array(cap);
    this.stuck = new Float32Array(cap);
    this.wander = new Float32Array(cap);
    this.startle = new Float32Array(cap);
    this.enterT = new Float32Array(cap);
    this.slotX = new Float32Array(cap);
    this.slotY = new Float32Array(cap);
    this.comboFrom = new Float32Array(cap);
    this.grid = new SpatialGrid(width, height, 64, cap);
    this.tuning = tuning;
    this.width = width;
    this.height = height;
    this.radius = tuning.sheep.radius;
    this.rng = rng;
  }

  spawn(rect: [number, number, number, number], count: number): void {
    for (let i = 0; i < count; i++) {
      const id = this.n++;
      this.x[id] = rect[0] + this.rng() * rect[2];
      this.y[id] = rect[1] + this.rng() * rect[3];
      this.px[id] = this.x[id];
      this.py[id] = this.y[id];
      this.vx[id] = (this.rng() - 0.5) * 8;
      this.vy[id] = (this.rng() - 0.5) * 8;
      this.state[id] = SHEEP.WALK;
      this.panic[id] = 0;
      this.panicHop[id] = 0;
      this.phase[id] = this.rng() * Math.PI * 2;
      this.grazeCd[id] = 3 + this.rng() * 3;
      this.grazeLeft[id] = 0;
      this.stuck[id] = 0;
      this.wander[id] = this.rng() * Math.PI * 2;
      this.startle[id] = 0;
      this.enterT[id] = 0;
    }
  }

  isFree(i: number): boolean {
    const s = this.state[i];
    return s === SHEEP.GRAZE || s === SHEEP.WALK || s === SHEEP.PANIC;
  }

  freeCount(): number {
    let c = 0;
    for (let i = 0; i < this.n; i++) if (this.isFree(i)) c++;
    return c;
  }

  carriedCount(): number {
    let c = 0;
    for (let i = 0; i < this.n; i++) if (this.state[i] === SHEEP.CARRIED) c++;
    return c;
  }

  saveable(): number {
    return this.penned + this.freeCount() + this.carriedCount();
  }

  step(
    dt: number,
    fences: FenceSystem,
    obstacles: ObstacleGrid,
    driftX: number,
    driftY: number,
    driftSpeed: number,
    pen: { x: number; y: number; w: number; h: number; gx: number; gy: number; g2x: number; g2y: number; inwardX: number; inwardY: number },
    wolves: { x: number; y: number; active: boolean }[],
    failsafe: boolean,
  ): { entered: number[]; startled: number[] } {
    const t = this.tuning;
    const entered: number[] = [];
    const startled: number[] = [];
    this.comboTimer = Math.max(0, this.comboTimer - dt);

    this.grid.rebuild(this.x, this.y, (i) => this.isFree(i), this.n);

    const maxN = t.sheep.neighbors.max;
    const sepR = t.sheep.sep.radius;
    const aliR = t.sheep.ali.radius;
    const cohR = t.sheep.coh.radius;
    const maxR = Math.max(sepR, aliR, cohR);

    for (let i = 0; i < this.n; i++) {
      const st = this.state[i];
      if (st === SHEEP.PENNED || st === SHEEP.LOST || st === SHEEP.CARRIED) continue;
      if (st === SHEEP.ENTERING) {
        this.enterT[i] += dt;
        const k = Math.min(1, this.enterT[i] / t.pen.enterTween);
        const ease = 1 - (1 - k) * (1 - k);
        this.px[i] = this.x[i];
        this.py[i] = this.y[i];
        this.x[i] = this.x[i] + (this.slotX[i] - this.x[i]) * ease;
        this.y[i] = this.y[i] + (this.slotY[i] - this.y[i]) * ease;
        if (k >= 1) {
          this.state[i] = SHEEP.PENNED;
          this.x[i] = this.slotX[i];
          this.y[i] = this.slotY[i];
          this.vx[i] = 0;
          this.vy[i] = 0;
        }
        continue;
      }

      this.px[i] = this.x[i];
      this.py[i] = this.y[i];

      let sx = 0, sy = 0, sc = 0;
      let ax = 0, ay = 0, ac = 0;
      let cx = 0, cy = 0, cc = 0;
      const xi = this.x[i];
      const yi = this.y[i];
      let counted = 0;
      this.grid.queryCells(xi, yi, (j) => {
        if (j === i) return;
        const dx = this.x[j] - xi;
        const dy = this.y[j] - yi;
        const d2 = dx * dx + dy * dy;
        if (d2 > maxR * maxR || d2 < 1e-8) return;
        const d = Math.sqrt(d2);
        if (d < sepR) {
          const w = 1 - d / sepR;
          sx -= (dx / d) * w;
          sy -= (dy / d) * w;
          sc++;
        }
        if (d < aliR) {
          ax += this.vx[j];
          ay += this.vy[j];
          ac++;
        }
        if (d < cohR) {
          cx += this.x[j];
          cy += this.y[j];
          cc++;
        }
        counted++;
        if (counted >= maxN) return false;
      });

      const panicked = st === SHEEP.PANIC || this.panic[i] > 0;
      const sepW = t.sheep.sep.weight * (panicked ? t.sheep.sep.panicMul : 1);
      const cohW = t.sheep.coh.weight * (panicked ? t.sheep.coh.panicMul : 1);
      let fx = 0;
      let fy = 0;
      if (sc > 0) {
        fx += sx * sepW;
        fy += sy * sepW;
      }
      if (ac > 0) {
        fx += (ax / ac - this.vx[i]) * t.sheep.ali.weight;
        fy += (ay / ac - this.vy[i]) * t.sheep.ali.weight;
      }
      if (cc > 0) {
        fx += (cx / cc - xi) * cohW * 0.05;
        fy += (cy / cc - yi) * cohW * 0.05;
      }

      this.wander[i] += (this.rng() - 0.5) * t.sheep.wander.jitter * dt * 2;
      fx += Math.cos(this.wander[i]) * t.sheep.wander.weight * 40;
      fy += Math.sin(this.wander[i]) * t.sheep.wander.weight * 40;

      fx += driftX * driftSpeed * t.sheep.drift.weight;
      fy += driftY * driftSpeed * t.sheep.drift.weight;

      if (fences.nearest(xi, yi, this.px[i], this.py[i], NEAR) && NEAR.d < t.fence.repelRadius) {
        const k = 1 - NEAR.d / t.fence.repelRadius;
        const mag = t.fence.weight * k ** t.fence.falloff * 60;
        fx += NEAR.nx * mag;
        fy += NEAR.ny * mag;
        let [tx, ty] = [NEAR.bx - NEAR.ax, NEAR.by - NEAR.ay];
        const tl = Math.hypot(tx, ty) || 1;
        tx /= tl;
        ty /= tl;
        const gx = (pen.gx + pen.g2x) * 0.5;
        const gy = (pen.gy + pen.g2y) * 0.5;
        if (tx * (gx - xi) + ty * (gy - yi) < 0) {
          tx = -tx;
          ty = -ty;
        }
        fx += tx * 160 * (0.4 + 0.6 * k);
        fy += ty * 160 * (0.4 + 0.6 * k);
      }

      obstacles.sampleForce(xi, yi, t.obs.repelRadius, t.obs.weight * 50, OBS);
      fx += OBS.x;
      fy += OBS.y;

      const gx = (pen.gx + pen.g2x) * 0.5;
      const gy = (pen.gy + pen.g2y) * 0.5;
      const pdx = gx - xi;
      const pdy = gy - yi;
      const pd = Math.hypot(pdx, pdy);
      if (failsafe) {
        fx += (pdx / (pd || 1)) * 240;
        fy += (pdy / (pd || 1)) * 240;
      } else if (pd < t.pen.attractRadius && pd > 1) {
        const k = 1 - pd / t.pen.attractRadius;
        fx += (pdx / pd) * t.pen.weight * 80 * k;
        fy += (pdy / pd) * t.pen.weight * 80 * k;
      }

      for (const wolf of wolves) {
        if (!wolf.active) continue;
        const dx = xi - wolf.x;
        const dy = yi - wolf.y;
        const d = Math.hypot(dx, dy);
        if (d < t.fear.radius && d > 1) {
          fx += (dx / d) * t.fear.weight * 90;
          fy += (dy / d) * t.fear.weight * 90;
          this.panic[i] = t.fear.duration;
          this.state[i] = SHEEP.PANIC;
        }
      }

      const fl = Math.hypot(fx, fy);
      if (fl > t.sheep.maxForce) {
        fx = (fx / fl) * t.sheep.maxForce;
        fy = (fy / fl) * t.sheep.maxForce;
      }

      if (st === SHEEP.GRAZE && !panicked && !failsafe) {
        fx *= 0.15;
        fy *= 0.15;
      }

      this.vx[i] += fx * dt;
      this.vy[i] += fy * dt;
      this.vx[i] *= Math.max(0, 1 - t.sheep.drag * dt);
      this.vy[i] *= Math.max(0, 1 - t.sheep.drag * dt);

      let maxSp = t.sheep.speed.walk;
      if (st === SHEEP.GRAZE && !panicked) maxSp = t.sheep.speed.graze;
      if (panicked) maxSp = t.sheep.speed.panic;
      if (failsafe) maxSp = 90;
      const sp = Math.hypot(this.vx[i], this.vy[i]);
      if (sp > maxSp) {
        this.vx[i] = (this.vx[i] / sp) * maxSp;
        this.vy[i] = (this.vy[i] / sp) * maxSp;
      }

      this.x[i] += this.vx[i] * dt;
      this.y[i] += this.vy[i] * dt;

      this.applyHard(i, fences, obstacles, t);

      this.checkPen(i, pen, t, entered);

      if (this.panic[i] > 0) {
        this.panic[i] -= dt;
        if (this.panic[i] <= 0 && this.state[i] === SHEEP.PANIC) this.state[i] = SHEEP.WALK;
      }
      if (this.startle[i] > 0) this.startle[i] -= dt;

      this.phase[i] += dt * (6 + sp * 0.12);

      const nearFence = fences.nearest(this.x[i], this.y[i], this.px[i], this.py[i], NEAR) && NEAR.d < t.fence.repelRadius;
      if (!panicked && !failsafe && !nearFence) {
        if (this.grazeLeft[i] > 0) {
          this.grazeLeft[i] -= dt;
          if (this.grazeLeft[i] <= 0) this.state[i] = SHEEP.WALK;
        } else {
          this.grazeCd[i] -= dt;
          if (this.grazeCd[i] <= 0) {
            this.grazeCd[i] = t.sheep.graze.intervalMin + this.rng() * (t.sheep.graze.intervalMax - t.sheep.graze.intervalMin);
            if (this.rng() < 0.45) {
              this.state[i] = SHEEP.GRAZE;
              this.grazeLeft[i] =
                t.sheep.graze.durationMin + this.rng() * (t.sheep.graze.durationMax - t.sheep.graze.durationMin);
            }
          }
        }
      }

      const spd = Math.hypot(this.vx[i], this.vy[i]);
      if (spd < t.sheep.stuck.speedEps && this.state[i] !== SHEEP.GRAZE) {
        this.stuck[i] += dt;
        if (this.stuck[i] > t.sheep.stuck.time) {
          const ang = this.rng() * Math.PI * 2;
          this.vx[i] += Math.cos(ang) * t.sheep.stuck.impulse;
          this.vy[i] += Math.sin(ang) * t.sheep.stuck.impulse;
          this.stuck[i] = 0;
        }
      } else {
        this.stuck[i] = 0;
      }
    }

    this.spreadPanic(dt);
    return { entered, startled };
  }

  startleNearFence(ax: number, ay: number, bx: number, by: number): void {
    const t = this.tuning;
    const tmp = { x: 0, y: 0, t: 0, d: 0 };
    for (let i = 0; i < this.n; i++) {
      if (!this.isFree(i)) continue;
      nearestOnSegment(this.x[i], this.y[i], ax, ay, bx, by, tmp);
      if (tmp.d < t.fence.startleRadius) {
        let nx = this.x[i] - tmp.x;
        let ny = this.y[i] - tmp.y;
        const nl = Math.hypot(nx, ny) || 1;
        nx /= nl;
        ny /= nl;
        this.vx[i] += nx * 50;
        this.vy[i] += ny * 50;
        this.x[i] += nx * 4;
        this.y[i] += ny * 4;
        this.startle[i] = t.fence.startleTime;
        this.panic[i] = Math.max(this.panic[i], t.fence.startleTime);
        this.state[i] = SHEEP.PANIC;
      }
    }
  }

  markCarried(i: number): void {
    this.state[i] = SHEEP.CARRIED;
    this.vx[i] = 0;
    this.vy[i] = 0;
  }

  release(i: number, x: number, y: number, nx: number, ny: number): void {
    this.state[i] = SHEEP.PANIC;
    this.x[i] = x + nx * 12;
    this.y[i] = y + ny * 12;
    this.px[i] = this.x[i];
    this.py[i] = this.y[i];
    this.vx[i] = nx * this.tuning.wolf.releaseKick;
    this.vy[i] = ny * this.tuning.wolf.releaseKick;
    this.panic[i] = this.tuning.wolf.releasePanic;
  }

  markLost(i: number): void {
    if (this.state[i] === SHEEP.LOST) return;
    this.state[i] = SHEEP.LOST;
    this.lost++;
  }

  neighborsWithin(i: number, radius: number): number {
    let c = 0;
    const r2 = radius * radius;
    const xi = this.x[i];
    const yi = this.y[i];
    this.grid.queryCells(xi, yi, (j) => {
      if (j === i || !this.isFree(j)) return;
      const dx = this.x[j] - xi;
      const dy = this.y[j] - yi;
      if (dx * dx + dy * dy <= r2) c++;
    });
    return c;
  }

  private spreadPanic(dt: number): void {
    const t = this.tuning;
    for (let i = 0; i < this.n; i++) {
      if (this.state[i] !== SHEEP.PANIC || this.panic[i] <= 0) continue;
      if (this.panicHop[i] > 0) {
        this.panicHop[i] -= dt;
        continue;
      }
      const xi = this.x[i];
      const yi = this.y[i];
      this.grid.queryCells(xi, yi, (j) => {
        if (j === i || !this.isFree(j)) return;
        const dx = this.x[j] - xi;
        const dy = this.y[j] - yi;
        if (dx * dx + dy * dy > t.fear.contagionRadius ** 2) return;
        const next = this.panic[i] * t.fear.contagionDecay;
        if (next < t.fear.duration * t.fear.contagionStop) return;
        if (this.panic[j] < next) {
          this.panic[j] = next;
          this.state[j] = SHEEP.PANIC;
          this.panicHop[j] = t.fear.hopDelay;
        }
      });
    }
  }

  private applyHard(i: number, fences: FenceSystem, obstacles: ObstacleGrid, t: Tuning): void {
    const r = this.radius;
    const pad = t.obs.borderPad;
    this.x[i] = clamp(this.x[i], pad, this.width - pad);
    this.y[i] = clamp(this.y[i], pad, this.height - pad);

    const resolved = obstacles.resolvePoint(this.x[i], this.y[i], r);
    this.x[i] = resolved.x;
    this.y[i] = resolved.y;

    const tmp = { x: 0, y: 0, t: 0, d: 0 };
    fences.forEachSegment((ax, ay, bx, by) => {
      nearestOnSegment(this.x[i], this.y[i], ax, ay, bx, by, tmp);
      const crossed = segmentsIntersect(this.px[i], this.py[i], this.x[i], this.y[i], ax, ay, bx, by, HIT);
      if (!crossed && tmp.d >= r) return;
      let nx = this.px[i] - tmp.x;
      let ny = this.py[i] - tmp.y;
      let nl = Math.hypot(nx, ny);
      if (nl < 1e-6) {
        nx = -(by - ay);
        ny = bx - ax;
        nl = Math.hypot(nx, ny) || 1;
        if (nx * (this.px[i] - ax) + ny * (this.py[i] - ay) < 0) {
          nx = -nx;
          ny = -ny;
        }
      }
      nx /= nl;
      ny /= nl;
      this.x[i] = tmp.x + nx * (r + 0.5);
      this.y[i] = tmp.y + ny * (r + 0.5);
      const vn = this.vx[i] * nx + this.vy[i] * ny;
      if (vn < 0) {
        this.vx[i] -= vn * nx;
        this.vy[i] -= vn * ny;
      }
      this.vx[i] *= t.fence.slide;
      this.vy[i] *= t.fence.slide;
    });
  }

  private checkPen(
    i: number,
    pen: { x: number; y: number; w: number; h: number; gx: number; gy: number; g2x: number; g2y: number; inwardX: number; inwardY: number },
    t: Tuning,
    entered: number[],
  ): void {
    if (!this.isFree(i)) return;
    const crossed = segmentsIntersect(
      this.px[i],
      this.py[i],
      this.x[i],
      this.y[i],
      pen.gx,
      pen.gy,
      pen.g2x,
      pen.g2y,
      HIT,
    );
    const mx = this.x[i] - this.px[i];
    const my = this.y[i] - this.py[i];
    const inward = mx * pen.inwardX + my * pen.inwardY > 0;
    const insidePen =
      this.x[i] > pen.x + 6 &&
      this.y[i] > pen.y + 6 &&
      this.x[i] < pen.x + pen.w - 6 &&
      this.y[i] < pen.y + pen.h - 6;
    const gx = (pen.gx + pen.g2x) * 0.5;
    const gy = (pen.gy + pen.g2y) * 0.5;
    const nearMouth =
      Math.hypot(this.x[i] - gx, this.y[i] - gy) < t.pen.enterInner + 28 &&
      (this.x[i] - gx) * pen.inwardX + (this.y[i] - gy) * pen.inwardY > 0;

    if ((crossed && inward) || insidePen || nearMouth) {
      this.beginEnter(i, pen, entered);
    }
  }

  private beginEnter(
    i: number,
    pen: { x: number; y: number; w: number; h: number },
    entered: number[],
  ): void {
    this.state[i] = SHEEP.ENTERING;
    this.enterT[i] = 0;
    this.penned++;
    const spacing = this.tuning.pen.slotSpacing;
    const cols = Math.max(1, Math.floor((pen.w - 24) / spacing));
    const idx = this.penned - 1;
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    this.slotX[i] = pen.x + 16 + col * spacing;
    this.slotY[i] = pen.y + 16 + row * spacing;
    if (this.comboTimer > 0) this.combo = Math.min(this.tuning.combo.max, this.combo + 1);
    else this.combo = 1;
    this.comboTimer = this.tuning.combo.window;
    entered.push(i);
  }
}
