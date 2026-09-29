import Phaser from "phaser";
import { getLevel } from "../data/levels";
import { Match } from "../sim/Match";
import { session } from "../session";
import { platform } from "../platform/StubSDK";
import { audio } from "../audio/AudioDirector";
import { recordStars } from "../save/Save";
import { SHEEP, STEP, WOLF, WOLF_STATE_NAME } from "../types";
import { lerp } from "../sim/geom";

type LevelData = { levelIndex?: number };

export class Level extends Phaser.Scene {
  match!: Match;
  private acc = 0;
  private sheepSprites: Phaser.GameObjects.Sprite[] = [];
  private wolfSprites = new Map<number, Phaser.GameObjects.Sprite>();
  private fenceGfx = new Map<number, Phaser.GameObjects.Graphics>();
  private drawGfx!: Phaser.GameObjects.Graphics;
  private guideGfx!: Phaser.GameObjects.Graphics;
  private worldGfx!: Phaser.GameObjects.Graphics;
  private halo!: Phaser.GameObjects.Graphics;
  private hand!: Phaser.GameObjects.Image;
  private bangs = new Map<number, Phaser.GameObjects.Image>();
  private plusPool: Phaser.GameObjects.Text[] = [];
  private particles!: Phaser.GameObjects.Particles.ParticleEmitter;
  private drawingLocked = false;
  private debug = false;

  constructor() {
    super("Level");
  }

  create(data: LevelData): void {
    const index = data.levelIndex ?? session.levelIndex ?? 1;
    session.levelIndex = index;
    const level = getLevel(index);
    this.match = new Match(level, 1 + index * 17);
    session.match = this.match;
    this.acc = 0;
    this.drawingLocked = false;
    this.debug = new URLSearchParams(location.search).has("debug");

    this.cameras.main.setBounds(0, 0, level.size[0], level.size[1]);
    this.cameras.main.setBackgroundColor(0x8fc86a);

    this.add.tileSprite(0, 0, level.size[0], level.size[1], "grass").setOrigin(0, 0).setDepth(0);
    for (let i = 0; i < 40; i++) {
      this.add
        .image((i * 137) % 960, (i * 89 + 40) % 700, "flower")
        .setDepth(1)
        .setAlpha(0.85)
        .setScale(0.8 + (i % 3) * 0.15);
    }

    this.worldGfx = this.add.graphics().setDepth(3);
    this.drawPen();
    for (const rock of level.rocks) {
      this.add.image(rock.x, rock.y, "rock").setDisplaySize(rock.r * 2.4, rock.r * 2.4).setDepth(4);
    }

    this.guideGfx = this.add.graphics().setDepth(6);
    this.drawGfx = this.add.graphics().setDepth(8);
    this.halo = this.add.graphics().setDepth(20);
    this.hand = this.add.image(0, 0, "hand").setDepth(21).setScale(0.9);
    this.hand.setVisible(level.tutorial === "draw");

    this.sheepSprites = [];
    for (let i = 0; i < this.match.sheep.n; i++) {
      const s = this.add.sprite(this.match.sheep.x[i], this.match.sheep.y[i], "sheep").setDepth(10);
      this.sheepSprites.push(s);
    }

    try {
      this.particles = this.add.particles(0, 0, "dot", {
        emitting: false,
        lifespan: 400,
        speed: { min: 40, max: 120 },
        scale: { start: 1, end: 0.2 },
        gravityY: 180,
        quantity: 8,
      });
      this.particles.setDepth(16);
    } catch {
      this.particles = this.add.particles(0, 0, "dot") as unknown as Phaser.GameObjects.Particles.ParticleEmitter;
    }

    this.bindInput();
    this.bindMatchEvents();
    if (!this.scene.isActive("HUD")) this.scene.launch("HUD");
    this.game.events.emit("match-ready", this.match);
    platform.measure?.("level", String(index), "start");

    this.time.addEvent({
      delay: 500,
      loop: true,
      callback: () => this.tickTutorial(),
    });

    this.input.keyboard?.on("keydown-P", () => this.togglePause());
    this.input.keyboard?.on("keydown-SPACE", () => this.togglePause());
  }

