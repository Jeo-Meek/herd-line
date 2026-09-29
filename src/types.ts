export const STEP = 1 / 30;

export const SHEEP = {
  GRAZE: 0,
  WALK: 1,
  PANIC: 2,
  CARRIED: 3,
  ENTERING: 4,
  PENNED: 5,
  LOST: 6,
} as const;

export type SheepState = (typeof SHEEP)[keyof typeof SHEEP];

export const WOLF = {
  NONE: 0,
  WARN: 1,
  PATROL: 2,
  APPROACH: 3,
  WINDUP: 4,
  SPRINT: 5,
  CARRY: 6,
  BLOCKED: 7,
  RETREAT: 8,
} as const;

export type WolfState = (typeof WOLF)[keyof typeof WOLF];

export const WOLF_STATE_NAME: Record<number, string> = {
  [WOLF.NONE]: "NONE",
  [WOLF.WARN]: "WARN",
  [WOLF.PATROL]: "PATROL",
  [WOLF.APPROACH]: "APPROACH",
  [WOLF.WINDUP]: "WINDUP",
  [WOLF.SPRINT]: "SPRINT",
  [WOLF.CARRY]: "CARRY",
  [WOLF.BLOCKED]: "BLOCKED",
  [WOLF.RETREAT]: "RETREAT",
};

export type Vec2 = { x: number; y: number };

export type Tuning = typeof import("./data/tuning.json");

export type SpawnRect = {
  rect: [number, number, number, number];
  count: number;
};

export type WolfSpawn = {
  t: number;
  entry: string;
  tutorial?: boolean;
};

export type LevelDef = {
  id: string;
  index: number;
  size: [number, number];
  timeLimit: number | null;
  failsafeAt: number | null;
  canFail: boolean;
  sheep: {
    spawns: SpawnRect[];
    drift: { dir: [number, number]; speed: number };
  };
  pen: {
    rect: [number, number, number, number];
    gate: [[number, number], [number, number]];
  };
  ink: { max: number; regen: number };
  fence: { life: number };
  wolves: WolfSpawn[];
  rocks: { x: number; y: number; r: number }[];
  stars: [number, number, number];
  tutorial: "draw" | "wolf" | "ink";
  guide: [number, number][];
  inkGuide?: [number, number][][];
  entries: Record<string, Vec2>;
};

export type MatchEvent =
  | { type: "sheep-enter"; index: number; combo: number; x: number; y: number }
  | { type: "sheep-lost"; index: number }
  | { type: "sheep-rescued"; index: number; x: number; y: number }
  | { type: "ink-empty"; x: number; y: number }
  | { type: "ink-capped"; x: number; y: number }
  | { type: "fence-commit"; id: number; x: number; y: number }
  | { type: "fence-break"; x: number; y: number }
  | { type: "wolf-warn"; x: number; y: number; entry: string }
  | { type: "wolf-enter"; id: number }
  | { type: "wolf-windup"; id: number }
  | { type: "wolf-blocked"; id: number; x: number; y: number }
  | { type: "wolf-grab"; id: number; sheep: number }
  | { type: "result"; win: boolean; stars: number; reason: "clear" | "timeout" | "f2" | "failsafe" }
  | { type: "tutorial-first-input" }
  | { type: "stroke-rejected" };

export function starsForRate(rate: number, thresholds: [number, number, number]): number {
  if (rate >= thresholds[2]) return 3;
  if (rate >= thresholds[1]) return 2;
  if (rate >= thresholds[0]) return 1;
  return 0;
}

export function neededForOneStar(total: number, threshold: number): number {
  return Math.ceil(total * threshold);
}
