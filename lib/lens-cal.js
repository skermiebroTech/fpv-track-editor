// ===========================================================================
// Lens calibration track generator.
//
// Builds a one-wall MRSIM track for comparing a real quad's goggle DVR frame
// with an MRSIM screenshot of the same scene: a flat wall at a known distance
// in front of the spawn, with a door outline, two square tape outlines, a
// numbered height ruler on the centre line, and every size written on the
// wall in cm. All marks are 1 mm thick render-only boxes (zero-depth "gates",
// no collision); only the wall and the optional spawn platform are solid.
//
// The camera height cannot be read from the game files (drone frames are
// compiled .dtkbp blueprints), so the ruler measures it in-game: with Camera
// Angle 0 the ruler mark at the image centre is the camera height, because
// lens distortion is centred on the optical axis.
//
// Numbers are seven-segment digits built from boxes, because a track cannot
// render text. The output is heavily commented so it stays hand-editable.
// ===========================================================================

const LIB = '/Data/Simulations/Multirotor/';
const f = (v) => +v.toFixed(4) + '';
const cm = (m) => Math.round(m * 100);

// FPV camera geometry per frame, read from the plain-XML drone files of the
// 2026-07-18 build and checked against the binary blueprints of the
// 2026-10-17 build: camera mounts, lenses, collision parts, battery, motors
// and launch stand are unchanged. Each frame's SimC sets the camera mount
// relative to the Frame origin, tilted about x by Camera Angle; the lens file
// then moves the camera forward by L along the TILTED axis. On every frame the
// arms' underside is the Frame origin and the battery hangs between the stand
// rails, so on the MetalLaunchStand the Frame origin sits on the rail top
// (StartPosition z = .075).
//
// MEASURED IN-GAME 2026-10-17 (Lens Verify tracks, Camera Angle 0, tick
// columns fitted to 0.5 px): the projection centre sits SINK lower and PROJ
// further forward than the file geometry, the same on every frame tested.
// `sink` per frame is the measured drop where we have it (the quad settles on
// the rail contact springs; the 7" settles further). Stock-lens curve, 1840 px
// wide image, theta in radians off the axis (scale r with the image width):
//   stock: r = 763.0 th + 31.0 th^3 + 8.8 th^5   (centre FOV 100.7, to 47 deg)
//   wide:  r = 673.1 th + 69.7 th^3 + 9.0 th^5   (centre FOV 107.6, to 46 deg)
// Close to an equidistant fisheye, not a pinhole with Brown k1 = -0.24.
// Camera Angle 30 checked: the axis tilts 30.06 deg (30.34 predicted).
export const PROJ_FORWARD = 0.0045;   // projection centre ahead of the lens point
export const DEFAULT_SINK = 0.001;    // measured on Drippuh / OZR-5X / OZR-5X V2
export const MRSIM_FRAMES = Object.freeze({
  drippuh: { name: 'Drippuh', y: 0.03, z: 0.021, sink: 0.001 },      // measured
  motion: { name: 'MOTION', y: 0.03, z: 0.02, sink: 0.0021 },        // measured
  kronos: { name: 'Kronos Alpha', y: 0.03, z: 0.02 },
  hydra: { name: 'Hydra', y: 0.03, z: 0.02 },
  miroku: { name: 'MIROKU', y: 0.03, z: 0.021 },   // added after July; from the current blueprint
  ozr5x: { name: 'OZR-5X', y: 0.0276, z: 0.0213, sink: 0.0012 },     // measured
  ozr5xv2: { name: 'OZR-5X V2', y: 0.0276, z: 0.0213, sink: 0.0012 }, // measured
  prospec: { name: 'ProSpec 7"', y: 0.045, z: 0.03, sink: 0.0052 },  // measured
});
export const MRSIM_LENSES = Object.freeze({
  stock: { name: 'HDZero Nano 90 stock', L: 0.0115, fov: 100 },
  wide: { name: 'HDZero Nano 90 wide', L: 0.013, fov: 107 },
});
export const STAND_TOP = 0.075;       // MetalLaunchStand rail top = StartPosition z

