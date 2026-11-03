// Procedural 16x16 pixel-art pet. Pure functions (no DOM) so the same
// sprite can be drawn in the popup, the toolbar icon and the icon generator.

export const GRID = 16;

export const COLORS = {
  outline: '#2b2d42',
  body: '#7bdff2',
  shade: '#48b8d8',
  highlight: '#e8fbfd',
  cheek: '#ff8fab',
  eye: '#2b2d42',
  leaf: '#80ed99',
  leafDark: '#2d936c',
  tear: '#4895ef',
  flower: '#ffd166',
  eggBody: '#fff3d6',
  eggShade: '#f1d9a8',
  eggSpot: '#f6bd60',
  sickBody: '#c5e1a5',
  sickShade: '#9cc47a',
  ghostBody: '#f1f3f5',
  ghostShade: '#ced4da',
  ghostOutline: '#868e96',
};

const SHAPES = {
  egg: { cx: 7.5, cy: 8.5, rx: 4.7, ry: 5.8 },
  baby: { cx: 7.5, cy: 11, rx: 4.8, ry: 3.6 },
  child: { cx: 7.5, cy: 10, rx: 5.6, ry: 4.4 },
  teen: { cx: 7.5, cy: 9.6, rx: 6.2, ry: 4.8 },
  adult: { cx: 7.5, cy: 9.3, rx: 6.7, ry: 5.0 },
};

// Eye patterns are written for the left eye; the right eye mirrors dx.
const EYES = {
  open: [[0, -1], [0, 0]],
  happy: [[-1, 0], [0, -1], [1, 0]],
  closed: [[-1, 0], [0, 0]],
  dead: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
};

// Mouth patterns are relative to column 7 (the centre is between 7 and 8).
const MOUTHS = {
  smile: [[-1, 0], [0, 1], [1, 1], [2, 0]],
  neutral: [[0, 0], [1, 0]],
  frown: [[-1, 1], [0, 0], [1, 0], [2, 1]],
  wavy: [[-1, 0], [0, 1], [1, 0], [2, 1]],
  open: [[0, 0], [1, 0], [0, 1], [1, 1]],
};

const FACES = {
  happy: { eyes: 'happy', mouth: 'smile', cheeks: true },
  content: { eyes: 'open', mouth: 'smile', cheeks: true },
  meh: { eyes: 'open', mouth: 'neutral' },
  sad: { eyes: 'open', mouth: 'frown', tear: true },
  sick: { eyes: 'closed', mouth: 'wavy', sick: true },
  sleeping: { eyes: 'closed', mouth: 'neutral' },
  excited: { eyes: 'happy', mouth: 'open', cheeks: true },
  dead: { eyes: 'dead', mouth: 'neutral', ghost: true },
};

const inEllipse = (x, y, s) => ((x - s.cx) / s.rx) ** 2 + ((y - s.cy) / s.ry) ** 2 <= 1;

/**
 * Build the pixel list for a pet.
 * @param {{stage: string, mood: string, blink?: boolean, bob?: number}} opts
 * @returns {Array<{x:number,y:number,color:string}>}
 */
export function buildSprite({ stage = 'baby', mood = 'content', blink = false, bob = 0 }) {
  const shape = SHAPES[stage] || SHAPES.baby;
  const face = FACES[mood] || FACES.content;
  const isEgg = stage === 'egg';
  const pal = isEgg
    ? { body: COLORS.eggBody, shade: COLORS.eggShade, outline: COLORS.outline }
    : face.ghost
      ? { body: COLORS.ghostBody, shade: COLORS.ghostShade, outline: COLORS.ghostOutline }
      : face.sick
        ? { body: COLORS.sickBody, shade: COLORS.sickShade, outline: COLORS.outline }
        : { body: COLORS.body, shade: COLORS.shade, outline: COLORS.outline };

  const px = new Map();
  const set = (x, y, color) => {
    if (x >= 0 && x < GRID && y >= 0 && y < GRID) px.set(`${x},${y}`, color);
  };
  const isBody = (x, y) => x >= 0 && x < GRID && y >= 0 && y < GRID && inEllipse(x, y, shape);

  // Body, outline, rim shading and highlight.
  let topOutline = GRID;
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      if (isBody(x, y)) {
        const bottomRim = !isBody(x, y + 1) || !isBody(x + 1, y + 1) && x > shape.cx;
        set(x, y, bottomRim ? pal.shade : pal.body);
      } else if (isBody(x - 1, y) || isBody(x + 1, y) || isBody(x, y - 1) || isBody(x, y + 1)) {
        set(x, y, pal.outline);
        if (isBody(x, y + 1)) topOutline = Math.min(topOutline, y);
      }
    }
  }
  const hx = Math.round(shape.cx - shape.rx * 0.55);
  const hy = Math.round(shape.cy - shape.ry * 0.55);
  for (const [dx, dy] of [[0, 0], [1, 0], [0, 1]]) {
    if (isBody(hx + dx, hy + dy)) set(hx + dx, hy + dy, face.ghost ? '#ffffff' : COLORS.highlight);
  }

  if (isEgg) {
    for (const [x, y] of [[6, 6], [7, 6], [10, 9], [9, 10], [5, 11], [10, 12]]) {
      if (isBody(x, y)) set(x, y, COLORS.eggSpot);
    }
  } else {
    // Sprout grows on teens, flowers on adults.
    if ((stage === 'teen' || stage === 'adult') && !face.ghost) {
      const t = topOutline;
      set(7, t - 1, COLORS.leafDark);
      set(6, t - 2, COLORS.leaf);
      set(5, t - 2, COLORS.leaf);
      set(8, t - 2, COLORS.leaf);
      set(9, t - 3, COLORS.leaf);
      if (stage === 'adult') {
        set(7, t - 2, COLORS.leafDark);
        set(7, t - 3, COLORS.flower);
        set(6, t - 3, COLORS.flower);
      }
    }

    const eyeDX = shape.rx >= 5.5 ? 2.5 : 1.5;
    const eyeY = Math.round(shape.cy - shape.ry * 0.2);
    const lx = shape.cx - eyeDX;
    const rx = shape.cx + eyeDX;
    const eyeName = blink && face.eyes !== 'dead' ? 'closed' : face.eyes;
    for (const [dx, dy] of EYES[eyeName]) {
      set(lx + dx, eyeY + dy, COLORS.eye);
      set(rx - dx, eyeY + dy, COLORS.eye);
    }
    if (face.cheeks) {
      set(lx - 1, eyeY + 1, COLORS.cheek);
      set(rx + 1, eyeY + 1, COLORS.cheek);
    }
    if (face.tear && !blink) set(lx, eyeY + 1, COLORS.tear);
    const mouthY = eyeY + 2;
    for (const [dx, dy] of MOUTHS[face.mouth]) set(7 + dx, mouthY + dy, COLORS.eye);
  }

  const out = [];
  for (const [key, color] of px) {
    const [x, y] = key.split(',').map(Number);
    const ny = y + bob;
    if (ny >= 0 && ny < GRID) out.push({ x, y: ny, color });
  }
  return out;
}

/** Draw a sprite onto a 2D context (works with OffscreenCanvas too). */
export function drawSprite(ctx, opts, scale = 1, offsetX = 0, offsetY = 0) {
  for (const { x, y, color } of buildSprite(opts)) {
    ctx.fillStyle = color;
    ctx.fillRect(offsetX + x * scale, offsetY + y * scale, scale, scale);
  }
}
