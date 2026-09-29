export class ObstacleGrid {
  cell: number;
  cols: number;
  rows: number;
  data: Uint8Array;
  rocks: { x: number; y: number; r: number }[];

  constructor(width: number, height: number, cell: number) {
    this.cell = cell;
    this.cols = Math.ceil(width / cell);
    this.rows = Math.ceil(height / cell);
    this.data = new Uint8Array(this.cols * this.rows);
    this.rocks = [];
  }

  clear(): void {
    this.data.fill(0);
    this.rocks = [];
  }

  addRock(x: number, y: number, r: number): void {
    this.rocks.push({ x, y, r });
    const cell = this.cell;
    const minx = Math.max(0, Math.floor((x - r) / cell));
    const maxx = Math.min(this.cols - 1, Math.floor((x + r) / cell));
    const miny = Math.max(0, Math.floor((y - r) / cell));
    const maxy = Math.min(this.rows - 1, Math.floor((y + r) / cell));
    const r2 = r * r;
    for (let cy = miny; cy <= maxy; cy++) {
      for (let cx = minx; cx <= maxx; cx++) {
        const ccx = (cx + 0.5) * cell;
        const ccy = (cy + 0.5) * cell;
        if ((ccx - x) * (ccx - x) + (ccy - y) * (ccy - y) <= r2) {
          this.data[cy * this.cols + cx] = 1;
        }
      }
    }
  }

  blocked(x: number, y: number): boolean {
    const cx = Math.floor(x / this.cell);
    const cy = Math.floor(y / this.cell);
    if (cx < 0 || cy < 0 || cx >= this.cols || cy >= this.rows) return true;
    return this.data[cy * this.cols + cx] !== 0;
  }

  sampleForce(
    x: number,
    y: number,
    radius: number,
    weight: number,
    out: { x: number; y: number },
  ): void {
    out.x = 0;
    out.y = 0;
    const cell = this.cell;
    const cx = Math.floor(x / cell);
    const cy = Math.floor(y / cell);
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const xx = cx + ox;
        const yy = cy + oy;
        if (xx < 0 || yy < 0 || xx >= this.cols || yy >= this.rows) continue;
        if (this.data[yy * this.cols + xx] === 0) continue;
        const ccx = (xx + 0.5) * cell;
        const ccy = (yy + 0.5) * cell;
        const dx = x - ccx;
        const dy = y - ccy;
        const d = Math.hypot(dx, dy) || 0.001;
        if (d < radius) {
          const s = weight * (1 - d / radius);
          out.x += (dx / d) * s;
          out.y += (dy / d) * s;
        }
      }
    }
    for (const rock of this.rocks) {
      const dx = x - rock.x;
      const dy = y - rock.y;
      const d = Math.hypot(dx, dy) || 0.001;
      const lim = rock.r + radius * 0.35;
      if (d < lim) {
        const s = weight * (1 - d / lim);
        out.x += (dx / d) * s;
        out.y += (dy / d) * s;
      }
    }
  }

  resolvePoint(x: number, y: number, r: number): { x: number; y: number } {
    let px = x;
    let py = y;
    for (const rock of this.rocks) {
      const dx = px - rock.x;
      const dy = py - rock.y;
      const d = Math.hypot(dx, dy) || 0.001;
      const need = rock.r + r;
      if (d < need) {
        px = rock.x + (dx / d) * need;
        py = rock.y + (dy / d) * need;
      }
    }
    return { x: px, y: py };
  }
}
