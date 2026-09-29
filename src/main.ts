import Phaser from "phaser";
import { Boot } from "./scenes/Boot";
import { Preload } from "./scenes/Preload";
import { Level } from "./scenes/Level";
import { HUD } from "./scenes/HUD";
import { bindVisualViewport, requestLandscapeFullscreen } from "./layout";

const parent = document.getElementById("game") ?? undefined;

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent,
  backgroundColor: "#8fc86a",
  width: "100%",
  height: "100%",
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.NO_CENTER,
    width: "100%",
    height: "100%",
    resizeInterval: 80,
    expandParent: true,
    fullscreenTarget: "game",
  },
  fps: { target: 60, smoothStep: true },
  input: {
    touch: { capture: true },
  },
  audio: {
    disableWebAudio: false,
  },
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
const game = new Phaser.Game(config);
bindVisualViewport(game);

let fullscreenTried = false;
const tryFs = (): void => {
  if (fullscreenTried) return;
  fullscreenTried = true;
  void requestLandscapeFullscreen();
  window.removeEventListener("pointerup", tryFs);
  window.removeEventListener("touchend", tryFs);
};
window.addEventListener("pointerup", tryFs, { passive: true });
window.addEventListener("touchend", tryFs, { passive: true });
