import type { Tuning } from "../types";
import { SegmentGrid } from "./grid";
import {
  nearestOnSegment,
  polylineLength,
  segmentHitsRect,
  simplifyRdp,
} from "./geom";

export type Fence = {
  id: number;
  polylines: number[][];
  life: number;
  maxLife: number;
  immortal: boolean;
  drawing: boolean;
  fading: boolean;
  fadeLeft: number;
  hitFlash: number;
};

type NearHit = {
  fenceId: number;
  ax: number;
  ay: number;
  bx: number;
  by: number;
  qx: number;
  qy: number;
  d: number;
  nx: number;
  ny: number;
};

const TMP = { x: 0, y: 0, t: 0, d: 0 };
const QUERY = new Set<number>();

export class FenceSystem {
  fences: Fence[] = [];
  private nextId = 1;
  private grid: SegmentGrid;
  private segs: number[] = [];
  private width: number;
  private height: number;
  tuning: Tuning;

  constructor(width: number, height: number, tuning: Tuning) {
    this.width = width;
    this.height = height;
    this.tuning = tuning;
    this.grid = new SegmentGrid(width, height, 64);
  }

  reset(): void {
    this.fences = [];
    this.nextId = 1;
    this.rebuild();
  }

  addStaticPolyline(pts: number[]): Fence {
    const fence: Fence = {
      id: this.nextId++,
      polylines: [pts.slice()],
      life: 9999,
      maxLife: 9999,
      immortal: true,
      drawing: false,
      fading: false,
      fadeLeft: 0,
      hitFlash: 0,
    };
    this.fences.push(fence);
    this.rebuild();
    return fence;
  }

  beginStroke(): Fence {
    const live = this.fences.filter((f) => !f.immortal && !f.fading);
    if (live.length >= this.tuning.fence.maxCount) {
      const oldest = live.reduce((a, b) => (a.id < b.id ? a : b));
      this.startFade(oldest, this.tuning.fence.evictFade);
    }
    const fence: Fence = {
      id: this.nextId++,
      polylines: [[]],
      life: this.tuning.fence.life,
      maxLife: this.tuning.fence.life,
      immortal: false,
      drawing: true,
      fading: false,
      fadeLeft: 0,
      hitFlash: 0,
    };
    this.fences.push(fence);
    return fence;
  }

  setLife(fence: Fence, life: number): void {
    fence.life = life;
    fence.maxLife = life;
  }

  addPoint(
    fence: Fence,
    x: number,
    y: number,
    noDraw: [number, number, number, number] | null,
  ): boolean {
    x = Math.max(0, Math.min(this.width, x));
    y = Math.max(0, Math.min(this.height, y));
    if (noDraw && this.pointIn(x, y, noDraw)) return false;
    let line = fence.polylines[fence.polylines.length - 1];
    if (line.length >= 2) {
      const ax = line[line.length - 2];
      const ay = line[line.length - 1];
      if (noDraw && segmentHitsRect(ax, ay, x, y, ...noDraw)) {
        fence.polylines.push([]);
        return false;
      }
    }
    if (line.length >= 2) {
      const ax = line[line.length - 2];
      const ay = line[line.length - 1];
      if (Math.hypot(x - ax, y - ay) < 0.5) return false;
    }
    if (line.length === 0 && fence.polylines.length > 1) {
      line = fence.polylines[fence.polylines.length - 1];
    }
    line.push(x, y);
    this.rebuild();
    return true;
  }

  strokeLength(fence: Fence): number {
    let s = 0;
    for (const pl of fence.polylines) s += polylineLength(pl);
    return s;
  }

  commit(fence: Fence, epsilon: number, maxVerts: number, minLength: number): boolean {
    fence.drawing = false;
    fence.polylines = fence.polylines
      .map((pl) => (pl.length >= 4 ? simplifyRdp(pl, epsilon, maxVerts) : pl))
      .filter((pl) => pl.length >= 4);
    const len = this.strokeLength(fence);
    if (len < minLength || fence.polylines.length === 0) {
      this.remove(fence.id);
      return false;
    }
    this.rebuild();
    return true;
  }

  discard(fence: Fence): void {
    this.remove(fence.id);
  }

  damage(fenceId: number, cost: number): void {
    const fence = this.fences.find((f) => f.id === fenceId);
    if (!fence || fence.immortal) return;
    fence.life -= cost;
    fence.hitFlash = 0.12;
    if (fence.life <= 0) this.startFade(fence, 0.18);
  }

  startFade(fence: Fence, duration: number): void {
    if (fence.immortal || fence.fading) return;
    fence.fading = true;
    fence.drawing = false;
    fence.fadeLeft = duration;
    fence.life = 0;
  }

