export class SpatialGrid {
  cell: number;
  cols: number;
  rows: number;
  counts: Int32Array;
  start: Int32Array;
  sorted: Int32Array;
  cellOf: Int32Array;
  n = 0;

  constructor(width: number, height: number, cell: number, cap: number) {
    this.cell = cell;
    this.cols = Math.ceil(width / cell);
    this.rows = Math.ceil(height / cell);
    const cells = this.cols * this.rows;
    this.counts = new Int32Array(cells);
    this.start = new Int32Array(cells);
    this.sorted = new Int32Array(cap);
    this.cellOf = new Int32Array(cap);
  }

  rebuild(x: Float32Array, y: Float32Array, alive: (i: number) => boolean, n: number): void {
    this.n = n;
    this.counts.fill(0);
    const cols = this.cols;
    const rows = this.rows;
    const cell = this.cell;
    for (let i = 0; i < n; i++) {
      if (!alive(i)) {
        this.cellOf[i] = -1;
        continue;
      }
      const cx = Math.min(cols - 1, Math.max(0, Math.floor(x[i] / cell)));
      const cy = Math.min(rows - 1, Math.max(0, Math.floor(y[i] / cell)));
      const c = cy * cols + cx;
      this.cellOf[i] = c;
      this.counts[c]++;
    }
    let acc = 0;
    for (let c = 0; c < this.counts.length; c++) {
      this.start[c] = acc;
      acc += this.counts[c];
    }
    const cursor = this.start.slice();
    for (let i = 0; i < n; i++) {
      const c = this.cellOf[i];
      if (c < 0) continue;
      this.sorted[cursor[c]++] = i;
    }
  }

  queryCells(px: number, py: number, fn: (idx: number) => boolean | void): void {
    const cols = this.cols;
    const rows = this.rows;
    const cx = Math.min(cols - 1, Math.max(0, Math.floor(px / this.cell)));
    const cy = Math.min(rows - 1, Math.max(0, Math.floor(py / this.cell)));
    for (let oy = -1; oy <= 1; oy++) {
      const yy = cy + oy;
      if (yy < 0 || yy >= rows) continue;
      for (let ox = -1; ox <= 1; ox++) {
        const xx = cx + ox;
        if (xx < 0 || xx >= cols) continue;
        const c = yy * cols + xx;
        const a = this.start[c];
        const b = a + this.counts[c];
        for (let k = a; k < b; k++) {
          if (fn(this.sorted[k]) === false) return;
        }
      }
    }
  }
}

export class SegmentGrid {
  cell: number;
  cols: number;
  rows: number;
  buckets: number[][];

  constructor(width: number, height: number, cell: number) {
    this.cell = cell;
    this.cols = Math.ceil(width / cell);
    this.rows = Math.ceil(height / cell);
    this.buckets = Array.from({ length: this.cols * this.rows }, () => []);
  }

  clear(): void {
    for (const b of this.buckets) b.length = 0;
  }

  insert(id: number, ax: number, ay: number, bx: number, by: number): void {
    const minx = Math.floor(Math.min(ax, bx) / this.cell);
    const maxx = Math.floor(Math.max(ax, bx) / this.cell);
    const miny = Math.floor(Math.min(ay, by) / this.cell);
    const maxy = Math.floor(Math.max(ay, by) / this.cell);
    for (let y = miny; y <= maxy; y++) {
      if (y < 0 || y >= this.rows) continue;
      for (let x = minx; x <= maxx; x++) {
        if (x < 0 || x >= this.cols) continue;
        const bucket = this.buckets[y * this.cols + x];
        if (bucket[bucket.length - 1] !== id) bucket.push(id);
      }
    }
  }

  query(px: number, py: number, into: Set<number>): void {
    const cols = this.cols;
    const rows = this.rows;
    const cx = Math.floor(px / this.cell);
    const cy = Math.floor(py / this.cell);
    for (let oy = -1; oy <= 1; oy++) {
      const yy = cy + oy;
      if (yy < 0 || yy >= rows) continue;
      for (let ox = -1; ox <= 1; ox++) {
        const xx = cx + ox;
        if (xx < 0 || xx >= cols) continue;
        const bucket = this.buckets[yy * cols + xx];
        for (let i = 0; i < bucket.length; i++) into.add(bucket[i]);
      }
    }
  }
}
