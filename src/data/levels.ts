import type { LevelDef } from "../types";

const ENTRIES = {
  E: { x: 948, y: 280 },
  N: { x: 520, y: 12 },
  W: { x: 12, y: 280 },
  S: { x: 480, y: 600 },
};

const PEN = {
  rect: [700, 300, 180, 260] as [number, number, number, number],
  gate: [
    [700, 380],
    [700, 460],
  ] as [[number, number], [number, number]],
};

const GUIDE: [number, number][] = [
  [90, 340],
  [180, 380],
  [320, 420],
  [480, 450],
  [620, 440],
  [690, 420],
];

export const LEVELS: LevelDef[] = [
  {
    id: "w1-01",
    index: 1,
    size: [960, 720],
    timeLimit: null,
    failsafeAt: 60,
    canFail: false,
    sheep: {
      spawns: [{ rect: [50, 70, 150, 170], count: 20 }],
      drift: { dir: [0.72, 0.7], speed: 15 },
    },
    pen: PEN,
    ink: { max: 200, regen: 40 },
    fence: { life: 12 },
    wolves: [],
    rocks: [],
    stars: [0.5, 0.75, 0.9],
    tutorial: "draw",
    guide: GUIDE,
    entries: ENTRIES,
  },
  {
    id: "w1-02",
    index: 2,
    size: [960, 720],
    timeLimit: 75,
    failsafeAt: null,
    canFail: true,
    sheep: {
      spawns: [
        { rect: [50, 70, 150, 170], count: 29 },
        { rect: [500, 250, 40, 40], count: 1 },
      ],
      drift: { dir: [0.55, 0.85], speed: 16 },
    },
    pen: PEN,
    ink: { max: 150, regen: 25 },
    fence: { life: 8 },
    wolves: [
      { t: 12, entry: "E", tutorial: true },
      { t: 50, entry: "E" },
    ],
    rocks: [],
    stars: [0.5, 0.7, 0.9],
    tutorial: "wolf",
    guide: GUIDE,
    entries: ENTRIES,
  },
  {
    id: "w1-03",
    index: 3,
    size: [960, 720],
    timeLimit: 80,
    failsafeAt: null,
    canFail: true,
    sheep: {
      spawns: [{ rect: [40, 60, 170, 180], count: 40 }],
      drift: { dir: [0.5, 0.87], speed: 18 },
    },
    pen: PEN,
    ink: { max: 100, regen: 10 },
    fence: { life: 7 },
    wolves: [
      { t: 20, entry: "E" },
      { t: 50, entry: "N" },
    ],
    rocks: [
      { x: 310, y: 210, r: 28 },
      { x: 250, y: 430, r: 32 },
      { x: 470, y: 520, r: 26 },
      { x: 560, y: 180, r: 30 },
      { x: 640, y: 560, r: 24 },
    ],
    stars: [0.6, 0.75, 0.9],
    tutorial: "ink",
    guide: GUIDE,
    inkGuide: [
      [
        [120, 300],
        [240, 360],
      ],
      [
        [280, 380],
        [400, 420],
      ],
    ],
    entries: ENTRIES,
  },
];

export function getLevel(index: number): LevelDef {
  const level = LEVELS.find((item) => item.index === index);
  if (!level) throw new Error(`Unknown level ${index}`);
  return level;
}
