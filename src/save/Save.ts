export type SaveData = {
  stars: Record<string, number>;
  lastLevel: number;
  muted: boolean;
};

const KEY = "herd-line-save";

export function loadSave(): SaveData {
  const fallback: SaveData = { stars: {}, lastLevel: 1, muted: false };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    return {
      stars: parsed.stars ?? {},
      lastLevel: parsed.lastLevel ?? 1,
      muted: parsed.muted === true,
    };
  } catch {
    return fallback;
  }
}

export function writeSave(data: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // private mode: keep in-memory only
  }
}

export function recordStars(levelId: string, stars: number): SaveData {
  const data = loadSave();
  data.stars[levelId] = Math.max(data.stars[levelId] ?? 0, stars);
  writeSave(data);
  return data;
}

export function isMuted(): boolean {
  return loadSave().muted;
}

export function setMuted(muted: boolean): SaveData {
  const data = loadSave();
  data.muted = muted;
  writeSave(data);
  return data;
}