// camera projection centre from the spawn point (metres): forward, up.
// File geometry plus the measured in-game corrections; `measured` says
// whether this frame's height drop was measured or uses DEFAULT_SINK.
export function lensOffset(frame, lens = 'stock', angleDeg = 0) {
  const F = MRSIM_FRAMES[frame], Ln = MRSIM_LENSES[lens];
  if (!F || !Ln) return null;
  const a = angleDeg * Math.PI / 180;
  return { forward: F.y + Ln.L * Math.cos(a) + PROJ_FORWARD,
    up: F.z + Ln.L * Math.sin(a) - (F.sink ?? DEFAULT_SINK), measured: F.sink != null };
}

// every field in metres
export const LENS_CAL_DEFAULTS = Object.freeze({
  distance: 1,       // spawn point -> wall face
  platform: 0,       // extra height under the launch stand (0 = stand on the ground)
  // camera elevation: when cameraH > 0 the platform is derived from it.
  // cameraOnStand is the sim camera height with the stand on the ground,
  // read once per frame from the ruler (Camera Angle 0, image centre).
  cameraH: 0, cameraOnStand: 0,
  // optional: the sim frame / lens / Camera Angle, written into the header
  frame: '', lens: 'stock', cameraAngle: 0,
  marks: 1,          // 0 = rulers only: no door or squares (clean lens checks)
  hRulerZ: 0,        // height of a horizontal ruler (0 = none); use the lens height
  doorW: 0.82, doorH: 2.04,
  smallS: 1, largeS: 2,
  squareC: 1.1,      // centre height of both squares
  tape: 0.024,
});

// tape strips for a square outline of side S (tape centre line), centred on (0, cz)
function square(name, S, cz, tape, mat) {
  const h = S / 2, L = S + tape;
  const strip = (label, x, z, w, ht) =>
    `          <Entity name="${name}_${label}">
            <WorldFromEntityComponent x="${f(x)}" y="-.003" z="${f(z)}"/>
            <Box x="${f(w)}" y=".001" z="${f(ht)}"/>
            <MeshRendererComponent material="${mat}" subdivisions="1"/>
          </Entity>`;
  return [
    strip('top', 0, cz + h, L, tape),
    strip('bottom', 0, cz - h, L, tape),
    strip('left', -h, cz, tape, L),
    strip('right', h, cz, tape, L),
  ].join('\n');
}

// door outline: width W, height H, bottom on the floor, tape centre line on the door edge
function door(W, H, tape, mat) {
  const strip = (label, x, z, w, ht) =>
    `          <Entity name="door_${label}">
            <WorldFromEntityComponent x="${f(x)}" y="-.003" z="${f(z)}"/>
            <Box x="${f(w)}" y=".001" z="${f(ht)}"/>
            <MeshRendererComponent material="${mat}" subdivisions="1"/>
          </Entity>`;
  return [
    strip('top', 0, H, W + tape, tape),
    strip('left', -W / 2, H / 2, tape, H + tape),
    strip('right', W / 2, H / 2, tape, H + tape),
  ].join('\n');
}

// vertical ruler on x=0, floor to 2.5 m, one mark per cm
function ruler() {
  const rows = ['          <Entity name="ruler">'];
  for (let cm = 0; cm <= 250; cm++) {
    let w = 0.02, mat = 'RulerBlack';
    if (cm % 5 === 0) w = 0.04;
    if (cm % 10 === 0) w = 0.08;
    if (cm % 50 === 0) { w = 0.16; mat = 'RulerRed'; }
    // the mark is 4 mm tall and its CENTRE is at the height it shows
    const z = Math.max(cm / 100, 0.002);
    rows.push(`            <Entity><WorldFromEntityComponent y="-.0045" z="${f(z)}"/><Box x="${f(w)}" y=".001" z=".004"/><MeshRendererComponent material="${mat}" subdivisions="1"/></Entity>` + (cm % 10 === 0 ? `  <!-- ${f(cm / 100)} m -->` : ''));
  }
  rows.push('          </Entity>');
  return rows.join('\n');
}

