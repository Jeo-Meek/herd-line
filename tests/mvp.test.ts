import { describe, expect, it } from "vitest";
import { neededForOneStar, starsForRate } from "../src/types";
import { nearestOnSegment, segmentsIntersect, simplifyRdp } from "../src/sim/geom";
import { getLevel } from "../src/data/levels";
import { Match, runHeadless } from "../src/sim/Match";
import { SHEEP } from "../src/types";

describe("star rating", () => {
  const stars: [number, number, number] = [0.5, 0.7, 0.9];
  it("matches GDD §2.1 table", () => {
    expect(starsForRate(0.49, stars)).toBe(0);
    expect(starsForRate(0.5, stars)).toBe(1);
    expect(starsForRate(0.7, stars)).toBe(2);
    expect(starsForRate(0.9, stars)).toBe(3);
    expect(starsForRate(1, stars)).toBe(3);
  });
  it("neededForOneStar uses ceil", () => {
    expect(neededForOneStar(30, 0.5)).toBe(15);
    expect(neededForOneStar(40, 0.6)).toBe(24);
  });
});

describe("segment geometry", () => {
  it("clamps nearest point to the segment (not the infinite line)", () => {
    const out = { x: 0, y: 0, t: 0, d: 0 };
    nearestOnSegment(100, 10, 0, 0, 10, 0, out);
    expect(out.x).toBeCloseTo(10);
    expect(out.y).toBeCloseTo(0);
    expect(out.t).toBe(1);
  });

  it("detects segment intersection", () => {
    expect(segmentsIntersect(0, 0, 10, 10, 0, 10, 10, 0)).toBe(true);
    expect(segmentsIntersect(0, 0, 4, 0, 5, -1, 5, 1)).toBe(false);
  });

  it("RDP keeps endpoints", () => {
    const pts = [0, 0, 5, 0.2, 10, 0];
    const out = simplifyRdp(pts, 1, 32);
    expect(out[0]).toBe(0);
    expect(out[1]).toBe(0);
    expect(out[out.length - 2]).toBe(10);
    expect(out[out.length - 1]).toBe(0);
  });
});

describe("headless rounds", () => {
  it("L2 with zero input fails the 1-star threshold", () => {
    const m = runHeadless(getLevel(2), 76);
    expect(m.outcome).toBe("lose");
    expect(m.rate()).toBeLessThan(getLevel(2).stars[0]);
  });

  it("L3 with zero input fails", () => {
    const m = runHeadless(getLevel(3), 81);
    expect(m.outcome).toBe("lose");
    expect(m.rate()).toBeLessThan(getLevel(3).stars[0]);
  });

  it("short strokes are rejected and refund ink", () => {
    const m = new Match(getLevel(1), 3);
    const ink = m.ink;
    m.beginStroke(80, 80, 1, false);
    m.addStrokePoint(90, 88);
    m.endStroke();
    expect(m.fences.fences.filter((f) => !f.immortal).length).toBe(0);
    expect(m.ink).toBeCloseTo(ink, 3);
  });

  it("a guiding fence lets L1 sheep enter the pen", () => {
    let strokes = 0;
    const m = runHeadless(getLevel(1), 30, (match, t) => {
      if (strokes === 0 || (strokes === 1 && t >= 8)) {
        strokes++;
        match.beginStroke(4, 260, 1, false);
        for (let x = 20; x <= 688; x += 8) {
          const y = 260 + (x - 4) * (180 / 684);
          match.addStrokePoint(x, y);
        }
        match.endStroke();
      }
    });
    expect(m.sheep.penned).toBeGreaterThanOrEqual(3);
  });

  it("pen enter works when a sheep crosses the gate", () => {
    const m = new Match(getLevel(1), 1);
    const i = 0;
    m.sheep.x[i] = 680;
    m.sheep.y[i] = 420;
    m.sheep.px[i] = 680;
    m.sheep.py[i] = 420;
    m.sheep.vx[i] = 90;
    m.sheep.vy[i] = 0;
    m.sheep.state[i] = SHEEP.WALK;
    for (let s = 0; s < 60; s++) m.step(1 / 30);
    expect(m.sheep.penned).toBeGreaterThan(0);
  });

  it("F2 does not fire while the last saveable sheep is still carried on-map", () => {
    const m = new Match(getLevel(2), 9);
    const need = Math.ceil(m.sheep.n * m.level.stars[0]);
    let marked = 0;
    for (let i = 0; i < m.sheep.n; i++) {
      if (m.sheep.saveable() <= need) break;
      m.sheep.state[i] = SHEEP.LOST;
      m.sheep.lost++;
      marked++;
    }
    const victim = m.sheep.n - 1;
    m.sheep.state[victim] = SHEEP.CARRIED;
    m.sheep.lost = Math.max(0, m.sheep.lost - 1);
    expect(marked).toBeGreaterThan(0);
    m.step(1 / 30);
    expect(m.outcome).toBe("playing");
    m.sheep.markLost(victim);
    m.step(1 / 30);
    expect(m.outcome).toBe("lose");
    expect(m.reason).toBe("f2");
  });
});
