// Lookalike track objects: hand-built stand-ins for MRSIM's own meshes.
//
// The game's meshes and artwork are the developer's, so the published editor
// does not ship them. These are original, simple models: the sizes match the
// game parts, the colours are the game's own material values
// (DroneTrackMaterials.xml and the object files), and the fabric art is a
// generic pattern drawn here — no logos or sponsor art.
//
// Every builder returns a THREE.Group in the model's own MRSIM frame
// (Z up, metres), the same frame the game mesh uses, so it drops in where
// the real mesh would go.

let T = null;                       // the THREE namespace, set on first call
const mats = new Map();

const lin = (r, g, b) => new T.Color().setRGB(r, g, b, T.LinearSRGBColorSpace);
function pbr(key, rgb, rough, metal = 0, extra = {}) {
  if (!mats.has(key)) {
    mats.set(key, new T.MeshStandardMaterial({ color: lin(...rgb), roughness: rough,
      metalness: metal, side: T.DoubleSide, ...extra }));
  }
  return mats.get(key);
}
// the game's materials, by name
const M = {
  pvc:       () => pbr('pvc', [.5, .5, .5], .1),
  gateSide:  () => pbr('gateSide', [.6, .6, .6], .4),
  gateTop:   () => pbr('gateTop', [0, 0, .2], .4),
  startTop:  () => pbr('startTop', [.2, .025, 0], .4),
  stalk:     () => pbr('stalk', [.5, .5, .5], .2, 1),
  flagPole:  () => pbr('flagPole', [.05, .05, .05], .5),
  standRed:  () => pbr('standRed', [.3, .005, .005], .1),
  foam:      () => pbr('foam', [.01, .01, .01], .7),
  canopy:    () => pbr('canopy', [.05, .05, .5], .9),
  canopyLeg: () => pbr('canopyLeg', [.5, .5, .5], .1),
  canopyFt:  () => pbr('canopyFt', [.05, .05, .05], .3),
};
// LED colours: the game's base (slot 0) and HDR emissive (slot 4) values
const LED = {
  red: [[.3, 0, 0], [1, 0, 0]], green: [[0, .3, 0], [0, 1, 0]], blue: [[0, 0, .3], [0, 0, 1]],
  yellow: [[.3, .3, 0], [1, 1, 0]], white: [[.3, .3, .3], [1, 1, 1]], off: [[0, 0, 0], [0, 0, 0]],
};
function ledMat(colour) {
  const [base, em] = LED[colour] || LED.off;
  return pbr('led:' + colour, base, .1, 0, { emissive: lin(...em), emissiveIntensity: 1.4 });
}

// ---- geometry helpers (all in the Z-up model frame) ----------------------
function box(mat, cx, cy, cz, sx, sy, sz) {
  const m = new T.Mesh(new T.BoxGeometry(sx, sy, sz), mat);
  m.position.set(cx, cy, cz);
  return m;
}
// a cylinder between two points
function tube(mat, a, b, r, seg = 10) {
  const A = new T.Vector3(...a), B = new T.Vector3(...b);
  const len = A.distanceTo(B);
  const m = new T.Mesh(new T.CylinderGeometry(r, r, len, seg), mat);
  m.position.copy(A).add(B).multiplyScalar(.5);
  m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  return m;
}
// a flat shape in the X-Z plane at y, UVs normalised to the given rectangle
function flatShape(mat, pts, y, [u0, v0, u1, v1]) {
  const shape = new T.Shape(pts.map(([x, z]) => new T.Vector2(x, z)));
  const geo = new T.ShapeGeometry(shape, 12);
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getY(i);
    uv.setXY(i, (x - u0) / (u1 - u0), (z - v0) / (v1 - v0));
    pos.setXYZ(i, x, y, z);
  }
  geo.computeVertexNormals();
  return new T.Mesh(geo, mat);
}

// ---- canvas fabric art (generic patterns only) ----------------------------
const texCache = new Map();
function canvasTex(key, w, h, draw) {
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  // canvas Y runs down, texture V runs up: draw with Y up
  g.translate(0, h); g.scale(1, -1);
  draw(g, w, h);
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  texCache.set(key, t);
  return t;
}
const fabricMat = (key, tex) => {
  if (!mats.has(key)) mats.set(key, new T.MeshStandardMaterial({ map: tex, roughness: .4,
    metalness: 0, side: T.DoubleSide }));
  return mats.get(key);
};
function checker(g, x, y, w, h, cell, a = '#111', b = '#fff') {
  for (let j = 0; j * cell < h; j++) {
    for (let i = 0; i * cell < w; i++) {
      g.fillStyle = (i + j) % 2 ? a : b;
      g.fillRect(x + i * cell, y + j * cell, Math.min(cell, w - i * cell), Math.min(cell, h - j * cell));
    }
  }
}

