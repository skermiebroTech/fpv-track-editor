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
| `models/mrsim/models.json` | Model index for MRSIM objects (empty subset by default; `.glb` files stay local) |

## Notes

The editor is a fan-made tool. It is not affiliated with, endorsed by, or
associated with MRSIM's developer. All MRSIM object names, prefab ids and
material names remain the property of their respective owners.
