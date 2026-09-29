import Phaser from "phaser";
import { platform } from "../platform/StubSDK";
import { audio } from "../audio/AudioDirector";
import { session } from "../session";
import type { Match } from "../sim/Match";
import { LEVELS } from "../data/levels";

export class HUD extends Phaser.Scene {
  private inkBg!: Phaser.GameObjects.Rectangle;
  private inkFill!: Phaser.GameObjects.Rectangle;
  private countText!: Phaser.GameObjects.Text;
  private timeText!: Phaser.GameObjects.Text;
  private pauseBtn!: Phaser.GameObjects.Container;
  private overlay!: Phaser.GameObjects.Container;
  private warnArrow!: Phaser.GameObjects.Triangle;
  private showInk = false;
  private lastTick = false;

  constructor() {
    super("HUD");
  }

  create(): void {
    this.cameras.main.setBackgroundColor("rgba(0,0,0,0)");
    const w = 960;
    this.inkBg = this.add.rectangle(56, 28, 220, 18, 0x1f2a1c, 0.55).setOrigin(0, 0.5).setScrollFactor(0);
    this.inkFill = this.add.rectangle(58, 28, 216, 14, 0xf4c95d, 1).setOrigin(0, 0.5).setScrollFactor(0);
    this.countText = this.add
      .text(w - 24, 18, "0/0", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "22px",
        color: "#fffef6",
        stroke: "#2a2418",
        strokeThickness: 5,
      })
      .setOrigin(1, 0)
      .setScrollFactor(0);
    this.timeText = this.add
      .text(w - 24, 44, "", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "18px",
        color: "#fffef6",
        stroke: "#2a2418",
        strokeThickness: 4,
      })
      .setOrigin(1, 0)
      .setScrollFactor(0);

    this.pauseBtn = this.makeButton(24, 28, 44, 36, "❚❚", () => this.togglePause());
    this.warnArrow = this.add.triangle(480, 18, 0, 18, 12, 0, 24, 18, 0xe23d3d).setVisible(false).setDepth(5);
    this.overlay = this.add.container(0, 0).setDepth(50).setVisible(false);

    this.showInk = false;
    this.inkBg.setVisible(false);
    this.inkFill.setVisible(false);

    this.game.events.on("match-ready", this.onMatchReady, this);
    this.game.events.on("match-result", this.onResult, this);
    this.game.events.on("hud-show-ink", () => {
      this.showInk = true;
    });
    this.game.events.on("match-pause", (paused: boolean) => {
      if (paused && session.match?.outcome === "playing") this.drawPause();
      else if (!this.resultVisible()) this.overlay.setVisible(false);
    });
    this.game.events.on("match-frame", () => this.refresh());

    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      const overUi = this.hitUI(p.x, p.y);
      this.game.registry.set("hud-block", overUi);
    });
    this.input.on("pointerup", () => this.game.registry.set("hud-block", false));
  }

  private onMatchReady(match: Match): void {
    this.overlay.setVisible(false).removeAll(true);
    this.showInk = match.level.tutorial !== "draw";
    this.lastTick = false;
    this.refresh();
  }

  private refresh(): void {
    const m = session.match;
    if (!m) return;
    const inkOn = this.showInk || m.tutorial.firstInput;
    this.inkBg.setVisible(inkOn);
    this.inkFill.setVisible(inkOn);
    this.inkFill.width = 216 * (m.ink / Math.max(1, m.inkMax));
    this.inkFill.fillColor = m.ink / m.inkMax < 0.2 ? 0xe07a3d : 0xf4c95d;
    this.countText.setText(`${m.sheep.penned}/${m.sheep.n}`);
    if (m.level.timeLimit !== null) {
      const left = Math.max(0, m.level.timeLimit - m.time);
      const mm = Math.floor(left / 60);
      const ss = Math.floor(left % 60);
      this.timeText.setText(`${mm}:${ss.toString().padStart(2, "0")}`);
      this.timeText.setColor(left <= 10 ? "#ff6b6b" : "#fffef6");
      if (left <= 10 && m.outcome === "playing") {
        const k = Math.floor(left);
        if (!this.lastTick && k !== Math.floor(left + 0.05)) {
          /* tick handled below */
        }
        if (Math.floor(m.time * 2) !== Math.floor((m.time - 1 / 30) * 2)) audio.tick();
        this.lastTick = true;
      }
    } else {
      this.timeText.setText("");
    }
    const warn = m.wolves.wolves.find((w) => w.state === 1);
    if (warn) {
      this.warnArrow.setVisible(true);
      const cx = 480;
      const dir = warn.entryX < 200 ? -1 : warn.entryX > 760 ? 1 : 0;
      this.warnArrow.setPosition(cx + dir * 80, 16);
      this.warnArrow.setRotation(dir < 0 ? Math.PI / 2 : dir > 0 ? -Math.PI / 2 : 0);
    } else {
      this.warnArrow.setVisible(false);
    }
  }

  private togglePause(): void {
    const level = this.scene.get("Level") as Phaser.Scene & { match?: Match };
    const m = session.match;
    if (!m || m.outcome !== "playing") return;
    m.paused = !m.paused;
    if (m.paused) {
      platform.gameplayStop();
      this.drawPause();
    } else {
      platform.gameplayStart();
      this.overlay.setVisible(false).removeAll(true);
    }
    void level;
  }

  private drawPause(): void {
    this.overlay.setVisible(true).removeAll(true);
    const dim = this.add.rectangle(480, 360, 960, 720, 0x000000, 0.45);
    const card = this.add.rectangle(480, 340, 320, 180, 0x24331f, 0.95).setStrokeStyle(3, 0xf4c95d);
    const title = this.add
      .text(480, 290, "暂停", { fontFamily: "system-ui, sans-serif", fontSize: "28px", color: "#fffef6" })
      .setOrigin(0.5);
    this.overlay.add([dim, card, title]);
    this.overlay.add(this.makeButton(480, 360, 200, 44, "继续", () => this.togglePause()));
  }

  private onResult(e: { win: boolean; stars: number; reason: string }): void {
    const m = session.match;
    if (!m) return;
    this.time.delayedCall(250, () => this.drawResult(e.win, e.stars, e.reason));
  }

  private drawResult(win: boolean, stars: number, reason: string): void {
    this.overlay.setVisible(true).removeAll(true);
    const dim = this.add.rectangle(480, 360, 960, 720, 0x000000, 0.5);
    const card = this.add.rectangle(480, 340, 420, 340, 0x2b3a24, 0.96).setStrokeStyle(4, win ? 0xf4c95d : 0xc45c4a);
    const title = this.add
      .text(480, 210, win ? "赶进去了" : reason === "f2" ? "羊不够了" : "时间到", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "32px",
        color: "#fffef6",
      })
      .setOrigin(0.5);
    const m = session.match!;
    const stats = this.add
      .text(480, 258, `${m.sheep.penned} / ${m.sheep.n}`, {
        fontFamily: "system-ui, sans-serif",
        fontSize: "22px",
        color: "#f4c95d",
      })
      .setOrigin(0.5);
    this.overlay.add([dim, card, title, stats]);
    for (let i = 0; i < 3; i++) {
      const star = this.add
        .text(400 + i * 80, 300, i < stars ? "★" : "☆", {
          fontFamily: "system-ui, sans-serif",
          fontSize: "40px",
          color: i < stars ? "#ffd56a" : "#6b6658",
        })
        .setOrigin(0.5)
        .setScale(0.2);
      this.overlay.add(star);
      this.tweens.add({
        targets: star,
        scale: 1,
        duration: 280,
        delay: 180 * i,
        ease: "Back.Out",
        onStart: () => {
          if (i < stars) audio.star(i);
        },
      });
    }
    const retry = this.makeButton(480, 380, 280, 48, "重试", () => this.startLevel(session.levelIndex));
    this.overlay.add(retry);
    const nextIndex = session.levelIndex + 1;
    const hasNext = LEVELS.some((l) => l.index === nextIndex);
    if (win && hasNext) {
      this.overlay.add(this.makeButton(480, 440, 280, 48, "下一关", () => this.startLevel(nextIndex)));
    } else if (win) {
      this.overlay.add(this.makeButton(480, 440, 280, 48, "再来一局", () => this.startLevel(1)));
    }
  }

  private async startLevel(index: number): Promise<void> {
    this.overlay.setVisible(false).removeAll(true);
    await platform.midgame();
    session.levelIndex = index;
    const levelScene = this.scene.get("Level");
    levelScene.scene.restart({ levelIndex: index });
  }

  private makeButton(x: number, y: number, w: number, h: number, label: string, onClick: () => void): Phaser.GameObjects.Container {
    const bg = this.add.rectangle(0, 0, w, h, 0x3d73c8, 1).setStrokeStyle(2, 0xd6e7ff);
    const text = this.add
      .text(0, 0, label, {
        fontFamily: "system-ui, sans-serif",
        fontSize: "20px",
        color: "#fffef6",
      })
      .setOrigin(0.5);
    const c = this.add.container(x, y, [bg, text]);
    c.setSize(w, h);
    c.setInteractive(new Phaser.Geom.Rectangle(-w / 2, -h / 2, w, h), Phaser.Geom.Rectangle.Contains);
    c.on("pointerover", () => bg.setFillStyle(0x4d86de));
    c.on("pointerout", () => bg.setFillStyle(0x3d73c8));
    c.on("pointerdown", (p: Phaser.Input.Pointer) => {
      this.game.registry.set("hud-block", true);
      p.event?.stopPropagation?.();
      onClick();
    });
    return c;
  }

  private hitUI(x: number, y: number): boolean {
    if (this.overlay.visible) return true;
    if (Phaser.Math.Distance.Between(x, y, this.pauseBtn.x, this.pauseBtn.y) < 40) return true;
    return false;
  }

  private resultVisible(): boolean {
    return this.overlay.visible && session.match?.outcome !== "playing";
  }
}