// 5x5 gate fabric: one canvas covers the whole Π (2.1 m x 1.8 m). The legs
// are x 0-0.3 and 1.8-2.1, the banner z 1.5-1.8. Five schemes in the game's
// spirit: a start panel with red arrows, then four sponsor-style colourways.
const G5W = 2.1, G5H = 1.8, PX = 240;            // canvas pixels per metre
function gate5Art(scheme) {
  return canvasTex('g5:' + scheme, G5W * PX, G5H * PX, (g, w, h) => {
    const m = v => v * PX;
    g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
    const legs = [[0, 1], [G5W - .3, -1]];
    const bannerY = m(1.5), bannerH = m(.3);
    if (scheme === 0 || scheme === 1) {                    // black frame + checkers
      for (const [x0, dir] of legs) {
        const outer = dir > 0 ? x0 : x0 + .21;
        g.fillStyle = '#0a0a0a'; g.fillRect(m(outer), 0, m(.09), h);
        checker(g, m(dir > 0 ? x0 + .09 : x0), 0, m(.21), bannerY, m(.035));
      }
      g.fillStyle = '#0a0a0a';
      g.fillRect(0, h - m(.07), w, m(.07));
      if (scheme === 0) {                                  // start: red band + arrows
        g.fillStyle = '#c40000'; g.fillRect(m(.45), bannerY + m(.07), w - m(.9), m(.1));
        g.fillStyle = '#fff';
        for (const [x0, dir] of legs) {
          const cx = m(x0 + .15), cy = m(.75);
          g.fillRect(cx - m(.11), cy - m(.11), m(.22), m(.22));
          g.fillStyle = '#c40000'; g.beginPath();
          g.moveTo(cx - dir * m(.07), cy - m(.08)); g.lineTo(cx + dir * m(.08), cy);
          g.lineTo(cx - dir * m(.07), cy + m(.08)); g.fill(); g.fillStyle = '#fff';
        }
      } else {                                             // green blocks + black bar
        g.fillStyle = '#2a8a00';
        g.fillRect(m(.09), bannerY, m(.27), bannerH - m(.07));
        g.fillRect(w - m(.36), bannerY, m(.27), bannerH - m(.07));
        g.fillStyle = '#111'; g.fillRect(m(.5), bannerY + m(.08), w - m(1), m(.08));
      }
    } else if (scheme === 2) {                             // white, red-orange squares
      g.fillStyle = '#f03c10';
      for (const [x0] of legs) {
        g.fillRect(m(x0 + .08), m(1.1), m(.14), m(.14));
        g.fillStyle = '#111'; g.fillRect(m(x0 + .1), m(.7), m(.1), m(.3));
        g.fillStyle = '#f03c10'; g.fillRect(m(x0 + .08), m(.5), m(.14), m(.14));
        g.fillStyle = '#111';
        for (let k = 0; k < 6; k++) g.fillRect(m(x0 + .06), m(.05 + k * .045), m(.18), m(.015));
        g.fillStyle = '#f03c10';
      }
      g.fillRect(m(.9), bannerY + m(.1), m(.1), m(.1));
      g.fillStyle = '#111'; g.fillRect(m(1.02), bannerY + m(.1), m(.2), m(.1));
    } else if (scheme === 3) {                             // blue frame on white
      g.fillStyle = '#0a55ff';
      for (const [x0] of legs) g.fillRect(m(x0 + .02), 0, m(.08), h);
      g.fillRect(0, h - m(.12), w, m(.06));
      g.fillRect(m(.45), bannerY + m(.04), m(.16), m(.14));
      g.fillStyle = '#111'; g.fillRect(m(.7), bannerY + m(.07), m(.9), m(.08));
      g.fillStyle = '#0a55ff';
      for (const [x0] of legs) {
        for (let k = 0; k < 9; k++) g.fillRect(m(x0 + .15 + (k % 2) * .05), m(.1 + k * .15), m(.04), m(.04));
      }
    } else {                                               // black/red race panel
      g.fillStyle = '#16181b';
      for (const [x0] of legs) g.fillRect(m(x0), 0, m(.3), h);
      g.fillRect(0, bannerY + m(.12), w, m(.18));
      g.fillStyle = '#d00';
      for (const [x0, dir] of legs) g.fillRect(m(dir > 0 ? x0 + .26 : x0 + .02), 0, m(.02), bannerY);
      g.fillRect(m(.3), bannerY + m(.08), w - m(.6), m(.03));
      g.fillStyle = '#e8e8e8'; g.fillRect(m(.35), bannerY, w - m(.7), m(.08));
      g.fillStyle = '#c8c8c8';
      for (const [x0] of legs) checker(g, m(x0 + .08), m(.05), m(.14), m(.5), m(.035), '#c8c8c8', '#16181b');
    }
  });
}