// seven-segment numbers (height in cm) beside every 10 cm mark, 10 to 250
const DH = 0.05, DW = 0.03, DS = 0.006, PITCH = 0.042, LABEL_X = 0.1;
const SEGS = {            // [x, z, box x, box z] in digit-local metres
  a: [DW / 2, DH, DW + DS, DS], g: [DW / 2, DH / 2, DW + DS, DS], d: [DW / 2, 0, DW + DS, DS],
  f: [0, DH * 3 / 4, DS, DH / 2 + DS], e: [0, DH / 4, DS, DH / 2 + DS],
  b: [DW, DH * 3 / 4, DS, DH / 2 + DS], c: [DW, DH / 4, DS, DH / 2 + DS],
};
const DIGITS = ['abcdef', 'bc', 'abged', 'abgcd', 'fgbc', 'afgcd', 'afgedc', 'abc', 'abcdefg', 'abcdfg'];

// one number as seven-segment bars; origin = bottom-left, k = size factor
function numberRows(text, mat, k, pad) {
  const rows = [];
  [...String(text)].forEach((ch, i) => {
    for (const seg of DIGITS[+ch]) {
      const [x, z, bx, bz] = SEGS[seg];
      rows.push(`${pad}<Entity><WorldFromEntityComponent x="${f((i * PITCH + x) * k)}" y="-.0045" z="${f(z * k)}"/><Box x="${f(bx * k)}" y=".001" z="${f(bz * k)}"/><MeshRendererComponent material="${mat}" subdivisions="1"/></Entity>`);
    }
  });
  return rows;
}

function labels(skipZ = -1) {
  const rows = ['          <Entity name="rulerLabels">'];
  for (let cm = 10; cm <= 250; cm += 10) {
    // leave room for the horizontal ruler's numbers when one runs at this height
    if (skipZ >= 0 && Math.abs(cm / 100 - skipZ) < 0.16) continue;
    const mat = cm % 50 === 0 ? 'RulerRed' : 'RulerBlack';
    rows.push(`            <!-- ${cm} cm -->`);
    rows.push(`            <Transform x="${LABEL_X}" z="${f(cm / 100 - DH / 2)}">`);
    rows.push(...numberRows(cm, mat, 1, '              '));
    rows.push('            </Transform>');
  }
  rows.push('          </Entity>');
  return rows.join('\n');
}

// horizontal ruler at height H (the lens height): a baseline with a gap round
// x = 0 so the vertical ruler stays readable, marks UP from the baseline
// (1 cm out to 1 m, then 5 cm out to 6 m) and the distance from the centre in
// cm above the 10 cm marks (every 10 cm to 1 m, every 50 cm beyond)
function hRuler(H) {
  const GAP = 0.06, END = 6;
  const rows = ['          <Entity name="hRuler">'];
  const box = (x, z, bx, bz, mat) =>
    `            <Entity><WorldFromEntityComponent x="${f(x)}" y="-.0045" z="${f(z)}"/><Box x="${f(bx)}" y=".001" z="${f(bz)}"/><MeshRendererComponent material="${mat}" subdivisions="1"/></Entity>`;
  for (const sgn of [-1, 1]) rows.push(box(sgn * (GAP + END) / 2, H, END - GAP, 0.004, 'RulerBlack'));
  for (let cm = 1; cm <= END * 100; cm++) {
    if (cm > 100 && cm % 5) continue;
    let h = 0.015, mat = 'RulerBlack';
    if (cm % 5 === 0) h = 0.03;
    if (cm % 10 === 0) h = 0.05;
    if (cm % 50 === 0) { h = 0.08; mat = 'RulerRed'; }
    for (const sgn of [-1, 1]) {
      const x = sgn * cm / 100;
      if (Math.abs(x) < GAP) continue;
      rows.push(box(x, H + h / 2, 0.004, h, mat));
    }
  }
  rows.push('          </Entity>', '          <Entity name="hRulerLabels">');
  for (let cm = 10; cm <= END * 100; cm += (cm < 100 ? 10 : 50)) {
    const k = cm <= 100 ? 0.8 : 2, mat = cm % 50 === 0 ? 'RulerRed' : 'RulerBlack';
    const text = String(cm), w = (text.length * PITCH - (PITCH - DW)) * k;
    const z = H + (cm % 50 === 0 ? 0.08 : 0.05) + 0.01;
    for (const sgn of [-1, 1]) {
      rows.push(`            <!-- ${sgn < 0 ? '-' : '+'}${cm} cm -->`, `            <Transform x="${f(sgn * cm / 100 - w / 2)}" z="${f(z)}">`,
        ...numberRows(text, mat, k, '              '), '            </Transform>');
    }
  }
  rows.push('          </Entity>');
  return rows.join('\n');
}

