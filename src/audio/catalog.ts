import catalog from "../data/audio.json";

export type AudioCatalog = typeof catalog;

export function volumeFromLufs(
  lufs: number,
  target = catalog.targetLufs,
  base = catalog.baseVolume,
  cap = catalog.maxVolume,
): number {
  const boost = Math.pow(10, (target - lufs) / 20);
  return Math.min(cap, Math.max(0.04, base * boost));
}

export function volumeFor(key: string): number {
  if (key === catalog.bgm) return catalog.bgmVolume;
  if (key === "draw_line_loop") return catalog.drawVolume;
  const lufs = (catalog.lufs as Record<string, number>)[key];
  if (lufs === undefined) return catalog.baseVolume;
  return volumeFromLufs(lufs);
}

export function audioUrls(key: string): string[] {
  const base = (typeof import.meta !== "undefined" && import.meta.env?.BASE_URL) || "/";
  const root = `${base}audio/${key}`;
  return catalog.formats.map((ext) => `${root}.${ext}`);
}

export { catalog };
