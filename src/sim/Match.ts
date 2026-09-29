import defaultTuning from "../data/tuning.json";
import type { LevelDef, MatchEvent, Tuning } from "../types";
import { neededForOneStar, starsForRate } from "../types";
import { expandRect, norm } from "./geom";
import { FenceSystem, type Fence } from "./FenceSystem";
import { ObstacleGrid } from "./ObstacleGrid";
import { SheepSim } from "./SheepSim";
import { WolfPack } from "./WolfAI";
import { STEP } from "../types";
import { seededRng } from "./geom";

export type DrawState = {
  active: boolean;
  fence: Fence | null;
  pointerId: number | null;
  wasTouch: boolean;
  smx: number;
  smy: number;
  consumed: number;
  capped: boolean;
  emptied: boolean;
};

export class Match {
  level: LevelDef;
  tuning: Tuning;
  sheep: SheepSim;
  fences: FenceSystem;
  wolves: WolfPack;
  obstacles: ObstacleGrid;
  rng: () => number;
  time = 0;
  realTime = 0;
  timeScale = 1;
  outcome: "playing" | "win" | "lose" = "playing";
  reason: "clear" | "timeout" | "f2" | "failsafe" | null = null;
  stars = 0;
  paused = false;
  uiBlocked = false;
  failsafe = false;
  ink: number;
  inkMax: number;
  inkRegen: number;
  lastStrokeAt = -99;
  draw: DrawState = {
    active: false,
    fence: null,
    pointerId: null,
    wasTouch: false,
    smx: 0,
    smy: 0,
    consumed: 0,
    capped: false,
    emptied: false,
    };
  events: MatchEvent[] = [];
  tutorial = {
    firstInput: false,
    sheepEntered: 0,
    hideGuide: false,
    recastGuideAt: -1,
    nudgeCount: 0,
    lastNudgeAt: 0,
    wolfSlowMo: false,
    wolfSlowMoUsed: false,
    slowMoReal: 0,
    inkEmptiedOnce: false,
    showInkGuide: false,
    firstFenceAt: -1,
  };
  noDrawRect: [number, number, number, number];
  pen: {
    x: number;
    y: number;
    w: number;
    h: number;
    gx: number;
    gy: number;
    g2x: number;
    g2y: number;
    inwardX: number;
    inwardY: number;
  };
  driftX: number;
  driftY: number;
  listeners: ((e: MatchEvent) => void)[] = [];

  constructor(level: LevelDef, seed = 1, tuning: Tuning = defaultTuning as Tuning) {
    this.level = level;
    this.tuning = structuredClone(tuning);
    this.tuning.ink.max = level.ink.max;
    this.tuning.ink.regen = level.ink.regen;
    this.tuning.fence.life = level.fence.life;
    this.rng = seededRng(seed);
    const [w, h] = level.size;
    this.sheep = new SheepSim(400, w, h, this.tuning, this.rng);
    this.fences = new FenceSystem(w, h, this.tuning);
    this.wolves = new WolfPack(w, h, this.tuning);
    this.obstacles = new ObstacleGrid(w, h, this.tuning.obs.cell);
    this.inkMax = level.ink.max;
    this.inkRegen = level.ink.regen;
    this.ink = this.inkMax;
    const [dx, dy] = norm(level.sheep.drift.dir[0], level.sheep.drift.dir[1]);
    this.driftX = dx;
    this.driftY = dy;
    const p = level.pen;
    const [inx, iny] = inwardNormal(p.rect, p.gate);
    this.pen = {
      x: p.rect[0],
      y: p.rect[1],
      w: p.rect[2],
      h: p.rect[3],
      gx: p.gate[0][0],
      gy: p.gate[0][1],
      g2x: p.gate[1][0],
      g2y: p.gate[1][1],
      inwardX: inx,
      inwardY: iny,
    };
    this.noDrawRect = expandRect(p.rect[0], p.rect[1], p.rect[2], p.rect[3], this.tuning.draw.penNoDrawPad);
    this.buildWorld();
  }

