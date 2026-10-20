export type Rect = { id: string; x: number; y: number; w: number; h: number };

/**
 * Deterministic binary slice/dice layout. Items are sorted by value (desc, then id)
 * and split into two halves of near-equal weight along the longer side.
 * Coordinates are in the caller's unit space (e.g. 100 x 75).
 */
export function layoutTreemap(items: { id: string; value: number }[], w: number, h: number): Rect[] {
  const sorted = items.filter((i) => i.value > 0).sort((a, b) => b.value - a.value || a.id.localeCompare(b.id));
  const out: Rect[] = [];
  const place = (list: typeof sorted, x: number, y: number, rw: number, rh: number) => {
    if (!list.length) return;
    if (list.length === 1) { out.push({ id: list[0].id, x, y, w: rw, h: rh }); return; }
    const total = list.reduce((s, i) => s + i.value, 0);
    let acc = 0, cut = 1, best = Infinity;
    for (let i = 0; i < list.length - 1; i += 1) {
      acc += list[i].value;
      const diff = Math.abs(total / 2 - acc);
      if (diff < best) { best = diff; cut = i + 1; }
    }
    const a = list.slice(0, cut), b = list.slice(cut);
    const ratio = a.reduce((s, i) => s + i.value, 0) / total;
    if (rw >= rh) { place(a, x, y, rw * ratio, rh); place(b, x + rw * ratio, y, rw * (1 - ratio), rh); }
    else { place(a, x, y, rw, rh * ratio); place(b, x, y + rh * ratio, rw, rh * (1 - ratio)); }
  };
  place(sorted, 0, 0, w, h);
  return out;
}

export function qoq(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null || previous === 0) return null;
  return (current - previous) / previous;
}

/** Diverging colour from the product palette: terracotta for decline, sage for growth. */
export function demandColor(change: number | null): string {
  if (change == null) return "transparent";
  const t = Math.min(1, Math.abs(change) / 0.25);
  return change < 0
    ? `hsl(16 ${42 + t * 30}% ${88 - t * 30}%)`
    : `hsl(150 ${22 + t * 20}% ${86 - t * 30}%)`;
}
