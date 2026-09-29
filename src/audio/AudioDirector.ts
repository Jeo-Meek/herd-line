import Phaser from "phaser";
import { catalog, volumeFor, audioUrls } from "./catalog";
import { isMuted, setMuted } from "../save/Save";

const PENTATONIC = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26];
const BLEATS = ["sheep_bleat_01", "sheep_bleat_02", "sheep_bleat_03", "sheep_bleat_04"] as const;

export class AudioDirector {
  private game: Phaser.Game | null = null;
  private unlocked = false;
  private bgmStarted = false;
  private bgmLoading = false;
  private drawSnd: Phaser.Sound.BaseSound | null = null;
  private lastBleatAt = -9999;
  private bleatSlots: number[] = [];
  private lastIdleAt = -9999;
  private lastWindupAt = -9999;
  muted = false;

  attach(game: Phaser.Game): void {
    this.game = game;
    this.muted = isMuted();
    game.sound.pauseOnBlur = true;
    game.sound.mute = this.muted;
    if (game.sound.locked) {
      game.sound.once("unlocked", () => this.onUnlocked());
    }
  }

  queueSfx(loader: Phaser.Loader.LoaderPlugin): void {
    for (const key of catalog.sfx) {
      loader.audio(key, audioUrls(key));
    }
  }

  unlock(): void {
    this.unlocked = true;
    const snd = this.game?.sound;
    if (!snd) return;
    if (!snd.locked) this.onUnlocked();
  }

  private onUnlocked(): void {
    this.unlocked = true;
    this.ensureBgm();
  }

  setMute(muted: boolean): void {
    this.muted = muted;
    setMuted(muted);
    if (this.game) this.game.sound.mute = muted;
    if (muted) this.drawStop();
    else if (this.unlocked) this.ensureBgm();
  }

  toggleMute(): boolean {
    this.setMute(!this.muted);
    return this.muted;
  }

  click(): void {
    this.play("ui_click");
  }

  enter(combo: number): void {
    const step = PENTATONIC[Math.min(Math.max(combo, 1) - 1, PENTATONIC.length - 1)] ?? 0;
    this.play("pen_enter_pop", { rate: Math.pow(2, step / 12) });
  }

  baa(kind: "idle" | "panic" | "nudge" = "idle"): void {
    const now = performance.now();
    this.bleatSlots = this.bleatSlots.filter((t) => now - t < 900);
    if (this.bleatSlots.length >= catalog.bleat.maxVoices) return;
    if (now - this.lastBleatAt < catalog.bleat.gapMs) return;
    this.lastBleatAt = now;
    this.bleatSlots.push(now);
    let key: string;
    if (kind === "panic") key = Math.random() < 0.6 ? "sheep_bleat_03" : this.pick(BLEATS);
    else if (kind === "nudge") key = "sheep_bleat_01";
    else key = Math.random() < 0.5 ? "sheep_bleat_04" : this.pick(["sheep_bleat_01", "sheep_bleat_02", "sheep_bleat_04"]);
    this.play(key);
  }

  idleFlock(freeCount: number): void {
    if (freeCount <= 0 || this.muted || !this.unlocked) return;
    const now = performance.now();
    if (now - this.lastIdleAt < catalog.bleat.idleGapMs) return;
    const chance = Math.min(0.2, catalog.bleat.idleChance * Math.sqrt(freeCount / 8));
    if (Math.random() > chance) return;
    this.lastIdleAt = now;
    this.baa("idle");
  }

  fence(): void {
    this.play(this.pick(["fence_place_01", "fence_place_02"]));
  }

  shatter(): void {
    this.play(this.pick(["fence_break_01", "fence_break_02"]));
  }

  inkEmpty(): void {
    this.play("ink_empty_puff");
  }

  inkCapped(): void {
    this.play("pen_limit_click");
  }

  wolfWarn(): void {
    this.play("wolf_howl_warning");
  }

  wolfWindup(): void {
    const now = performance.now();
    if (now - this.lastWindupAt < 700) return;
    this.lastWindupAt = now;
    this.play("wolf_growl_charge");
  }

  wolfHit(): void {
    this.play(this.pick(["wolf_hit_fence_01", "wolf_hit_fence_02"]));
  }

  wolfGrab(): void {
    this.play("wolf_grab_sheep");
  }

  rescue(): void {
    this.play("sheep_rescue_ding");
  }

  coin(): void {
    this.play("wool_coin");
  }

  fail(): void {
    this.play("level_fail");
  }

  star(n: number): void {
    const key = n <= 0 ? "star_1" : n === 1 ? "star_2" : "star_3";
    this.play(key);
  }

  tick(): void {
    this.play("countdown_tick");
  }

  drawStart(): void {
    if (!this.canPlay()) return;
    const snd = this.game!.sound;
    if (!this.drawSnd) {
      try {
        this.drawSnd = snd.add("draw_line_loop", { loop: true, volume: volumeFor("draw_line_loop") });
      } catch {
        return;
      }
    }
    if (!this.drawSnd.isPlaying) this.drawSnd.play({ loop: true, volume: volumeFor("draw_line_loop"), rate: 1 });
  }

  drawMotion(speed: number): void {
    if (!this.drawSnd?.isPlaying) return;
    const rate = Phaser.Math.Clamp(0.85 + speed / 900, 0.8, 1.35);
    const rated = this.drawSnd as Phaser.Sound.BaseSound & { rate: number };
    rated.rate = rate;
  }

  drawStop(): void {
    if (this.drawSnd?.isPlaying) this.drawSnd.stop();
  }

  private ensureBgm(): void {
    if (this.muted || !this.unlocked || this.bgmStarted || !this.game) return;
    const snd = this.game.sound;
    if (snd.locked) return;
    if (this.game.cache.audio.exists(catalog.bgm)) {
      this.playBgm();
      return;
    }
    if (this.bgmLoading) return;
    const scene = this.game.scene.getScenes(true)[0];
    if (!scene) return;
    this.bgmLoading = true;
    scene.load.audio(catalog.bgm, audioUrls(catalog.bgm));
    scene.load.once("complete", () => {
      this.bgmLoading = false;
      this.playBgm();
    });
    scene.load.start();
  }

  private playBgm(): void {
    if (this.bgmStarted || this.muted || !this.game) return;
    try {
      const music = this.game.sound.add(catalog.bgm, { loop: true, volume: volumeFor(catalog.bgm) });
      music.play();
      this.bgmStarted = true;
    } catch {
      /* decode/play can fail in headless */
    }
  }

  private play(key: string, extra?: Phaser.Types.Sound.SoundConfig): void {
    if (!this.canPlay()) return;
    if (!this.game!.cache.audio.exists(key)) return;
    try {
      this.game!.sound.play(key, { volume: volumeFor(key), ...extra });
    } catch {
      /* ignore */
    }
  }

  private canPlay(): boolean {
    return !!this.game && this.unlocked && !this.muted && !this.game.sound.locked;
  }

  private pick(keys: readonly string[]): string {
    return keys[Math.floor(Math.random() * keys.length)] ?? keys[0]!;
  }
}

export const audio = new AudioDirector();