  on(fn: (e: MatchEvent) => void): void {
    this.listeners.push(fn);
  }

  emit(e: MatchEvent): void {
    this.events.push(e);
    for (const fn of this.listeners) fn(e);
  }

  private buildWorld(): void {
    const p = this.pen;
    const gateTop = Math.min(this.pen.gy, this.pen.g2y);
    const gateBot = Math.max(this.pen.gy, this.pen.g2y);
    this.fences.addStaticPolyline([p.x, p.y, p.x + p.w, p.y, p.x + p.w, p.y + p.h, p.x, p.y + p.h, p.x, gateBot]);
    this.fences.addStaticPolyline([p.x, p.y, p.x, gateTop]);
    for (const rock of this.level.rocks) this.obstacles.addRock(rock.x, rock.y, rock.r);
    for (const spawn of this.level.sheep.spawns) this.sheep.spawn(spawn.rect, spawn.count);
  }

  step(dt: number): void {
    if (this.paused || this.outcome !== "playing") return;
    this.time += dt;
    this.realTime += dt / Math.max(0.001, this.timeScale);

    if (this.level.failsafeAt !== null && this.time >= this.level.failsafeAt) this.failsafe = true;

    if (!this.draw.active) {
      if (this.time - this.lastStrokeAt >= this.tuning.ink.regenDelay) {
        this.ink = Math.min(this.inkMax, this.ink + this.inkRegen * dt);
      }
    }

    const born = this.wolves.schedule(this.time, this.level);
    for (const w of born) {
      this.emit({ type: "wolf-warn", x: w.entryX, y: w.entryY, entry: w.entryKey });
    }

    this.updateSlowMo(dt);

    const sheepResult = this.sheep.step(
      dt,
      this.fences,
      this.obstacles,
      this.driftX,
      this.driftY,
      this.level.sheep.drift.speed,
      this.pen,
      this.wolves.activeDisplay(),
      this.failsafe,
    );
    for (const i of sheepResult.entered) {
      this.tutorial.sheepEntered++;
      if (this.tutorial.sheepEntered >= 2) this.tutorial.hideGuide = true;
      this.emit({
        type: "sheep-enter",
        index: i,
        combo: this.sheep.combo,
        x: this.sheep.x[i],
        y: this.sheep.y[i],
      });
    }

    const wolfResult = this.wolves.step(dt, this.sheep, this.fences, this.obstacles, this.pen);
    for (const w of wolfResult.windup) this.emit({ type: "wolf-windup", id: w.id });
    for (const w of this.wolves.wolves) {
      if (w.state === 4 /* WINDUP */ && w.slowMoArmed && !this.tutorial.wolfSlowMoUsed) {
        this.tutorial.wolfSlowMo = true;
        this.tutorial.wolfSlowMoUsed = true;
        this.tutorial.slowMoReal = 0;
        this.timeScale = 0.25;
        this.emit({ type: "wolf-windup", id: w.id });
      }
    }
    for (const w of wolfResult.blocked) {
      this.emit({ type: "wolf-blocked", id: w.id, x: w.x, y: w.y });
      if (this.tutorial.wolfSlowMo) this.endSlowMo();
    }
    for (const w of wolfResult.grabbed) this.emit({ type: "wolf-grab", id: w.id, sheep: w.carried });
    for (const i of wolfResult.rescued) {
      this.emit({ type: "sheep-rescued", index: i, x: this.sheep.x[i], y: this.sheep.y[i] });
    }
    for (const i of wolfResult.lost) this.emit({ type: "sheep-lost", index: i });

    const broken = this.fences.step(dt);
    for (const id of broken) {
      if (id < 0) continue;
      const f = this.fences.fences.find((x) => x.id === id);
      const pt = f ? centroid(f) : { x: 0, y: 0 };
      this.emit({ type: "fence-break", x: pt.x, y: pt.y });
    }

    this.evaluateEnd();
  }