// the feather flag (0.8 m x 3.5 m cloth): three colourways
function flagArt(scheme) {
  return canvasTex('flag:' + scheme, 160, 700, (g, w, h) => {
    const bg = ['#8c8c8c', '#fafafa', '#b00000'][scheme];
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    if (scheme === 0) {                                    // grey with confetti squares
      let s = 7;
      const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
      for (let k = 0; k < 70; k++) {
        g.fillStyle = rnd() < .5 ? '#ff6a00' : '#ffffff';
        const sz = 6 + rnd() * 10;
        g.fillRect(rnd() * (w - sz), h * .45 + rnd() * h * .5, sz, sz);
      }
      g.fillStyle = '#111';
      for (let k = 0; k < 4; k++) g.fillRect(w * .15, h * (.08 + k * .09), w * .55, h * .05);
    } else if (scheme === 1) {                             // white with a blue band
      g.fillStyle = '#0a55ff'; g.fillRect(w * .2, h * .2, w * .45, h * .55);
      g.fillStyle = '#fff'; g.fillRect(w * .32, h * .3, w * .2, h * .35);
    } else {                                               // red with a white swoosh
      g.strokeStyle = '#fff'; g.lineWidth = 14; g.beginPath();
      g.moveTo(w * .25, h * .1); g.quadraticCurveTo(w * .1, h * .6, w * .55, h * .9); g.stroke();
      g.strokeStyle = '#000'; g.lineWidth = 10; g.strokeRect(5, 5, w - 10, h - 10);
    }
  });
}

// the launch mat: orange border, light grey field, black checker fans
function matArt() {
  return canvasTex('mat', 512, 512, (g, w) => {
    g.fillStyle = '#dd3a00'; g.fillRect(0, 0, w, w);
    const b = w * .1;
    g.fillStyle = '#cdcdcd'; g.fillRect(b, b, w - 2 * b, w - 2 * b);
    g.fillStyle = '#141414';
    // a fan of shrinking checker squares from each corner, along each edge
    const fan = (x, y, dx, dy, along) => {
      let size = w * .065, px = x, py = y;
      for (let k = 0; k < 9; k++) {
        for (let r = 0; r < 3; r++) {
          const ox = along ? 0 : r * size, oy = along ? r * size : 0;
          if ((k + r) % 2 === 0) g.fillRect(px + ox * dx - (dx < 0 ? size : 0),
            py + oy * dy - (dy < 0 ? size : 0), size, size);
        }
        px += along ? size * dx : 0; py += along ? 0 : size * dy;
        size *= .8;
      }
    };
    const i = b + w * .03, o = w - b - w * .03;
    fan(i, o, 1, -1, true); fan(o, o, -1, -1, false);
    fan(o, i, -1, 1, true); fan(i, i, 1, 1, false);
  });
}

