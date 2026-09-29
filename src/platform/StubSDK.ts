import type { PlatformSDK } from "./types";

const TAG = "[PlatformSDK]";

export class StubPlatformSDK implements PlatformSDK {
  private last: "start" | "stop" | null = null;
  private adPlaying = false;
  private muted = false;

  async init(): Promise<void> {
    this.log("init");
  }

  loadingDone(): void {
    this.log("loadingDone");
  }

  gameplayStart(): void {
    if (this.adPlaying) {
      this.log("gameplayStart skipped (ad playing)");
      return;
    }
    if (this.last === "start") {
      this.log("gameplayStart skipped (already started)");
      return;
    }
    this.last = "start";
    this.log("gameplayStart");
  }

  gameplayStop(): void {
    if (this.adPlaying) {
      this.log("gameplayStop skipped (ad playing)");
      return;
    }
    if (this.last === "stop") {
      this.log("gameplayStop skipped (already stopped)");
      return;
    }
    this.last = "stop";
    this.log("gameplayStop");
  }

  async midgame(): Promise<void> {
    this.log("midgame (stub, no ad)");
  }

  async rewarded(): Promise<boolean> {
    this.log("rewarded (stub, no ad) -> false");
    return false;
  }

  celebrate(): void {
    this.log("celebrate");
  }

  measure(cat: string, what: string, action: string): void {
    this.log(`measure ${cat} ${what} ${action}`);
  }

  onMuteChange(cb: (muted: boolean) => void): void {
    cb(this.muted);
  }

  private log(msg: string): void {
    console.info(`${TAG} ${msg}`);
  }
}

export const platform = new StubPlatformSDK();