  step(dt: number): number[] {
    const broken: number[] = [];
    for (const fence of this.fences) {
      if (fence.hitFlash > 0) fence.hitFlash = Math.max(0, fence.hitFlash - dt);
      if (fence.immortal || fence.drawing) continue;
      if (fence.fading) {
        fence.fadeLeft -= dt;
        if (fence.fadeLeft <= 0) {
          broken.push(fence.id);
        }
        continue;
      }
      fence.life -= dt;
      if (fence.life <= 0) {
        this.startFade(fence, 0.25);
        broken.push(-fence.id);
      }
    }
    if (broken.some((id) => id > 0)) {
      this.fences = this.fences.filter((f) => !broken.includes(f.id));
      this.rebuild();
    }
    return broken;
  }

  alpha(fence: Fence): number {
    if (fence.fading) {
      const t = fence.fadeLeft > 0 ? Math.min(1, fence.fadeLeft / 0.3) : 0;
      return 0.35 * t;
    }
    if (fence.immortal) return 1;
    const fadeTime = this.tuning.fence.fadeTime;
    if (fence.life > fadeTime) return 1;
    const k = fence.life / fadeTime;
    const blink = Math.sin(fence.life * this.tuning.fence.blinkHz * Math.PI * 2) * 0.5 + 0.5;
    return this.tuning.fence.fadeAlpha + (1 - this.tuning.fence.fadeAlpha) * k * (0.55 + 0.45 * blink);
  }

  collides(fence: Fence): boolean {
    return !fence.fading && (fence.drawing || fence.life > 0 || fence.immortal);
  }

  nearest(
    px: number,
    py: number,
    px0: number,
    py0: number,
    hit: NearHit,
  ): boolean {
    QUERY.clear();
    this.grid.query(px, py, QUERY);
    this.grid.query(px0, py0, QUERY);
    let best = 1e9;
    let found = false;
    for (const sid of QUERY) {
      const ax = this.segs[sid * 6];
      const ay = this.segs[sid * 6 + 1];
      const bx = this.segs[sid * 6 + 2];
      const by = this.segs[sid * 6 + 3];
      const fid = this.segs[sid * 6 + 4];
      const fence = this.fences.find((f) => f.id === fid);
      if (!fence || !this.collides(fence)) continue;
      nearestOnSegment(px, py, ax, ay, bx, by, TMP);
      if (TMP.d < best) {
        best = TMP.d;
        found = true;
        hit.fenceId = fid;
        hit.ax = ax;
        hit.ay = ay;
        hit.bx = bx;
        hit.by = by;
        hit.qx = TMP.x;
        hit.qy = TMP.y;
        hit.d = TMP.d;
        let nx = px - TMP.x;
        let ny = py - TMP.y;
        const nl = Math.hypot(nx, ny);
        if (nl < 1e-6) {
          nx = px0 - TMP.x;
          ny = py0 - TMP.y;
        }
        const nl2 = Math.hypot(nx, ny);
        if (nl2 < 1e-6) {
          const tx = bx - ax;
          const ty = by - ay;
          nx = -ty;
          ny = tx;
        }
        const nl3 = Math.hypot(nx, ny) || 1;
        hit.nx = nx / nl3;
        hit.ny = ny / nl3;
      }
    }
    return found;
  }

  forEachSegment(fn: (ax: number, ay: number, bx: number, by: number, fenceId: number) => void): void {
    for (let i = 0; i < this.segs.length; i += 6) {
      const fid = this.segs[i + 4];
      const fence = this.fences.find((f) => f.id === fid);
      if (!fence || !this.collides(fence)) continue;
      fn(this.segs[i], this.segs[i + 1], this.segs[i + 2], this.segs[i + 3], fid);
    }
  }

  private pointIn(x: number, y: number, r: [number, number, number, number]): boolean {
    return x >= r[0] && y >= r[1] && x <= r[0] + r[2] && y <= r[1] + r[3];
  }

  private remove(id: number): void {
    this.fences = this.fences.filter((f) => f.id !== id);
    this.rebuild();
  }

  rebuild(): void {
    this.grid.clear();
    this.segs.length = 0;
    let sid = 0;
    for (const fence of this.fences) {
      if (fence.fading) continue;
      for (const pl of fence.polylines) {
        for (let i = 2; i < pl.length; i += 2) {
          const ax = pl[i - 2];
          const ay = pl[i - 1];
          const bx = pl[i];
          const by = pl[i + 1];
          this.segs.push(ax, ay, bx, by, fence.id, 0);
          this.grid.insert(sid, ax, ay, bx, by);
          sid++;
        }
      }
    }
  }
}

export type { NearHit };
