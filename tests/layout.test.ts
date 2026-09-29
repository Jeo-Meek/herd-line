import { describe, expect, it } from "vitest";
import { PLAY_H, PLAY_W, MIN_TAP_CSS, MIN_FONT_CSS, computeLayout } from "../src/layout";

describe("responsive layout", () => {
  it("landscape 844x390 fills height and keeps the whole 960x720 playfield on screen", () => {
    const L = computeLayout(844, 390);
    expect(L.landscape).toBe(true);
    expect(L.zoom).toBeCloseTo(390 / PLAY_H, 5);
    expect(L.playScreenH).toBeCloseTo(390, 5);
    expect(L.playScreenW).toBeCloseTo(PLAY_W * (390 / PLAY_H), 5);
    expect(L.playScreenW).toBeLessThan(844);
    expect(L.playScreenX).toBeGreaterThan(80);
    expect(L.hud.tap).toBeGreaterThanOrEqual(MIN_TAP_CSS);
    expect(L.hud.font).toBeGreaterThanOrEqual(MIN_FONT_CSS);
    expect(L.hud.pauseX).toBeGreaterThan(20);
  });

  it("landscape 932x430 and 667x375 also height-fill", () => {
    for (const [w, h] of [
      [932, 430],
      [667, 375],
    ] as const) {
      const L = computeLayout(w, h);
      expect(L.landscape).toBe(true);
      expect(L.zoom).toBeCloseTo(h / PLAY_H, 5);
      expect(L.playScreenH).toBeCloseTo(h, 5);
      expect(L.playScreenW + L.playScreenX).toBeLessThanOrEqual(w + 0.01);
    }
  });

  it("portrait 390x844 fills width", () => {
    const L = computeLayout(390, 844);
    expect(L.landscape).toBe(false);
    expect(L.zoom).toBeCloseTo(390 / PLAY_W, 5);
    expect(L.playScreenW).toBeCloseTo(390, 5);
    expect(L.playScreenH).toBeLessThan(844);
    expect(L.hud.tap).toBe(MIN_TAP_CSS);
  });

  it("iPhone landscape notch insets keep HUD and playfield in the safe rect", () => {
    const L = computeLayout(844, 390, { top: 0, right: 21, bottom: 21, left: 47 });
    expect(L.playScreenX).toBeGreaterThanOrEqual(47 - 0.01);
    expect(L.playScreenX + L.playScreenW).toBeLessThanOrEqual(844 - 21 + 0.01);
    expect(L.hud.pauseX - L.hud.tap / 2).toBeGreaterThanOrEqual(47);
    expect(L.hud.countX).toBeLessThanOrEqual(844 - 21);
  });

  it("address-bar 844x310 still fits the full playfield and keeps 44px HUD", () => {
    const L = computeLayout(844, 310);
    expect(L.playScreenH).toBeCloseTo(310, 5);
    expect(L.playScreenW).toBeLessThanOrEqual(844);
    expect(L.hud.tap).toBe(MIN_TAP_CSS);
    expect(L.hud.font).toBeGreaterThanOrEqual(MIN_FONT_CSS);
  });
});
