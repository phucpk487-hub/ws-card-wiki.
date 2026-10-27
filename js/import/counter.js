// Counter icon: a yellow fist in a round badge with a silver rim, printed under the level and cost rings (top-left) of Counter cards.
// It is recognised by the radial layout of the badge rather than by its picture: a solid yellow disc inside, a black outline,
// and a silver-white rim, with no yellow beyond the rim. That keeps it apart from yellow artwork and from the yellow diamond of an ALARM card,
// which has no round outline. All sizes are fractions of the card width, so it works at any resolution.
export const COUNTER_SLOT = { x: .092, y: .218, radius: .05 };

/** Radial profile of the badge at (cx, cy): fractions of yellow / dark / white pixels in rings around the centre. */
function profile(rgba, w, h, cx, cy, R) {
  const bins = [[0, .4], [.4, .7], [.7, .9], [.9, 1.1], [1.1, 1.5]];
  const n = bins.map(() => 0), yel = bins.map(() => 0), dark = bins.map(() => 0), white = bins.map(() => 0);
  const x0 = Math.max(0, Math.floor(cx - 1.5 * R)), x1 = Math.min(w, Math.ceil(cx + 1.5 * R)), y0 = Math.max(0, Math.floor(cy - 1.5 * R)), y1 = Math.min(h, Math.ceil(cy + 1.5 * R));
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const d = Math.hypot(x - cx, y - cy) / R, b = bins.findIndex(([lo, hi]) => d >= lo && d < hi);
    if (b < 0) continue;
    const i = (y * w + x) * 4, r = rgba[i] / 255, g = rgba[i + 1] / 255, bl = rgba[i + 2] / 255, mx = Math.max(r, g, bl), mn = Math.min(r, g, bl), s = mx ? (mx - mn) / mx : 0;
    n[b]++;
    if (mx < .3) dark[b]++;
    else if (mx > .68 && s < .25) white[b]++;
    else if (mx > .55 && s > .55) {
      const hue = (Math.atan2(Math.sqrt(3) * (g - bl), 2 * r - g - bl) * 180 / Math.PI + 360) % 360;
      if (hue > 36 && hue < 62) yel[b]++;
    }
  }
  const f = (a) => a.map((v, k) => (n[k] ? v / n[k] : 0));
  return { yel: f(yel), dark: f(dark), white: f(white) };
}

export function isCounterProfile(p) {
  return p.yel[0] >= .3 && p.yel[1] >= .15                      // solid yellow inside
    && p.yel[3] < .1 && p.yel[4] < .1                          // none beyond the rim (not yellow artwork)
    && p.dark[3] >= .12                                        // black outline of the round badge (the ALARM diamond has none)
    && p.white[2] + p.white[3] >= .25;                          // silver-white rim
}

export function hasCounterAt(rgba, w, h, cx, cy, R) {
  const step = Math.max(1, Math.round(R / 12));
  for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) if (isCounterProfile(profile(rgba, w, h, cx + i * step, cy + j * step, R))) return true;
  return false;
}

/** True when a portrait card shows the Counter icon. */
export function hasCounter(rgba, w, h) {
  if (w > h) return false;
  return hasCounterAt(rgba, w, h, COUNTER_SLOT.x * w, COUNTER_SLOT.y * h, COUNTER_SLOT.radius * w);
}