// size label for a tape square (side S in cm), outside its top-left corner,
// top of the number level with the top tape. k = 2 gives 10 cm tall digits.
function squareLabel(name, S, C, mat, k = 2) {
  const text = String(Math.round(S * 100));
  const width = (text.length * PITCH - (PITCH - DW)) * k;
  const x = -S / 2 - 0.04 - width, z = C + S / 2 - DH * k;
  return [`          <Entity name="${name}_label">`,
    `            <Transform x="${f(x)}" z="${f(z)}">`,
    ...numberRows(text, mat, k, '              '),
    '            </Transform>', '          </Entity>'].join('\n');
}

// door size labels (cm), inside the door, left of the ruler:
// the WIDTH just under the top tape, the HEIGHT just above the floor
function doorLabels(W, H, mat, k = 1.5) {
  const one = (label, text, z) => [`          <Entity name="door_${label}">`,
    `            <Transform x="${f(-W / 2 + 0.04)}" z="${f(z)}">`,
    ...numberRows(text, mat, k, '              '),
    '            </Transform>', '          </Entity>'];
  return [...one('widthLabel', Math.round(W * 100), H - 0.03 - DH * k),
          ...one('heightLabel', Math.round(H * 100), 0.15)].join('\n');
}

// platform height: from the wanted camera elevation when one is given,
// otherwise the plain platform field
export function lensCalPlatform(o) {
  if (!(o.cameraH > 0)) return o.platform;
  if (!(o.cameraOnStand > 0)) throw new Error('enter the camera height on the stand (read it from the ruler first)');
  const P = o.cameraH - o.cameraOnStand;
  if (P < -1e-9) throw new Error('the camera is already higher than that on the stand alone');
  return Math.max(0, P);
}

// green strip on the wall at the wanted camera height: with Camera Angle 0
// the image centre lands on it when the setup is right
function cameraLine(H) {
  return `      <!-- CAMERA HEIGHT LINE: green, 0.6 m wide, centred at the wanted camera
           height (${f(H * 100)} cm). With Camera Angle 0 the image centre is on this line. -->
          <Entity name="cameraHeightLine">
            <WorldFromEntityComponent y="-.006" z="${f(H)}"/>
            <Box x=".6" y=".001" z=".006"/>
            <MeshRendererComponent material="CameraLine" subdivisions="1"/>
          </Entity>
`;
}

// header note with the frame's camera position from the game files
function simCameraNote(o, D, P) {
  const off = lensOffset(o.frame, o.lens, o.cameraAngle);
  if (!off) return '';
  const F = MRSIM_FRAMES[o.frame], Ln = MRSIM_LENSES[o.lens];
  const c = (m) => +(m * 100).toFixed(2) + "";
  const row = (label, v) => `    ${(label + ' ').padEnd(43, '.')} ${v} cm`;
  return `  SIM CAMERA (game files + in-game measurement, MRSIM build of 17 Oct 2026)
    Frame ${F.name}, lens ${Ln.name} (FOV ${Ln.fov}, distortionK1 -0.24),
    Camera Angle ${f(o.cameraAngle)} degrees.
${row('Lens above the frame centre', c(off.up))}
${row(`Lens above the ground (stand${P > 0 ? ' + platform' : ''})`, c(STAND_TOP + P + off.up))}
${row('Lens forward of the spawn point', c(off.forward))}
${row('Lens to wall', c(D - off.forward))}
    Values include the in-game measurement of 17 Oct 2026${off.measured ? '' : ' (height drop estimated)'}.

`;
}

// the spawn platform: commented out (ready to enable) at P = 0, live above it
function spawnXml(P) {
  const plat = (p) => `    <Entity name="platform">
      <WorldFromEntityComponent z="${f(p / 2)}"/>
      <Box x=".4" y=".6" z="${f(p)}"/>
      <StaticContact material="TrackPart"/>
      <MeshRendererComponent material="CalPlatform" subdivisions="1"/>
    </Entity>`;
  return (P > 0 ? plat(P) : `    <!--\n${plat(0.5)}\n    -->`) + `
    <Transform y="-.03" z="${f(P)}">
      <Include file="${LIB}LaunchStands/MetalLaunchStand.xml"/>
    </Transform>
`;
}

