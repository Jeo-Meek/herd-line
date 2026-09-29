import Phaser from "phaser";
import { platform } from "../platform/StubSDK";
import { audio } from "../audio/AudioDirector";
import { session } from "../session";
import type { Match } from "../sim/Match";
import { LEVELS } from "../data/levels";
import { computeLayout, readSafeInsets, type ViewLayout } from "../layout";

type ResultPayload = { win: boolean; stars: number; reason: string };

export class HUD extends Phaser.Scene {
  private inkBg!: Phaser.GameObjects.Rectangle;
  private inkFill!: Phaser.GameObjects.Rectangle;
  private countText!: Phaser.GameObjects.Text;
  private timeText!: Phaser.GameObjects.Text;
  private pauseBtn!: Phaser.GameObjects.Container;
  private muteBtn!: Phaser.GameObjects.Container;
  private muteLabel!: Phaser.GameObjects.Text;
  private overlay!: Phaser.GameObjects.Container;
  private warnArrow!: Phaser.GameObjects.Triangle;
  private showInk = false;
  private layout!: ViewLayout;
  private lastResult: ResultPayload | null = null;
  private overlayMode: "none" | "pause" | "result" = "none";

  constructor() {
    super("HUD");
  }

  create(): void {
    this.cameras.main.setBackgroundColor("rgba(0,0,0,0)");
    this.layout = computeLayout(this.scale.width, this.scale.height, readSafeInsets());
    this.applyHudCamera();

    const h = this.layout.hud;
    this.inkBg = this.add.rectangle(h.inkX, h.inkY, h.inkW, h.inkH + 4, 0x1f2a1c, 0.55).setOrigin(0, 0.5);
    this.inkFill = this.add.rectangle(h.inkX + 2, h.inkY, h.inkW - 4, h.inkH, 0xf4c95d, 1).setOrigin(0, 0.5);
    this.countText = this.add
      .text(h.countX, h.countY, "0/0", {
        fontFamily: "system-ui, sans-serif",
        fontSize: `${h.font}px`,
        color: "#fffef6",
        stroke: "#2a2418",
        strokeThickness: 5,
      })
      .setOrigin(1, 0);
    this.timeText = this.add
      .text(h.timeX, h.timeY, "", {
        fontFamily: "system-ui, sans-serif",
        fontSize: `${h.smallFont}px`,
        color: "#fffef6",
        stroke: "#2a2418",
        strokeThickness: 4,
      })
      .setOrigin(1, 0);

    this.pauseBtn = this.makeButton(h.pauseX, h.pauseY, h.tap, h.tap, "II", () => this.togglePause());
    this.muteBtn = this.makeMuteButton(h.muteX, h.muteY, h.tap);
    this.warnArrow = this.add.triangle(h.warnX, h.warnY, 0, 18, 12, 0, 24, 18, 0xe23d3d).setVisible(false).setDepth(5);
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
      else if (!this.resultVisible()) {
        this.overlayMode = "none";
        this.overlay.setVisible(false).removeAll(true);
      }
    });
    this.game.events.on("match-frame", () => this.refresh());
    this.scale.on("resize", this.onResize, this);
    this.events.once("shutdown", () => this.scale.off("resize", this.onResize, this));

    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      const overUi = this.hitUI(p.x, p.y);
      this.game.registry.set("hud-block", overUi);
    });
    this.input.on("pointerup", () => this.game.registry.set("hud-block", false));
  }

  private applyHudCamera(): void {
    const cam = this.cameras.main;
    cam.setViewport(0, 0, this.layout.viewW, this.layout.viewH);
    cam.setOrigin(0, 0);
    cam.setZoom(1);
    cam.setScroll(0, 0);
  }

  private onResize(): void {
    this.layout = computeLayout(this.scale.width, this.scale.height, readSafeInsets());
    this.applyHudCamera();
    const h = this.layout.hud;
    this.inkBg.setPosition(h.inkX, h.inkY).setSize(h.inkW, h.inkH + 4);
    this.inkFill.setPosition(h.inkX + 2, h.inkY);
    this.countText.setPosition(h.countX, h.countY).setFontSize(h.font);
    this.timeText.setPosition(h.timeX, h.timeY).setFontSize(h.smallFont);
    this.pauseBtn.setPosition(h.pauseX, h.pauseY);
    this.muteBtn.setPosition(h.muteX, h.muteY);
    this.warnArrow.setPosition(h.warnX, h.warnY);
    if (this.overlayMode === "pause") this.drawPause();
    else if (this.overlayMode === "result" && this.lastResult) {
      this.drawResult(this.lastResult.win, this.lastResult.stars, this.lastResult.reason);
    }
  }

  private onMatchReady(match: Match): void {
    this.overlay.setVisible(false).removeAll(true);
    this.overlayMode = "none";
    this.lastResult = null;
    this.showInk = match.level.tutorial !== "draw";
    this.onResize();
    this.refresh();
  }

  private refresh(): void {
    const m = session.match;
    if (!m) return;
    const h = this.layout.hud;
    const inkOn = this.showInk || m.tutorial.firstInput;
    this.inkBg.setVisible(inkOn);
    this.inkFill.setVisible(inkOn);
    this.inkFill.width = (h.inkW - 4) * (m.ink / Math.max(1, m.inkMax));
    this.inkFill.fillColor = m.ink / m.inkMax < 0.2 ? 0xe07a3d : 0xf4c95d;
    this.countText.setText(`${m.sheep.penned}/${m.sheep.n}`);
    if (m.level.timeLimit !== null) {
      const left = Math.max(0, m.level.timeLimit - m.time);
      const mm = Math.floor(left / 60);
      const ss = Math.floor(left % 60);
      this.timeText.setText(`${mm}:${ss.toString().padStart(2, "0")}`);
      this.timeText.setColor(left <= 10 ? "#ff6b6b" : "#fffef6");
      if (left <= 10 && m.outcome === "playing") {
        if (Math.floor(m.time * 2) !== Math.floor((m.time - 1 / 30) * 2)) audio.tick();
      }
    } else {
      this.timeText.setText("");
    }
    const warn = m.wolves.wolves.find((w) => w.state === 1);
    if (warn) {
      this.warnArrow.setVisible(true);
      const dir = warn.entryX < 200 ? -1 : warn.entryX > 760 ? 1 : 0;
      this.warnArrow.setPosition(h.warnX + dir * 48, h.warnY);
      this.warnArrow.setRotation(dir < 0 ? Math.PI / 2 : dir > 0 ? -Math.PI / 2 : 0);
    } else {
      this.warnArrow.setVisible(false);
    }
  }

  private togglePause(): void {
    const m = session.match;
    if (!m || m.outcome !== "playing") return;
    m.paused = !m.paused;
    if (m.paused) {
      platform.gameplayStop();
      this.drawPause();
    } else {
      platform.gameplayStart();
      this.overlayMode = "none";
      this.overlay.setVisible(false).removeAll(true);
    }
  }

  private drawPause(): void {
    this.overlayMode = "pause";
    this.overlay.setVisible(true).removeAll(true);
    const h = this.layout.hud;
    const dim = this.add.rectangle(h.overlayCx, h.overlayCy, this.layout.viewW, this.layout.viewH, 0x000000, 0.45);
    const card = this.add
      .rectangle(h.overlayCx, h.overlayCy, h.overlayW, 180, 0x24331f, 0.95)
      .setStrokeStyle(3, 0xf4c95d);
    const title = this.add
      .text(h.overlayCx, h.overlayCy - 50, "暂停", {
        fontFamily: "system-ui, sans-serif",
        fontSize: `${h.titleFont}px`,
        color: "#fffef6",
      })
      .setOrigin(0.5);
    this.overlay.add([dim, card, title]);
    this.overlay.add(this.makeButton(h.overlayCx, h.overlayCy + 24, h.btnW, h.btnH, "继续", () => this.togglePause()));
  }

  private makeMuteButton(x: number, y: number, size: number): Phaser.GameObjects.Container {
    const bg = this.add.rectangle(0, 0, size, size, 0x3d73c8, 1).setStrokeStyle(2, 0xd6e7ff);
    this.muteLabel = this.add
      .text(0, 0, audio.muted ? "静" : "声", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "18px",
        color: "#fffef6",
      })
      .setOrigin(0.5);
    const c = this.add.container(x, y, [bg, this.muteLabel]);
    c.setSize(size, size);
    c.setInteractive(new Phaser.Geom.Rectangle(-size / 2, -size / 2, size, size), Phaser.Geom.Rectangle.Contains);
    c.on("pointerover", () => bg.setFillStyle(0x4d86de));
    c.on("pointerout", () => bg.setFillStyle(0x3d73c8));
    c.on("pointerdown", (p: Phaser.Input.Pointer) => {
      this.game.registry.set("hud-block", true);
      p.event?.stopPropagation?.();
      audio.unlock();
      const muted = audio.toggleMute();
      this.muteLabel.setText(muted ? "静" : "声");
      if (!muted) audio.click();
    });
    return c;
  }

  private onResult(e: ResultPayload): void {
    this.lastResult = e;
    this.time.delayedCall(250, () => this.drawResult(e.win, e.stars, e.reason));
  }

  private drawResult(win: boolean, stars: number, reason: string): void {
    this.overlayMode = "result";
    this.overlay.setVisible(true).removeAll(true);
    const h = this.layout.hud;
    const dim = this.add.rectangle(h.overlayCx, h.overlayCy, this.layout.viewW, this.layout.viewH, 0x000000, 0.5);
    const cardH = Math.min(340, this.layout.viewH - 32);
    const card = this.add
      .rectangle(h.overlayCx, h.overlayCy, h.overlayW, cardH, 0x2b3a24, 0.96)
      .setStrokeStyle(4, win ? 0xf4c95d : 0xc45c4a);
    const title = this.add
      .text(h.overlayCx, h.overlayCy - cardH / 2 + 40, win ? "赶进去了" : reason === "f2" ? "羊不够了" : "时间到", {
        fontFamily: "system-ui, sans-serif",
        fontSize: `${h.titleFont}px`,
        color: "#fffef6",
      })
      .setOrigin(0.5);
    const m = session.match!;
    const stats = this.add
      .text(h.overlayCx, h.overlayCy - cardH / 2 + 78, `${m.sheep.penned} / ${m.sheep.n}`, {
        fontFamily: "system-ui, sans-serif",
        fontSize: `${h.font}px`,
        color: "#f4c95d",
      })
      .setOrigin(0.5);
    this.overlay.add([dim, card, title, stats]);
    for (let i = 0; i < 3; i++) {
      const star = this.add
        .text(h.overlayCx + (i - 1) * 64, h.overlayCy - 20, i < stars ? "★" : "☆", {
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
    const retry = this.makeButton(h.overlayCx, h.overlayCy + 70, h.btnW, h.btnH, "重试", () =>
      this.startLevel(session.levelIndex),
    );
    this.overlay.add(retry);
    const nextIndex = session.levelIndex + 1;
    const hasNext = LEVELS.some((l) => l.index === nextIndex);
    if (win && hasNext) {
      this.overlay.add(
        this.makeButton(h.overlayCx, h.overlayCy + 70 + h.btnH + 12, h.btnW, h.btnH, "下一关", () =>
          this.startLevel(nextIndex),
        ),
      );
    } else if (win) {
      this.overlay.add(
        this.makeButton(h.overlayCx, h.overlayCy + 70 + h.btnH + 12, h.btnW, h.btnH, "再来一局", () => this.startLevel(1)),
      );
    }
  }

  private async startLevel(index: number): Promise<void> {
    this.overlay.setVisible(false).removeAll(true);
    this.overlayMode = "none";
    await platform.midgame();
    session.levelIndex = index;
    const levelScene = this.scene.get("Level");
    levelScene.scene.restart({ levelIndex: index });
  }

  private makeButton(x: number, y: number, w: number, h: number, label: string, onClick: () => void): Phaser.GameObjects.Container {
    const font = this.layout?.hud.font ?? 18;
    const bg = this.add.rectangle(0, 0, w, h, 0x3d73c8, 1).setStrokeStyle(2, 0xd6e7ff);
    const text = this.add
      .text(0, 0, label, {
        fontFamily: "system-ui, sans-serif",
        fontSize: `${Math.max(16, font)}px`,
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
      audio.unlock();
      audio.click();
      onClick();
    });
    return c;
  }

  private hitUI(x: number, y: number): boolean {
    if (this.overlay.visible) return true;
    const tap = this.layout.hud.tap;
    if (Phaser.Math.Distance.Between(x, y, this.pauseBtn.x, this.pauseBtn.y) < tap) return true;
    if (Phaser.Math.Distance.Between(x, y, this.muteBtn.x, this.muteBtn.y) < tap) return true;
    return false;
  }

  private resultVisible(): boolean {
    return this.overlay.visible && session.match?.outcome !== "playing";
  }
}
