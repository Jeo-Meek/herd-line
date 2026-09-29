import { describe, expect, it } from "vitest";
import { catalog, volumeFor, volumeFromLufs, audioUrls } from "../src/audio/catalog";

describe("audio catalog", () => {
  it("boosts quiet transients toward the -15 LUFS bed", () => {
    const bed = volumeFromLufs(-15);
    const place = volumeFor("fence_place_01");
    const brk = volumeFor("fence_break_01");
    const click = volumeFor("pen_limit_click");
    const tick = volumeFor("countdown_tick");
    expect(place).toBeGreaterThan(bed * 2);
    expect(brk).toBeGreaterThan(bed * 1.8);
    expect(click).toBeGreaterThan(bed * 2);
    expect(tick).toBeGreaterThan(bed * 2);
    expect(place).toBeLessThanOrEqual(catalog.maxVolume);
  });

  it("prefers ogg then m4a under the /herd-line/ base", () => {
    const urls = audioUrls("sheep_bleat_01");
    expect(urls[0]).toMatch(/\/audio\/sheep_bleat_01\.ogg$/);
    expect(urls[1]).toMatch(/\/audio\/sheep_bleat_01\.m4a$/);
    expect(urls.some((u) => u.endsWith(".mp3"))).toBe(false);
  });

  it("keeps BGM quieter than the sfx bed", () => {
    expect(volumeFor("bgm_meadow_loop")).toBeLessThan(volumeFromLufs(-15) * 1.2);
  });
});