  private updateSlowMo(dt: number): void {
    if (!this.tutorial.wolfSlowMo) return;
    this.tutorial.slowMoReal += dt / 0.25;
    if (this.draw.active) {
      this.endSlowMo();
      return;
    }
    if (this.tutorial.slowMoReal >= 6) this.endSlowMo();
  }

  private endSlowMo(): void {
    this.tutorial.wolfSlowMo = false;
    this.timeScale = 1;
  }

  beginStroke(x: number, y: number, pointerId: number, wasTouch: boolean): boolean {
    if (this.outcome !== "playing" || this.paused || this.uiBlocked) return false;
    if (this.draw.active) return false;
    if (this.ink < this.tuning.draw.minLength * this.tuning.draw.inkPerUnit * 0.25) return false;
    if (!this.tutorial.firstInput) {
      this.tutorial.firstInput = true;
      this.emit({ type: "tutorial-first-input" });
    }
    const fence = this.fences.beginStroke();
    this.fences.setLife(fence, this.level.fence.life);
    this.draw = {
      active: true,
      fence,
      pointerId,
      wasTouch,
      smx: x,
      smy: y,
      consumed: 0,
      capped: false,
      emptied: false,
    };
    this.fences.addPoint(fence, x, y, this.noDrawRect);
    return true;
  }

  addStrokePoint(x: number, y: number): void {
    if (!this.draw.active || !this.draw.fence) return;
    if (this.draw.wasTouch) {
      const a = this.tuning.draw.smoothTouch;
      this.draw.smx = this.draw.smx * (1 - a) + x * a;
      this.draw.smy = this.draw.smy * (1 - a) + y * a;
      x = this.draw.smx;
      y = this.draw.smy;
    }
    const fence = this.draw.fence;
    const line = fence.polylines[fence.polylines.length - 1];
    if (line.length >= 2) {
      const ax = line[line.length - 2];
      const ay = line[line.length - 1];
      const step = this.draw.wasTouch ? this.tuning.draw.minStepTouch : this.tuning.draw.minStepMouse;
      if (Math.hypot(x - ax, y - ay) < step) return;
    }
    const before = this.fences.strokeLength(fence);
    const maxLen = Math.min(this.ink, this.inkMax * this.tuning.draw.maxStrokeFrac) / this.tuning.draw.inkPerUnit;
    if (before >= maxLen) {
      this.draw.capped = true;
      this.endStroke(true);
      return;
    }
    const added = this.fences.addPoint(fence, x, y, this.noDrawRect);
    if (!added) return;
    const after = this.fences.strokeLength(fence);
    const dInk = (after - before) * this.tuning.draw.inkPerUnit;
    this.ink = Math.max(0, this.ink - dInk);
    this.draw.consumed += dInk;
    if (this.ink <= 0.05) {
      this.ink = 0;
      this.draw.emptied = true;
      if (!this.tutorial.inkEmptiedOnce) {
        this.tutorial.inkEmptiedOnce = true;
        this.tutorial.showInkGuide = this.level.tutorial === "ink";
      }
      this.emit({ type: "ink-empty", x, y });
      this.endStroke(true);
    }
  }

  endStroke(auto = false): void {
    if (!this.draw.active || !this.draw.fence) return;
    const fence = this.draw.fence;
    const len = this.fences.strokeLength(fence);
    this.lastStrokeAt = this.time;
    if (len < this.tuning.draw.minLength) {
      this.ink = Math.min(this.inkMax, this.ink + this.draw.consumed);
      this.fences.discard(fence);
      this.draw.active = false;
      this.draw.fence = null;
      this.draw.pointerId = null;
      this.emit({ type: "stroke-rejected" });
      return;
    }
    const ok = this.fences.commit(
      fence,
      this.tuning.draw.rdpEpsilon,
      this.tuning.draw.rdpMaxVerts,
      this.tuning.draw.minLength,
    );
    if (ok) {
      fence.polylines.forEach((pl) => {
        for (let i = 2; i < pl.length; i += 2) {
          this.sheep.startleNearFence(pl[i - 2], pl[i - 1], pl[i], pl[i + 1]);
        }
      });
      const c = centroid(fence);
      this.emit({ type: "fence-commit", id: fence.id, x: c.x, y: c.y });
      if (this.tutorial.firstFenceAt < 0) this.tutorial.firstFenceAt = this.time;
      if (this.draw.capped) this.emit({ type: "ink-capped", x: c.x, y: c.y });
      if (this.tutorial.wolfSlowMo) this.endSlowMo();
    } else {
      this.ink = Math.min(this.inkMax, this.ink + this.draw.consumed);
      this.emit({ type: "stroke-rejected" });
    }
    this.draw.active = false;
    this.draw.fence = null;
    this.draw.pointerId = null;
    void auto;
  }

