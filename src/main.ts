import Phaser from "phaser";
import { Boot } from "./scenes/Boot";
import { Preload } from "./scenes/Preload";
import { Level } from "./scenes/Level";
import { HUD } from "./scenes/HUD";

const parent = document.getElementById("game") ?? undefined;

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent,
  backgroundColor: "#3d6b3a",
  width: 960,
  height: 720,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 960,
    height: 720,
  },
  fps: { target: 60, smoothStep: true },
  input: {
    touch: { capture: true },
  },
  disableContextMenu: true,
  scene: [Boot, Preload, Level, HUD],
};

function shieldKeys(): void {
  window.addEventListener(
    "keydown",
    (e) => {
      if (e.code === "Space" || e.code === "ArrowUp" || e.code === "ArrowDown" || e.code === "ArrowLeft" || e.code === "ArrowRight") {
        e.preventDefault();
      }
    },
    { passive: false },
  );
  window.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
    },
    { passive: false },
  );
  document.addEventListener(
    "gesturestart",
    (e) => {
      e.preventDefault();
    },
    { passive: false },
  );
  document.addEventListener(
    "touchmove",
    (e) => {
      if (e.touches.length > 1) e.preventDefault();
    },
    { passive: false },
  );
}

shieldKeys();
new Phaser.Game(config);