// ---- the models -----------------------------------------------------------
const BUILD = {
  // 5x5 gate: PVC posts at x 0 and 2.1, top bar at z 1.8, fabric sleeves
  '5x5Gate'(o) {
    const g = new T.Group();
    const pvc = M.pvc();
    g.add(tube(pvc, [0, 0, 0], [0, 0, 1.82], .02), tube(pvc, [2.1, 0, 0], [2.1, 0, 1.82], .02),
      tube(pvc, [-.02, 0, 1.8], [2.12, 0, 1.8], .02));
    const scheme = o.isStart ? 0 : 1 + (o.variant || 0) % 4;
    const fab = fabricMat('g5fab:' + scheme, gate5Art(scheme));
    const pi = [[0, 0], [.3, 0], [.3, 1.5], [1.8, 1.5], [1.8, 0], [2.1, 0], [2.1, 1.8], [0, 1.8]];
    g.add(flatShape(fab, pi, -.012, [0, 0, G5W, G5H]));
    g.add(flatShape(fab, pi, .012, [0, 0, G5W, G5H]));
    return g;
  },
  // 7x6 gate: 3 m x 2.3 m, side panels 0.4 m, top banner 0.5 m
  '7x6Gate'(o) {
    const g = new T.Group();
    const pvc = M.pvc(), side = M.gateSide();
    g.add(tube(pvc, [0, 0, 0], [0, 0, 2.32], .02), tube(pvc, [3, 0, 0], [3, 0, 2.32], .02),
      tube(pvc, [-.02, 0, 2.3], [3.02, 0, 2.3], .02));
    g.add(box(side, .2, 0, .9, .4, .02, 1.8), box(side, 2.8, 0, .9, .4, .02, 1.8));
    g.add(box(o.isStart ? M.startTop() : M.gateTop(), 1.5, -.006, 2.05, 3, .012, .5));
    g.add(box(side, 1.5, .006, 2.025, 2.9, .012, .45));    // the grey back of the banner
    return g;
  },
  // dive / climb gate: a flat 3 m (2.74 m) square, blue across the ends
  '7x7DiveGate': o => diveCage(1.52),
  '7x7ClimbGate': o => diveCage(1.37),
  // launch mat: 3 m square pad with a PVC edge
  '7x7Mat'() {
    const g = new T.Group();
    const top = new T.MeshStandardMaterial({ map: matArt(), roughness: .8, side: T.DoubleSide });
    const pad = box(M.foam(), 0, 0, .0125, 3.04, 3.04, .025);
    const face = new T.Mesh(new T.PlaneGeometry(3.04, 3.04), top);
    face.position.z = .026;
    g.add(pad, face);
    const pvc = M.pvc();
    for (const s of [-1.5, 1.5]) {
      g.add(tube(pvc, [s, -1.52, .02], [s, 1.52, .02], .02), tube(pvc, [-1.52, s, .02], [1.52, s, .02], .02));
    }
    return g;
  },
  // feather flag: metal ground stalk, black pole that bends over the top,
  // cloth hung from it
  Flag(o) {
    const g = new T.Group();
    g.add(tube(M.stalk(), [0, 0, -.5], [0, 0, .5], .02, 8));
    const pole = M.flagPole();
    const path = [[0, .5], [0, 3.2], [-.05, 3.49], [-.22, 3.75], [-.48, 3.92], [-.8, 4.02]];
    for (let i = 1; i < path.length; i++) {
      g.add(tube(pole, [path[i - 1][0], 0, path[i - 1][1]], [path[i][0], 0, path[i][1]], .022, 8));
    }
    const scheme = (o.variant || 0) % 3;
    const cloth = fabricMat('flag:' + scheme, flagArt(scheme));
    g.add(flatShape(cloth, [[0, .5], ...path.slice(1), [-.8, .8]], 0, [0, .5, -.8, 4.02]));
    return g;
  },
  // Champs25 gate: a 2.54 m hollow square frame, 0.5 m deep, LEDs on the face
  Champs25Gate(o) {
    const g = new T.Group();
    const side = M.gateSide(), led = ledMat(o.led || 'off');
    const S = 2.54, D = .5, W = .05;
    g.add(box(side, 0, 0, W / 2, S, D, W), box(side, 0, 0, S - W / 2, S, D, W),
      box(side, -(S - W) / 2, 0, S / 2, W, D, S - 2 * W), box(side, (S - W) / 2, 0, S / 2, W, D, S - 2 * W));
    const y = -D / 2 - .01, L = .035;
    g.add(box(led, 0, y, .03, S - .06, .02, L), box(led, 0, y, S - .03, S - .06, .02, L),
      box(led, -(S / 2 - .03), y, S / 2, L, .02, S - .06), box(led, S / 2 - .03, y, S / 2, L, .02, S - .06));
    return g;
  },
  // Champs25 pole: metal ground stalk + a 3 m glowing sleeve
  Champs25Pole(o) {
    const g = new T.Group();
    g.add(tube(M.stalk(), [0, 0, -.5], [0, 0, .5], .02, 8));
    g.add(tube(ledMat(o.led || 'off'), [0, 0, .5], [0, 0, 3.5], .048, 14));
    return g;
  },
  // metal launch stand: two painted side walls, a top plate, foam strips
  MetalLaunchStand() {
    const g = new T.Group();
    const red = M.standRed(), foam = M.foam();
    g.add(box(red, -.073, .125, .0365, .04, .25, .073), box(red, .073, .125, .0365, .04, .25, .073));
    g.add(box(red, 0, .03, .069, .106, .06, .007));
    g.add(box(foam, -.07, .125, .074, .03, .25, .002), box(foam, .07, .125, .074, .03, .25, .002));
    return g;
  },
  // championship launch stand: two tapered side plates on a base frame,
  // a foam cradle on top at 0.86 m
  ChampionshipLaunchStand() {
    const g = new T.Group();
    const red = M.standRed();
    for (const x of [-.095, .095]) {
      const shape = new T.Shape();
      // wide foot (y -0.05 to 0.45), both edges curving in to the cradle
      shape.moveTo(-.05, 0); shape.lineTo(.45, 0);
      shape.quadraticCurveTo(.25, .3, .24, .86); shape.lineTo(.01, .86);
      shape.quadraticCurveTo(0, .3, -.05, 0);
      const geo = new T.ExtrudeGeometry(shape, { depth: .012, bevelEnabled: false });
      // shape (u, v) -> model (y, z), extrusion -> model x
      geo.applyMatrix4(new T.Matrix4().set(0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1));
      geo.translate(x - .006, 0, 0);
      g.add(new T.Mesh(geo, red));
    }
    for (const x of [-.19, .19]) g.add(box(red, x, .2, .015, .02, .5, .03));
    for (const y of [-.04, .44]) g.add(box(red, 0, y, .015, .4, .02, .03));
    // H-shaped cradle: a bar along the top of each plate, a cross bar between
    for (const x of [-.089, .089]) g.add(box(red, x, .125, .84, .04, .25, .04));
    g.add(box(red, 0, .125, .835, .14, .04, .03));
    g.add(box(M.foam(), 0, .125, .861, .178, .248, .002));
    return g;
  },
  // shade canopy: 3 m square, four legs, a blue roof with a valance
  ShadeCanopy() {
    const g = new T.Group();
    const leg = M.canopyLeg(), feet = M.canopyFt(), fab = M.canopy();
    for (const x of [-1.5, 1.5]) {
      for (const y of [-1.5, 1.5]) {
        g.add(box(leg, x, y, 1.14, .04, .04, 2.27));
        g.add(box(feet, x, y, .02, .1, .1, .04));
        g.add(box(leg, x, y, .735, .05, .05, .07));
      }
    }
    // cross braces under the roof
    g.add(tube(leg, [-1.5, -1.5, 2.27], [1.5, 1.5, 2.27], .015), tube(leg, [-1.5, 1.5, 2.27], [1.5, -1.5, 2.27], .015));
    const H = 1.524;
    const roof = new T.ConeGeometry(H * Math.SQRT2, .7, 4, 1, true);
    roof.rotateY(Math.PI / 4); roof.rotateX(Math.PI / 2);
    roof.translate(0, 0, 2.29 + .35);
    g.add(new T.Mesh(roof, fab));
    for (const [cx, cy, sx, sy] of [[0, -H, 2 * H, .01], [0, H, 2 * H, .01], [-H, 0, .01, 2 * H], [H, 0, .01, 2 * H]]) {
      g.add(box(fab, cx, cy, 2.15, sx, sy, .3));
    }
    return g;
  },
};

