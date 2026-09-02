#!/usr/bin/env node
// Validates every object file in community/ and rewrites community/index.json,
// the list the editor fetches at start-up. Run with no arguments:
//
//   node scripts/build-community-index.mjs          # validate + write index
//   node scripts/build-community-index.mjs --check  # validate, fail if stale
//
// A GitHub Action runs it on every pull request (validate) and on every merge
// to main (write + commit), so a contributor only has to add their .json file.
// No dependencies — plain Node 18+.
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'community');
const INDEX = join(DIR, 'index.json');
const check = process.argv.includes('--check');

// the same shapes the editor's object builder accepts, with their dim counts
const SHAPES = { box: 3, cyl: 2, sphere: 1, pyramid: 3, wedge: 3, cone: 2, mesh: 3 };
const ID_RE = /^custom_[a-z0-9][a-z0-9-]*$/;
const FILE_RE = /^[a-z0-9][a-z0-9._-]*\.json$/;

const errors = [];
const err = (file, msg) => errors.push(`community/${file}: ${msg}`);

const isNums = (v, n) => Array.isArray(v) && v.length >= n && v.slice(0, n).every(x => typeof x === 'number' && isFinite(x));

// mirrors communityObjects() in index.html: a file is one object, an array of
// objects, or { author, objects }
function objectsOf(v) {
  if (Array.isArray(v)) return v;
  if (v && typeof v === 'object' && Array.isArray(v.objects)) return v.objects;
  return [v];
}

function validateObject(file, o, i) {
  const where = `object ${i + 1}`;
  if (!o || typeof o !== 'object') return err(file, `${where}: not an object`);
  if (typeof o.id !== 'string' || !ID_RE.test(o.id))
    err(file, `${where}: "id" must look like "custom_my-object" (lower-case letters, digits, dashes)`);
  if (typeof o.label !== 'string' || !o.label.trim())
    err(file, `${where}: "label" (the palette name) is missing`);
  if (o.cp != null && o.cp !== 'pass')
    err(file, `${where}: "cp" must be null or "pass"`);
  if (o.cp === 'pass' && !(o.pass && isNums(o.pass.pos, 3) && isNums(o.pass.dims, 3)))
    err(file, `${where}: a checkpoint object needs "pass": { pos: [x,y,z], dims: [w,d,h] }`);
  if (o.author != null && typeof o.author !== 'string')
    err(file, `${where}: "author" must be text`);
  if (!Array.isArray(o.parts) || !o.parts.length)
    return err(file, `${where}: "parts" must be a non-empty array`);
  o.parts.forEach((p, j) => {
    const at = `${where}, part ${j + 1}`;
    if (!p || typeof p !== 'object') return err(file, `${at}: not an object`);
    if (!(p.shape in SHAPES)) return err(file, `${at}: unknown shape "${p.shape}" (use ${Object.keys(SHAPES).join('/')})`);
    if (!isNums(p.pos, 3)) err(file, `${at}: "pos" must be [x, y, z]`);
    if (!isNums(p.rot, 3)) err(file, `${at}: "rot" must be [yaw, pitch, roll]`);
    if (!isNums(p.dims, SHAPES[p.shape])) err(file, `${at}: "${p.shape}" needs ${SHAPES[p.shape]} dims`);
    if (typeof p.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(p.color)) err(file, `${at}: "color" must be "#rrggbb"`);
    if (p.shape === 'mesh') {
      if (!Array.isArray(p.verts) || p.verts.length < 9 || p.verts.length % 3) err(file, `${at}: mesh "verts" must be a flat x,y,z list`);
      if (!Array.isArray(p.tris) || p.tris.length < 3 || p.tris.length % 3) err(file, `${at}: mesh "tris" must be a flat a,b,c list`);
    }
  });
}

if (!existsSync(DIR)) { console.error('no community/ folder'); process.exit(1); }

const files = readdirSync(DIR).filter(f => f.endsWith('.json') && f !== 'index.json').sort();
const ids = new Map();   // id -> file that claimed it first
let count = 0;           // community objects seen

// repo-shared ids are reserved: a community object must not shadow one
try {
  for (const o of JSON.parse(readFileSync(join(ROOT, 'components.json'), 'utf8')))
    if (o?.id) ids.set(o.id, 'components.json');
} catch { /* no components.json — nothing reserved */ }

for (const f of files) {
  if (!FILE_RE.test(f)) err(f, 'file name may only use lower-case letters, digits, dots, dashes and underscores');
  let v;
  try { v = JSON.parse(readFileSync(join(DIR, f), 'utf8')); }
  catch (e) { err(f, `not valid JSON (${e.message})`); continue; }
  if (v && !Array.isArray(v) && typeof v === 'object' && 'author' in v && typeof v.author !== 'string')
    err(f, '"author" must be text');
  const objs = objectsOf(v);
  if (!objs.length) err(f, 'no objects in file');
  count += objs.length;
  objs.forEach((o, i) => {
    validateObject(f, o, i);
    if (typeof o?.id === 'string') {
      const prev = ids.get(o.id);
      if (prev) err(f, `id "${o.id}" is already used in ${prev} — pick another`);
      else ids.set(o.id, f);
    }
  });
}

if (errors.length) {
  console.error(`✗ ${errors.length} problem(s):\n` + errors.map(e => '  ' + e).join('\n'));
  process.exit(1);
}

const next = JSON.stringify(files, null, 2) + '\n';
const prev = existsSync(INDEX) ? readFileSync(INDEX, 'utf8') : '';
if (check) {
  if (prev !== next) {
    console.error('✗ community/index.json is out of date — run: node scripts/build-community-index.mjs');
    process.exit(1);
  }
  console.log(`✓ ${files.length} community file(s) valid, index up to date`);
} else {
  if (prev !== next) writeFileSync(INDEX, next);
  console.log(`✓ ${files.length} community file(s) valid, ${count} object(s) → community/index.json ${prev === next ? 'unchanged' : 'written'}`);
}