  private drawPen(): void {
    const g = this.worldGfx;
    const p = this.match.pen;
    g.clear();
    g.fillStyle(0xc8a56a, 1);
    g.fillRoundedRect(p.x, p.y, p.w, p.h, 8);
    g.fillStyle(0xb08950, 1);
    g.fillRect(p.x + 10, p.y + 10, p.w - 20, p.h - 20);
    g.lineStyle(8, 0x6b4423, 1);
    g.strokeRoundedRect(p.x, p.y, p.w, p.h, 8);
    g.lineStyle(10, 0xf6e27a, 1);
    g.beginPath();
    g.moveTo(p.gx, p.gy);
    g.lineTo(p.g2x, p.g2y);
    g.strokePath();
  }

  private bindInput(): void {
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (p.button === 2) {
        this.match.cancelStroke();
        return;
      }
      if (session.match && this.game.registry.get("hud-block")) return;
      audio.unlock();
      const started = this.match.beginStroke(p.worldX, p.worldY, p.id, p.wasTouch);
      if (started) {
        this.hand.setVisible(false);
        if (!this.drawingLocked) {
          platform.gameplayStart();
          this.drawingLocked = true;
        }
      }
    });
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (!this.match.draw.active || this.match.draw.pointerId !== p.id) return;
      this.match.addStrokePoint(p.worldX, p.worldY);
    });
    const up = (p: Phaser.Input.Pointer) => {
      if (this.match.draw.pointerId === p.id) this.match.endStroke();
    };
    this.input.on("pointerup", up);
    this.input.on("pointerupoutside", up);
  }

  private bindMatchEvents(): void {
    this.match.on((e) => {
      if (e.type === "sheep-enter") {
        audio.enter(e.combo);
        this.spawnPlus(e.x, e.y);
        this.flashGate();
      } else if (e.type === "fence-commit") {
        audio.fence();
        this.burst(e.x, e.y, 10);
        if (typeof navigator !== "undefined" && this.match.draw.capped) {
          try {
            navigator.vibrate?.(10);
          } catch {
            /* ignore */
          }
        }
      } else if (e.type === "fence-break") {
        audio.shatter();
        this.burst(e.x, e.y, 14);
      } else if (e.type === "ink-empty") {
        audio.inkEmpty();
        this.burst(e.x, e.y, 8);
      } else if (e.type === "wolf-warn") {
        audio.wolfWarn();
        const bang = this.add.image(e.x, e.y, "bang").setDepth(18);
        this.bangs.set(-1, bang);
        this.tweens.add({
          targets: bang,
          y: e.y - 20,
          scale: 1.2,
          duration: 400,
          yoyo: true,
          repeat: 3,
        });
      } else if (e.type === "wolf-blocked") {
        audio.wolfHit();
        this.burst(e.x, e.y, 12);
      } else if (e.type === "result") {
        platform.gameplayStop();
        platform.measure?.("level", String(this.match.level.index), e.win ? "complete" : "fail");
        if (e.win) recordStars(this.match.level.id, e.stars);
        this.game.events.emit("match-result", e);
      } else if (e.type === "tutorial-first-input") {
        platform.gameplayStart();
        this.game.events.emit("hud-show-ink");
      }
    });
  }

  private tickTutorial(): void {
    const m = this.match;
    if (m.outcome !== "playing") return;
    if (m.level.tutorial === "draw" && !m.tutorial.firstInput && m.realTime > 5) {
      const n = Math.floor((m.realTime - 0.01) / 5);
      if (n > m.tutorial.nudgeCount && m.tutorial.nudgeCount < 3) {
        m.tutorial.nudgeCount = n;
        this.hand.setScale(1.3);
        this.tweens.add({ targets: this.hand, scale: 0.9, duration: 400 });
        audio.baa();
      }
    }
    if (
      m.level.tutorial === "draw" &&
      m.tutorial.firstFenceAt >= 0 &&
      m.tutorial.sheepEntered === 0 &&
      m.time - m.tutorial.firstFenceAt > 10 &&
      !m.tutorial.hideGuide
    ) {
      m.tutorial.recastGuideAt = m.time;
    }
  }

  private spawnPlus(x: number, y: number): void {
    const t =
      this.plusPool.pop() ??
      this.add
        .text(x, y, "+1", {
          fontFamily: "system-ui, sans-serif",
          fontSize: "22px",
          color: "#fff4c2",
          stroke: "#5a3a12",
          strokeThickness: 4,
        })
        .setDepth(22)
        .setOrigin(0.5);
    t.setPosition(x, y - 8).setAlpha(1).setVisible(true);
    this.tweens.add({
      targets: t,
      y: y - 46,
      alpha: 0,
      duration: 700,
      onComplete: () => {
        t.setVisible(false);
        this.plusPool.push(t);
      },
    });
  }

  private burst(x: number, y: number, n: number): void {
    try {
      this.particles.explode(n, x, y);
    } catch {
      /* optional */
    }
  }

  private flashGate(): void {
    this.tweens.add({
      targets: this.worldGfx,
      alpha: 0.65,
      yoyo: true,
      duration: 90,
    });
  }

  private togglePause(): void {
    if (this.match.outcome !== "playing") return;
    this.match.paused = !this.match.paused;
    if (this.match.paused) platform.gameplayStop();
    else platform.gameplayStart();
    this.game.events.emit("match-pause", this.match.paused);
  }

  update(_time: number, delta: number): void {
    const m = this.match;
    if (!m) return;
    const capped = Math.min(delta, 250) * m.timeScale;
    this.acc += capped;
    let steps = 0;
    while (this.acc >= STEP * 1000 && steps < 4) {
      m.step(STEP);
      this.acc -= STEP * 1000;
      steps++;
    }
    const alpha = this.acc / (STEP * 1000);
    this.syncSheep(alpha);
    this.syncWolves(alpha);
    this.syncFences();
    this.syncGuide();
    this.syncHalo();
    this.game.events.emit("match-frame");
  }

  private syncSheep(a: number): void {
    const s = this.match.sheep;
    for (let i = 0; i < s.n; i++) {
      const spr = this.sheepSprites[i];
      if (!spr) continue;
      if (s.state[i] === SHEEP.LOST) {
        spr.setVisible(false);
        continue;
      }
      spr.setVisible(true);
      const x = lerp(s.px[i], s.x[i], a);
      const y = lerp(s.py[i], s.y[i], a);
      spr.setPosition(x, y);
      const ang = Math.atan2(s.vy[i], s.vx[i]);
      if (s.state[i] !== SHEEP.GRAZE && s.state[i] !== SHEEP.PENNED) {
        spr.setFlipX(Math.cos(ang) < 0);
      }
      const panic = s.state[i] === SHEEP.PANIC;
      spr.setScale(panic ? 1.08 : s.state[i] === SHEEP.PENNED ? 0.92 : 1);
      spr.setTint(panic ? 0xffd0c8 : 0xffffff);
      if (s.state[i] === SHEEP.CARRIED) spr.setAlpha(0.85);
      else spr.setAlpha(1);
    }
  }

  private syncWolves(a: number): void {
    const seen = new Set<number>();
    for (const w of this.match.wolves.wolves) {
      seen.add(w.id);
      let spr = this.wolfSprites.get(w.id);
      if (!spr) {
        spr = this.add.sprite(w.x, w.y, "wolf").setDepth(14);
        this.wolfSprites.set(w.id, spr);
      }
      const hide = w.state === WOLF.WARN;
      spr.setVisible(!hide);
      const x = lerp(w.px, w.x, a);
      const y = lerp(w.py, w.y, a);
      spr.setPosition(x, y);
      spr.setFlipX(w.vx < 0);
      if (w.state === WOLF.WINDUP) spr.setTint(0xff6666);
      else if (w.state === WOLF.BLOCKED) spr.setTint(0xfff27a);
      else spr.clearTint();
      spr.setScale(w.state === WOLF.SPRINT ? 1.12 : 1);
      if (this.debug) {
        spr.setName(WOLF_STATE_NAME[w.state] ?? "");
      }
      if (w.state === WOLF.WARN) {
        const bang = this.bangs.get(-1);
        if (bang) bang.setPosition(w.entryX, w.entryY);
      }
    }
    for (const [id, spr] of this.wolfSprites) {
      if (!seen.has(id)) {
        spr.destroy();
        this.wolfSprites.delete(id);
      }
    }
  }

  private fenceWidth(): number {
    const zoom = this.scale.displaySize.width / this.match.level.size[0];
    const css = this.match.tuning.fence.minCssPx;
    return Math.max(this.match.tuning.fence.visualWidthWorld, css / Math.max(0.2, zoom));
  }

  private syncFences(): void {
    const width = this.fenceWidth();
    const seen = new Set<number>();
    for (const fence of this.match.fences.fences) {
      seen.add(fence.id);
      let g = this.fenceGfx.get(fence.id);
      if (!g) {
        g = this.add.graphics().setDepth(fence.immortal ? 5 : 9);
        this.fenceGfx.set(fence.id, g);
      }
      g.clear();
      if (fence.immortal) continue;
      const alpha = this.match.fences.alpha(fence);
      const color = fence.hitFlash > 0 ? 0xffe08a : 0x8a5a2b;
      g.lineStyle(width, color, alpha);
      g.fillStyle(color, alpha);
      for (const pl of fence.polylines) {
        if (pl.length < 4) continue;
        const pts = [];
        for (let i = 0; i < pl.length; i += 2) pts.push(new Phaser.Math.Vector2(pl[i], pl[i + 1]));
        g.strokePoints(pts, false);
        for (const pt of pts) g.fillCircle(pt.x, pt.y, width * 0.45);
      }
    }
    for (const [id, g] of this.fenceGfx) {
      if (!seen.has(id)) {
        g.destroy();
        this.fenceGfx.delete(id);
      }
    }
    this.drawGfx.clear();
    const d = this.match.draw;
    if (d.active && d.fence) {
      const color = 0x6b3f1d;
      this.drawGfx.lineStyle(width, color, 0.95);
      this.drawGfx.fillStyle(color, 0.95);
      for (const pl of d.fence.polylines) {
        if (pl.length < 4) continue;
        const pts = [];
        for (let i = 0; i < pl.length; i += 2) pts.push(new Phaser.Math.Vector2(pl[i], pl[i + 1]));
        this.drawGfx.strokePoints(pts, false);
      }
    }
  }

  private syncGuide(): void {
    const m = this.match;
    this.guideGfx.clear();
    if (m.outcome !== "playing") {
      this.hand.setVisible(false);
      return;
    }
    let guide = m.level.guide;
    if (m.level.tutorial === "ink" && m.tutorial.showInkGuide && m.level.inkGuide) {
      this.guideGfx.lineStyle(6, 0xffffff, 0.35);
      for (const stroke of m.level.inkGuide) {
        const pts = stroke.map((p) => new Phaser.Math.Vector2(p[0], p[1]));
        this.strokeDashed(this.guideGfx, pts);
      }
      return;
    }
    if (m.level.tutorial !== "draw" || m.tutorial.hideGuide || m.tutorial.sheepEntered >= 2) {
      if (!m.tutorial.firstInput && m.level.tutorial === "draw") {
        /* keep */
      } else {
        this.hand.setVisible(false);
        if (!(m.tutorial.recastGuideAt > 0 && m.tutorial.sheepEntered === 0)) return;
      }
    }
    if (m.tutorial.firstInput && m.tutorial.sheepEntered >= 2) {
      this.hand.setVisible(false);
      return;
    }
    if (m.tutorial.recastGuideAt > 0) {
      let sx = 0, sy = 0, c = 0;
      for (let i = 0; i < m.sheep.n; i++) {
        if (!m.sheep.isFree(i)) continue;
        sx += m.sheep.x[i];
        sy += m.sheep.y[i];
        c++;
      }
      if (c) {
        const cx = sx / c;
        const cy = sy / c;
        const fx = cx + m.driftX * 120;
        const fy = cy + m.driftY * 120;
        guide = [
          [fx - 80, fy + 40],
          [fx + 40, fy + 10],
          [m.pen.gx - 20, (m.pen.gy + m.pen.g2y) / 2],
        ];
      }
    }
    this.guideGfx.lineStyle(7, 0xffffff, 0.32);
    const pts = guide.map((p) => new Phaser.Math.Vector2(p[0], p[1]));
    this.strokeDashed(this.guideGfx, pts);
    if (!m.tutorial.firstInput) {
      const t = (this.time.now / 1200) % 1;
      const pos = pointAlong(guide, t);
      this.hand.setVisible(true).setPosition(pos.x + 18, pos.y + 18);
    } else {
      this.hand.setVisible(false);
    }

    if (m.level.tutorial === "draw" && m.time > 15 && m.time < 30 && m.tutorial.sheepEntered < m.sheep.n) {
      let far = -1;
      let farD = -1;
      const gx = (m.pen.gx + m.pen.g2x) / 2;
      const gy = (m.pen.gy + m.pen.g2y) / 2;
      for (let i = 0; i < m.sheep.n; i++) {
        if (!m.sheep.isFree(i)) continue;
        const d = Math.hypot(m.sheep.x[i] - gx, m.sheep.y[i] - gy);
        if (d > farD) {
          farD = d;
          far = i;
        }
      }
      if (far >= 0) {
        const x = m.sheep.x[far];
        const y = m.sheep.y[far] - 22;
        this.guideGfx.fillStyle(0xfff3a1, 0.9);
        this.guideGfx.fillTriangle(x, y, x - 6, y + 10, x + 6, y + 10);
      }
    }

    if (m.tutorial.wolfSlowMo) {
      const wolf = m.wolves.wolves.find((w) => w.tutorial);
      if (wolf && wolf.target >= 0) {
        const sx = wolf.x;
        const sy = wolf.y;
        const tx = m.sheep.x[wolf.target];
        const ty = m.sheep.y[wolf.target];
        const mx = (sx + tx) / 2;
        const my = (sy + ty) / 2;
        const [dx, dy] = perp(tx - sx, ty - sy);
        this.guideGfx.lineStyle(8, 0xffffff, 0.5);
        this.strokeDashed(this.guideGfx, [
          new Phaser.Math.Vector2(mx - dx * 40, my - dy * 40),
          new Phaser.Math.Vector2(mx + dx * 40, my + dy * 40),
        ]);
        this.hand.setVisible(true).setPosition(mx + 16, my + 16);
      }
    }
  }

  private strokeDashed(g: Phaser.GameObjects.Graphics, pts: Phaser.Math.Vector2[]): void {
    if (pts.length < 2) return;
    const dash = 14;
    const gap = 10;
    for (let i = 1; i < pts.length; i++) {
      const ax = pts[i - 1].x;
      const ay = pts[i - 1].y;
      const bx = pts[i].x;
      const by = pts[i].y;
      const len = Math.hypot(bx - ax, by - ay);
      const dx = (bx - ax) / len;
      const dy = (by - ay) / len;
      let d = 0;
      let draw = true;
      while (d < len) {
        const n = Math.min(draw ? dash : gap, len - d);
        if (draw) {
          g.beginPath();
          g.moveTo(ax + dx * d, ay + dy * d);
          g.lineTo(ax + dx * (d + n), ay + dy * (d + n));
          g.strokePath();
        }
        d += n;
        draw = !draw;
      }
    }
  }

  private syncHalo(): void {
    this.halo.clear();
    const m = this.match;
    const p = this.input.activePointer;
    if (!m.draw.active) return;
    const zoom = this.scale.displaySize.width / m.level.size[0];
    const r = m.tuning.draw.tipHaloCssPx / Math.max(0.2, zoom);
    const frac = m.ink / m.inkMax;
    this.halo.lineStyle(6, 0xffffff, 0.35);
    this.halo.strokeCircle(p.worldX, p.worldY, r);
    this.halo.lineStyle(6, 0xf4c95d, 0.95);
    this.halo.beginPath();
    this.halo.arc(p.worldX, p.worldY, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac, false);
    this.halo.strokePath();
  }
}

function pointAlong(guide: [number, number][], t: number): { x: number; y: number } {
  if (guide.length === 0) return { x: 0, y: 0 };
  let total = 0;
  const segs: number[] = [];
  for (let i = 1; i < guide.length; i++) {
    const d = Math.hypot(guide[i][0] - guide[i - 1][0], guide[i][1] - guide[i - 1][1]);
    segs.push(d);
    total += d;
  }
  let dist = t * total;
  for (let i = 1; i < guide.length; i++) {
    const d = segs[i - 1];
    if (dist <= d || i === guide.length - 1) {
      const k = d ? dist / d : 0;
      return {
        x: guide[i - 1][0] + (guide[i][0] - guide[i - 1][0]) * k,
        y: guide[i - 1][1] + (guide[i][1] - guide[i - 1][1]) * k,
      };
    }
    dist -= d;
  }
  return { x: guide[guide.length - 1][0], y: guide[guide.length - 1][1] };
}

function perp(x: number, y: number): [number, number] {
  const l = Math.hypot(x, y) || 1;
  return [-y / l, x / l];
}
