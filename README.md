# FPV Track Editor

A static, browser-based 3D track editor for
[MRSIM](https://store.steampowered.com/app/2338080/MRSIM/), built with
[Three.js](https://threejs.org/) and hosted on **GitHub Pages**.

Place any MRSIM object from a palette, edit the lap / checkpoint order,
move-rotate-scale with a gizmo, group-select with Ctrl-click, and export
the scene as an MRSIM `.xml` ready to drop into the game.

## Features

- 3D orbit view with a **TransformControls** gizmo (translate / rotate /
  scale), fine 0.01 m snap when the snap toggle is off, per-axis dims for
  primitive blocks
- **Palette** of every MRSIM gate, checkpoint, prim block, sphere, cylinder
  and macro, plus a saved-colour palette for quick recolouring
- **Object builder** — assemble a custom multi-part object from primitives
  and export it as a `components.json` snippet shared with the palette
- **Import an .obj mesh** as a part (beta) — exported as an inline MRSIM
  polyhedron so the mesh lives entirely inside the `.xml`
- **Lap manager** — reorder checkpoints per lap by drag, split/merge laps,
  manage the start/finish, insert dive rings
- Ctrl-click multi-select with group move / rotate / delete / duplicate
- Environment picker: Empty Grass World, Baylands Park, Hardesty BMX
- **Template images** — pin reference photos or maps to the ground plane
  (stored locally, never exported)
- **Headless self-verify harness** exposed on `window.__mrsim` and
  `window.__edit` for scripted regression checks

## Running locally

The editor is static — no build step, no npm install required. Any HTTP
server will do:

```
python3 -m http.server 8000
# then open http://localhost:8000/
```

## Layout

| File | Purpose |
| --- | --- |
| `index.html` | The editor page (UI, gizmo wiring, palette, lap manager) |
| `mrsim.js` | MRSIM `.xml` parser and scene helpers |
| `mrsim-lib.js` | Embedded MRSIM macro library (from the game's `MRSIM.dkb`) |
| `trk.js` | `.trk` decoder / encoder used by the file-open path |
| `components.json` | Repo-shared custom objects for the object builder |
| `community/` | Community-contributed objects, one `.json` per contributor (see below) |
| `community/index.json` | Generated list of the community files — do not edit by hand |
| `scripts/build-community-index.mjs` | Validates `community/` and rebuilds the index (runs in CI) |
| `models/mrsim/models.json` | Model index for MRSIM objects (empty subset by default; `.glb` files stay local) |

## Add your object to the community library

The palette has a **community** section. Everything in it comes from the
`community/` folder in this repo. When your file is merged, a GitHub Action
rebuilds `community/index.json` and the object appears in the editor for
everyone. You do not need to change any code.

This guide is for people who have never made a pull request. It takes about
ten minutes.

### The rules

- **The object must be your own work, or you must have consent from the
  original creator.** If you copied a design from another person, another
  track, or another tool, get their permission first and say who they are in
  the pull request. Pull requests that do not meet this rule will be declined.
- No real-world brand names or logos, unless you own them.
- One `.json` file per contributor. Add more objects to your file later with
  a new pull request.
- Keep the file small. A mesh part with thousands of triangles slows the
  editor for everyone.

### Step 1 — build the object

1. Open the editor and click **＋ build / manage objects…** in the palette.
2. Build your object from boxes, cylinders, spheres, pyramids, wedges and
   cones. Tick **checkpoint** if a drone must fly through it.
3. Give it a clear name in the **name** box, for example `arch gate 3 m`.
4. Type your name or GitHub handle in the **author** box. The editor
   remembers it for your next object. The palette shows it when someone
   hovers over your object.
5. Click **✓ save to palette**. Repeat for every object you want to share.

### Step 2 — export the file

1. In the builder, click **⤓ export all (components.json)**. Your browser
   downloads a file named `components.json` with all of your saved objects
   and your author name.
2. Rename the file to your GitHub user name, in lower case, for example
   `jane-doe.json`. Only letters, digits, dots, dashes and underscores are
   allowed.

The exported file looks like this:

```json
{
  "author": "jane-doe",
  "objects": [ ...your objects... ]
}
```

A plain list of objects also works. An object can carry its own `"author"`
field; that name wins over the file-level one.

### Step 3 — put the file in a fork of this repo

1. Sign in to GitHub and open
   <https://github.com/skermiebroTech/fpv-track-editor>.
2. Click **Fork** (top right). GitHub makes a copy of the repo under your
   account. Wait for the page to open.
3. In **your fork**, open the `community` folder.
4. Click **Add file ▸ Upload files**, drop your `.json` file on the page,
   and click **Commit changes**.

### Step 4 — open the pull request

1. Go back to the front page of your fork. A banner says your branch is ahead
   of the original. Click **Contribute ▸ Open pull request**.
2. Fill in the pull request form. It asks you to confirm that the object is
   your own work, or to name the creator who gave you consent. Tick the box
   that applies.
3. Click **Create pull request**.

### What happens next

- An automatic check runs on your pull request. If the file has a problem
  (bad JSON, a missing name, an id that is already in use), the check shows a
  red cross with the reason. Fix the file in your fork, upload it again, and
  the check runs again.
- A maintainer looks at the object and the ownership statement.
- After the merge, the site rebuilds and the object shows in the
  **community** section of the palette. Hover over the button to see the
  file name and author.

### Test it locally first (optional)

Clone your fork, drop the file in `community/`, and run:

```bash
node scripts/build-community-index.mjs
```

The script tells you about any problem in the file and rewrites
`community/index.json` so the object shows up when you open the editor
with a local HTTP server (see **Running locally**). You do not need to commit
the changed `index.json` — CI rebuilds it after the merge.

## Notes

The editor is a fan-made tool. It is not affiliated with, endorsed by, or
associated with MRSIM's developer. All MRSIM object names, prefab ids and
material names remain the property of their respective owners.
