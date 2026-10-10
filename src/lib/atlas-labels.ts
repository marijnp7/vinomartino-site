/** Place numbered labels without overlap; leader lines retain the real anchor.
 * Geometry is never moved/enlarged to make a small appellation easier to hit. */
export function layoutAtlasLabels(points: { x: number; y: number }[], box: number[], radius: number) {
  const [x, y, width, height] = box;
  const labels = points.map(p => ({ ...p }));
  for (let pass = 0; pass < 80; pass++) {
    let changed = false;
    for (let i = 0; i < labels.length; i++) {
      for (let j = i + 1; j < labels.length; j++) {
        const a = labels[i], b = labels[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const distance = Math.hypot(dx, dy);
        const minimum = radius * 2 + 8;
        if (distance >= minimum) continue;
        const ux = distance ? dx / distance : 0, uy = distance ? dy / distance : 1;
        const shift = (minimum - distance) / 2 + .1;
        a.x -= ux * shift; a.y -= uy * shift;
        b.x += ux * shift; b.y += uy * shift;
        changed = true;
      }
    }
    for (const p of labels) {
      p.x = Math.max(x + radius + 4, Math.min(x + width - radius - 4, p.x));
      p.y = Math.max(y + radius + 4, Math.min(y + height - radius - 4, p.y));
    }
    if (!changed) break;
  }
  return labels;
}
