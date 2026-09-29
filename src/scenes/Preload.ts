import Phaser from "phaser";
import { generateTextures } from "../assets/textures";
import { platform } from "../platform/StubSDK";

export class Preload extends Phaser.Scene {
  constructor() {
    super("Preload");
  }

  create(): void {
    generateTextures(this);
    platform.loadingDone();
    this.scene.launch("HUD");
    this.scene.start("Level", { levelIndex: 1 });
  }
}
