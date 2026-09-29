import Phaser from "phaser";
import { generateTextures } from "../assets/textures";
import { platform } from "../platform/StubSDK";
import { audio } from "../audio/AudioDirector";

export class Preload extends Phaser.Scene {
  constructor() {
    super("Preload");
  }

  preload(): void {
    audio.attach(this.game);
    audio.queueSfx(this.load);
  }

  create(): void {
    generateTextures(this);
    platform.loadingDone();
    this.scene.launch("HUD");
    this.scene.start("Level", { levelIndex: 1 });
  }
}
