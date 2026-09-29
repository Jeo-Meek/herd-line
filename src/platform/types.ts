export interface PlatformSDK {
  init(): Promise<void>;
  loadingDone(): void;
  gameplayStart(): void;
  gameplayStop(): void;
  midgame(): Promise<void>;
  rewarded(): Promise<boolean>;
  celebrate?(): void;
  measure?(cat: string, what: string, action: string): void;
  onMuteChange?(cb: (muted: boolean) => void): void;
}
