import Phaser from "phaser";
import { platform } from "../platform/StubSDK";

export class Boot extends Phaser.Scene {
  constructor() {
    super("Boot");
  }

  create(): void {
    void platform.init().finally(() => {
      this.scene.start("Preload");
    });
  }
}