export function lensCalibrationXml(opts = {}) {
  const o = { ...LENS_CAL_DEFAULTS };
  for (const [k, v] of Object.entries(opts)) {
    if (!(k in o) || v === '' || v == null) continue;
    if (typeof LENS_CAL_DEFAULTS[k] === 'string') o[k] = String(v);
    else if (Number.isFinite(+v)) o[k] = +v;
  }
  const P = lensCalPlatform(o);
  const { distance: D, cameraH, cameraOnStand, hRulerZ, marks, doorW, doorH, smallS, largeS, squareC: C, tape: TAPE } = o;
  if (!(D > 0)) throw new Error('wall distance must be above 0');
  if (!(P >= 0)) throw new Error('platform height must be 0 or more');
  for (const [k, v] of [['door width', doorW], ['door height', doorH], ['small square', smallS],
    ['large square', largeS], ['tape width', TAPE]]) if (!(v > 0)) throw new Error(`${k} must be above 0`);
  if (C - largeS / 2 - TAPE / 2 < 0) throw new Error('the large square goes below the floor: raise the square centre');
  return `<Simulation>
<!--
  ===========================================================================
  MRSIM LENS CALIBRATION TRACK  -  wall at ${f(D)} m
  made with the lens calibration generator in 9dtr's track editor,
  for the camera / lens comparison test (DVR vs MRSIM)
  ===========================================================================

  WHAT THIS IS
    A flat white wall in front of the spawn point. The wall carries:
      - a "door" outline (${f(doorW)} m x ${f(doorH)} m, bottom on the floor)
      - a ${f(smallS)} m tape square and a ${f(largeS)} m tape square, centred on the
        door, both centred ${f(C)} m above the floor. The door has its width ("${cm(doorW)}", top)
        and height ("${cm(doorH)}", bottom) in cm inside it. Each square has its side
        length in cm ("${cm(smallS)}", "${cm(largeS)}") written outside its top-left corner
      - a vertical height ruler on the centre line (x = 0), 0 to 2.5 m:
        short mark every 1 cm, longer every 5 cm, longer again every 10 cm,
        RED every 50 cm, with the height in cm written beside each 10 cm mark
    All tape and ruler marks are 1 mm thick, sit flat on the wall and have
    NO collision. They are "zero depth" gates. Only the wall is solid.

  COORDINATES (MRSIM is Z-up, metres)
    x = right, y = forward (the quad faces +y at spawn), z = up.
    The ground is z = 0. The spawn point is x = 0, y = 0.

  HOW TO MEASURE THE SIM CAMERA HEIGHT (do this first, once per frame)
    The camera height above the ground depends on the selected frame.
    1. In MRSIM, set Camera Angle (uptilt) to 0.
    2. Load this track and look at the ruler.
    3. The ruler mark at the CENTRE of the image is the camera height.
       Lens distortion is centred on the optical axis, so the centre
       reading stays true even with a fisheye lens.
    4. To lift the camera to a height that you choose, enable the platform
       below (see SPAWN) and set its height:
         platform height = wanted camera height - camera height on the ground

${cameraH > 0 ? `  CAMERA HEIGHT IN THIS FILE
    Wanted camera height above the ground ..... ${f(cameraH * 100)} cm
    Measured camera height on the stand ........ ${f(cameraOnStand * 100)} cm
    Platform under the stand (difference) ..... ${f(P * 100)} cm
    A green line on the wall marks the wanted height. With Camera Angle 0,
    the image centre must be on it. If not, measure again on the stand.
    This only holds for the frame that you measured.

` : ''}${simCameraNote(o, D, P)}  HOW TO RUN THE COMPARISON
    1. Put the same marks on a real wall with masking tape (sizes below).
    2. Put the real quad level, the same distance from the wall, with the
       camera at the same height. Set MRSIM Camera Angle = real uptilt.
    3. Take a goggle DVR frame and an MRSIM screenshot. Compare them.

  HOW TO EDIT
    Wall distance ...... WALL_DISTANCE below (one number). Make a copy of
                         this file for each distance.
    Camera height ...... SPAWN section (platform).
    Door size .......... DOOR section. W = width, H = height.
    Square sizes ....... SQUARES section. Each square is 4 tape strips.
                         For side S, centre height C and tape width T:
                           top    : z = C + S/2, Box x = S + T
                           bottom : z = C - S/2, Box x = S + T
                           left   : x = -S/2, z = C, Box z = S + T
                           right  : x = +S/2, z = C, Box z = S + T
                         The nominal size is measured on the CENTRE LINE of
                         the tape (as you would on a real wall).
    Tape width ......... ${f(TAPE * 1000)} mm (Box x or z = ${f(TAPE)} on the narrow side).
    Colours ............ MATERIALS section. baseColor x y z = red green blue,
                         0 to 1.

  NOTES
    - The wall distance is measured from the SPAWN POINT, not from the lens.
      The lens sits a few cm forward of the spawn point, and this offset
      depends on the frame. To find it, use two distances: the apparent size
      of the small square near the image centre scales with 1 / (D - offset).
    - Lighting is the game default sun. You cannot change it from a track.
    - The start/finish gate is 6 m behind the quad, out of view. MRSIM needs
      one to load the track as a race. Ignore it.
-->

  <Include file="${LIB}Locations/EmptyGrassWorld.xml"/>
  <Include file="${LIB}DroneTrackInstanceGroups.xml"/>

  <Macro name="Centered7x6StartFinishGate">
    <Transform x="-1.5">
      <Include file="${LIB}7x6StartFinishGate.xml"/>
    </Transform>
  </Macro>

  <!-- ===================== MATERIALS ===================== -->
  <!-- the wall: matte off-white -->
  <Material name="CalWall">
    <PBR>
      <baseColor x=".8" y=".8" z=".78"/>
      <roughness value=".9"/>
      <metallic value="0"/>
    </PBR>
  </Material>
  <!-- the optional spawn platform -->
  <Material name="CalPlatform">
    <PBR>
      <baseColor x=".2" y=".2" z=".2"/>
      <roughness value=".8"/>
      <metallic value="0"/>
    </PBR>
  </Material>
  <!-- door outline: dark brown -->
  <Material name="TapeDoor">
    <PBR>
      <baseColor x=".25" y=".12" z=".04"/>
      <roughness value=".8"/>
      <metallic value="0"/>
    </PBR>
  </Material>
  <!-- small square: blue painter's tape -->
  <Material name="TapeSmall">
    <PBR>
      <baseColor x=".05" y=".25" z=".75"/>
      <roughness value=".8"/>
      <metallic value="0"/>
    </PBR>
  </Material>
  <!-- large square: yellow -->
  <Material name="TapeLarge">
    <PBR>
      <baseColor x=".85" y=".65" z=".05"/>
      <roughness value=".8"/>
      <metallic value="0"/>
    </PBR>
  </Material>
  <Material name="RulerBlack">
    <PBR>
      <baseColor x=".01" y=".01" z=".01"/>
      <roughness value=".8"/>
      <metallic value="0"/>
    </PBR>
  </Material>
  <!-- the camera height line -->
  <Material name="CameraLine">
    <PBR>
      <baseColor x=".05" y=".7" z=".1"/>
      <roughness value=".8"/>
      <metallic value="0"/>
    </PBR>
  </Material>
  <Material name="RulerRed">
    <PBR>
      <baseColor x=".8" y=".02" z=".02"/>
      <roughness value=".8"/>
      <metallic value="0"/>
    </PBR>
  </Material>

  <Entity name="Track">

    <!-- ======================== SPAWN ========================
         The quad spawns on the game's own metal launch stand and faces +y
         (toward the wall). The stand rails are 0.075 m tall, so by default
         the quad rests 0.075 m above the ground.

         The stand Transform is at y = -0.03 so that the real spawn point
         is exactly at y = 0. MRSIM places the stand's StartPosition child
         0.03 m in front of the stand Transform: a child entity's
         WorldFromEntityComponent is relative to the enclosing Transform,
         not to the stand entity's own -0.125 m shift. (Measured in-game,
         2026-10-17.) The wall distance is measured from this point.

         To raise the quad by P metres:
           1. remove the comment marks around the platform below,
           2. set its Box z = P and its WorldFromEntityComponent z = P / 2,
           3. set the z of the launch stand Transform to P.
         Example for P = 0.5:  Box z=".5", component z=".25", stand z=".5"
    -->
${spawnXml(P)}
    <!-- ===================== WALL_DISTANCE =====================
         y = distance in metres from the spawn point to the wall FACE.
         Everything on the wall moves with this one number.
    -->
    <Transform y="${f(D)}">

      <!-- the wall: 20 m wide, 6 m tall, 0.1 m thick, solid.
           It is wide so that it fills the view of a wide lens at 2 m.
           The Box centre is 0.05 m behind the face, so the face is at y = 0 here. -->
      <Entity name="wall">
        <WorldFromEntityComponent y=".05" z="3"/>
        <Box x="20" y=".1" z="6"/>
        <StaticContact material="TrackPart"/>
        <MeshRendererComponent material="CalWall" subdivisions="1"/>
      </Entity>

      <!-- All marks below sit on the wall face (3 to 5 mm in front of the face, 1 mm thick)
           and have no StaticContact, so they do not collide. -->

${marks ? `      <!-- ======================== DOOR ========================
           W = ${f(doorW)} m wide, H = ${f(doorH)} m tall, bottom on the floor, centred on x = 0.
           top   : z = H,   Box x = W + T
           left  : x = -W/2, z = H/2, Box z = H + T
           right : x = +W/2, z = H/2, Box z = H + T
      -->
${door(doorW, doorH, TAPE, 'TapeDoor')}
      <!-- door size labels in cm, 7.5 cm tall, inside the door:
           "${cm(doorW)}" = width, under the top tape; "${cm(doorH)}" = height, near the floor -->
${doorLabels(doorW, doorH, 'TapeDoor')}

      <!-- ====================== SQUARES ======================
           small square: centre height C = ${f(C)} m, side S = ${f(smallS)} (spans ${f(C - smallS / 2)} to ${f(C + smallS / 2)} m)
      -->
${square('squareSmall', smallS, C, TAPE, 'TapeSmall')}
      <!-- size label "${cm(smallS)}" (cm), 10 cm tall, outside the top-left corner -->
${squareLabel('squareSmall', smallS, C, 'TapeSmall')}

      <!-- large square: centre height C = ${f(C)} m, side S = ${f(largeS)} (spans ${f(C - largeS / 2)} to ${f(C + largeS / 2)} m)
           -->
${square('squareLarge', largeS, C, TAPE, 'TapeLarge')}
      <!-- size label "${cm(largeS)}" (cm), 10 cm tall, outside the top-left corner -->
${squareLabel('squareLarge', largeS, C, 'TapeLarge')}

` : `      <!-- no door or squares in this file (rulers only) -->

`}      <!-- ======================== RULER ========================
           Vertical height scale on x = 0. Each line is one mark.
           The CENTRE of each 4 mm mark (1.5 mm in front of the tape) is at the height it shows.
           Mark width: 1 cm = 2 cm wide, 5 cm = 4 cm, 10 cm = 8 cm,
           50 cm = 16 cm and red. You do not need to edit this section.
      -->
${ruler()}

${cameraH > 0 ? cameraLine(cameraH) : ''}
      <!-- RULER NUMBERS: the height in CENTIMETRES beside each 10 cm mark,
           drawn from flat bars (seven-segment style). Red at every 50 cm.
           Each number is centred on the height of its mark. -->
${labels(hRulerZ > 0 ? hRulerZ : -1)}${hRulerZ > 0 ? `\n\n      <!-- HORIZONTAL RULER at ${f(hRulerZ * 100)} cm (the lens height): marks every 1 cm out to\n           1 m, then every 5 cm out to 6 m; numbers = cm from the centre line.\n           With Camera Angle 0 it gives the true angle at each image column. -->\n${hRuler(hRulerZ)}` : ''}

    </Transform>

    <!-- ================= START / FINISH GATE =================
         6 m behind the quad, out of view. Needed for MRSIM to run the track.
    -->
    <Transform y="-6">
      <Entity name="startGate">
        <Instance macro="Centered7x6StartFinishGate"/>
      </Entity>
    </Transform>

    <CheckpointList>
      {
          isCircuit: true,
          checkpoints:
          [
              "startGate"
          ]
      }
    </CheckpointList>
  </Entity>
</Simulation>
`;
}