  cancelStroke(): void {
    if (!this.draw.active || !this.draw.fence) return;
    this.ink = Math.min(this.inkMax, this.ink + this.draw.consumed);
    this.fences.discard(this.draw.fence);
    this.draw.active = false;
    this.draw.fence = null;
    this.draw.pointerId = null;
  }

  private evaluateEnd(): void {
    if (this.outcome !== "playing") return;
    const total = this.sheep.n;
    const rate = this.sheep.penned / total;
    const needed = neededForOneStar(total, this.level.stars[0]);

    if (this.level.canFail && this.sheep.saveable() < needed) {
      this.finish(false, "f2");
      return;
    }

    const free = this.sheep.freeCount();
    const carried = this.sheep.carriedCount();
    const entering = countState(this.sheep, 4);
    if (free + carried + entering === 0) {
      const win = !this.level.canFail || rate >= this.level.stars[0];
      this.finish(win, this.failsafe ? "failsafe" : "clear");
      return;
    }

    if (this.level.timeLimit !== null && this.time >= this.level.timeLimit) {
      const win = rate >= this.level.stars[0];
      this.finish(win, "timeout");
    }
  }

  private finish(win: boolean, reason: "clear" | "timeout" | "f2" | "failsafe"): void {
    this.outcome = win ? "win" : "lose";
    this.reason = reason;
    this.stars = win ? starsForRate(this.sheep.penned / this.sheep.n, this.level.stars) : 0;
    if (!this.level.canFail) {
      this.outcome = "win";
      this.stars = Math.max(this.stars, starsForRate(this.sheep.penned / this.sheep.n, this.level.stars));
    }
    this.emit({ type: "result", win: this.outcome === "win", stars: this.stars, reason });
  }

  rate(): number {
    return this.sheep.n ? this.sheep.penned / this.sheep.n : 0;
  }
}

export function runHeadless(level: LevelDef, seconds: number, draw?: (m: Match, t: number) => void, seed = 1): Match {
  const match = new Match(level, seed);
  const steps = Math.ceil(seconds / STEP);
  for (let i = 0; i < steps; i++) {
    if (match.outcome !== "playing") break;
    draw?.(match, match.time);
    match.step(STEP);
  }
  return match;
}

function inwardNormal(
  rect: [number, number, number, number],
  gate: [[number, number], [number, number]],
): [number, number] {
  const gx = (gate[0][0] + gate[1][0]) * 0.5;
  const gy = (gate[0][1] + gate[1][1]) * 0.5;
  const cx = rect[0] + rect[2] * 0.5;
  const cy = rect[1] + rect[3] * 0.5;
  return norm(cx - gx, cy - gy);
}

function centroid(fence: Fence): { x: number; y: number } {
  let x = 0, y = 0, n = 0;
  for (const pl of fence.polylines) {
    for (let i = 0; i < pl.length; i += 2) {
      x += pl[i];
      y += pl[i + 1];
      n++;
    }
  }
  if (!n) return { x: 0, y: 0 };
  return { x: x / n, y: y / n };
}

function countState(sheep: SheepSim, state: number): number {
  let c = 0;
  for (let i = 0; i < sheep.n; i++) if (sheep.state[i] === state) c++;
  return c;
}

export function remainingInkWorld(match: Match): number {
  return match.ink / match.tuning.draw.inkPerUnit;
}
