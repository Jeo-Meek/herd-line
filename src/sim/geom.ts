export const EPS = 1e-8;

export function clamp(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function hypot2(dx: number, dy: number): number {
  return dx * dx + dy * dy;
}

export function len(x: number, y: number): number {
  return Math.hypot(x, y);
}

export function norm(x: number, y: number): [number, number] {
  const d = Math.hypot(x, y);
  if (d < EPS) return [0, 0];
  return [x / d, y / d];
}

export function dot(ax: number, ay: number, bx: number, by: number): number {
  return ax * bx + ay * by;
}

export function cross(ax: number, ay: number, bx: number, by: number): number {
  return ax * by - ay * bx;
}

export function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(bx - ax, by - ay);
}

/** Clamped nearest point on segment AB. Phaser's Geom.Line.GetNearestPoint is infinite. */
export function nearestOnSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  out: { x: number; y: number; t: number; d: number },
): void {
  const abx = bx - ax;
  const aby = by - ay;
  const len2 = abx * abx + aby * aby;
  let t = 0;
  if (len2 > EPS) {
    t = clamp(((px - ax) * abx + (py - ay) * aby) / len2, 0, 1);
  }
  const x = ax + abx * t;
  const y = ay + aby * t;
  out.x = x;
  out.y = y;
  out.t = t;
  out.d = Math.hypot(px - x, py - y);
}

export function segmentsIntersect(
  a1x: number,
  a1y: number,
  a2x: number,
  a2y: number,
  b1x: number,
  b1y: number,
  b2x: number,
  b2y: number,
  out?: { x: number; y: number; t: number; u: number },
): boolean {
  const rxx = a2x - a1x;
  const ryy = a2y - a1y;
  const sxx = b2x - b1x;
  const syy = b2y - b1y;
  const denom = rxx * syy - ryy * sxx;
  if (Math.abs(denom) < EPS) return false;
  const dx = b1x - a1x;
  const dy = b1y - a1y;
  const t = (dx * syy - dy * sxx) / denom;
  const u = (dx * ryy - dy * rxx) / denom;
  if (t < 0 || t > 1 || u < 0 || u > 1) return false;
  if (out) {
    out.x = a1x + t * rxx;
    out.y = a1y + t * ryy;
    out.t = t;
    out.u = u;
  }
  return true;
}

export function pointInRect(
  x: number,
  y: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
): boolean {
  return x >= rx && y >= ry && x <= rx + rw && y <= ry + rh;
}

export function expandRect(
  rx: number,
  ry: number,
  rw: number,
  rh: number,
  pad: number,
): [number, number, number, number] {
  return [rx - pad, ry - pad, rw + pad * 2, rh + pad * 2];
}

export function segmentHitsRect(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
): boolean {
  if (pointInRect(ax, ay, rx, ry, rw, rh) || pointInRect(bx, by, rx, ry, rw, rh)) return true;
  const x2 = rx + rw;
  const y2 = ry + rh;
  return (
    segmentsIntersect(ax, ay, bx, by, rx, ry, x2, ry) ||
    segmentsIntersect(ax, ay, bx, by, x2, ry, x2, y2) ||
    segmentsIntersect(ax, ay, bx, by, x2, y2, rx, y2) ||
    segmentsIntersect(ax, ay, bx, by, rx, y2, rx, ry)
  );
}

export function polylineLength(pts: number[]): number {
  let s = 0;
  for (let i = 2; i < pts.length; i += 2) {
    s += Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]);
  }
  return s;
}

function rdpRec(
  pts: number[],
  a: number,
  b: number,
  eps: number,
  keep: boolean[],
): void {
  const ax = pts[a * 2];
  const ay = pts[a * 2 + 1];
  const bx = pts[b * 2];
  const by = pts[b * 2 + 1];
  let maxD = -1;
  let maxI = -1;
  const tmp = TMP_NEAR;
  for (let i = a + 1; i < b; i++) {
    nearestOnSegment(pts[i * 2], pts[i * 2 + 1], ax, ay, bx, by, tmp);
    if (tmp.d > maxD) {
      maxD = tmp.d;
      maxI = i;
    }
  }
  if (maxD > eps && maxI >= 0) {
    rdpRec(pts, a, maxI, eps, keep);
    rdpRec(pts, maxI, b, eps, keep);
  } else {
    keep[a] = true;
    keep[b] = true;
  }
}

const TMP_NEAR = { x: 0, y: 0, t: 0, d: 0 };

export function simplifyRdp(pts: number[], epsilon: number, maxVerts: number): number[] {
  if (pts.length <= 4) return pts.slice();
  let eps = epsilon;
  let out = pts.slice();
  for (let pass = 0; pass < 6; pass++) {
    const n = out.length / 2;
    const keep = new Array<boolean>(n).fill(false);
    rdpRec(out, 0, n - 1, eps, keep);
    const next: number[] = [];
    for (let i = 0; i < n; i++) {
      if (keep[i]) {
        next.push(out[i * 2], out[i * 2 + 1]);
      }
    }
    if (next.length < 4) return out;
    if (next.length / 2 <= maxVerts || pass === 5) return next;
    eps *= 2;
    out = next;
  }
  return out;
}

export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