function diveCage(h) {
  const g = new T.Group();
  const pvc = M.pvc(), side = M.gateSide(), top = M.gateTop();
  const band = .47, w = 2 * h;
  for (const s of [-1, 1]) {
    g.add(box(top, 0, s * (h - band / 2), 0, w, band, .012));               // blue ends
    g.add(box(side, s * (h - band / 2), 0, 0, band, w - 2 * band, .012));   // grey sides
  }
  const e = h - .02;
  for (const s of [-1, 1]) {
    g.add(tube(pvc, [s * e, -h, 0], [s * e, h, 0], .02), tube(pvc, [-h, s * e, 0], [h, s * e, 0], .02));
  }
  return g;
}

// model names the lookalikes cover
export const LOOKALIKE_NAMES = new Set(Object.keys(BUILD));

// a fresh group for `name`, or null when there is no lookalike for it.
// opts: { variant (instance index, picks the fabric art), isStart, led
// ('red' | 'green' | 'blue' | 'yellow' | 'white' | 'off') }
export function lookalike(name, THREE, opts = {}) {
  T = THREE;
  const b = BUILD[name];
  if (!b) return null;
  const g = b(opts);
  // cast only, like the editor's own primitives: double-sided thin panels
  // that also receive shadows get striped with shadow acne
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
  return g;
}
