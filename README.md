# Event Horizon

Five real-time black hole scenes in three.js, with a selector and a cross-fade:

- **I · Astronaut**: an astronaut sits in a violet flower field. The black hole lies on the horizon, seen almost edge-on.
- **II · Farmhouse**: a farmhouse and a pickup in a wheat field at night, under a large swirling disk.
- **III · Tide**: a pier runs out into a night sea that mirrors a blue-white black hole; a lighthouse sweeps its beam.
- **IV · Dunes**: a silver trailer and a Joshua tree in rose-violet dunes, under a red-gold swirling disk.
- **V · Glacier**: an A-frame cabin by a frozen lake; a cyan black hole hangs over a snowy range.

## Run

```sh
npm install
npm run dev      # http://localhost:5173
npm run build    # output in dist/
```

## Controls

| Key | Action |
| --- | --- |
| `1`–`5`, `←` / `→` | Switch scene (or use the buttons, or `#astronaut`, `#farmhouse`, `#tide`, `#dunes`, `#glacier`) |
| `H` | Hide the UI |
| `G` | Show the tuning panel (all scene parameters, "copy preset JSON") |
| `R` | Dev only: show the reference image over the render |
| `P` | Pointer parallax on or off |

URL options: `?gui` opens the panel, `?ref` shows the reference (dev), `?still` turns parallax off, `?dpr=1` sets the pixel ratio (max 1.5).

## How it works

- `src/blackhole/sky.ts`: a full-screen ray tracer. Each pixel follows a light ray through a Schwarzschild metric and collects light from a thin disk and a thick, streaky volume disk. Some settings are artistic, not physical (`farOuter`, `nearFade`, `secondary`, `mag`).
- `src/blackhole/atmosphere.ts`: a sky and fog model that the sky, ground and plants share, so the horizon matches.
- `src/scenes/field.ts`: ground, instanced flowers (near and far detail levels) and wheat, with wind.
- `src/scenes/water.ts`: water and ice that reflect the black hole sky (screen-space lookup of the sky target).
- `src/scenes/terrain.ts`: GPU height-field dunes and mountains.
- `src/scenes/models.ts`, `src/scenes/props.ts`: procedural stand-ins and props, and the GLB loader.
- Scenes are built on first use; the others are built and compiled while the browser is idle.
- `src/post/pipeline.ts`: half-resolution bokeh DOF, bloom, and a color grade (ACES, lift/gain, vignette, grain).
- The presets are at the top of `src/scenes/astronaut.ts` and `src/scenes/farmhouse.ts`.

## Models

`public/models/` holds `astronaut.glb`, `truck.glb`, `lighthouse.glb` and `trailer.glb`. They were modeled in Blender; the source is `blender/models.blend` (one collection per model). The astronaut and the truck replace procedural stand-ins and are scaled to the stand-in's height. Add `house.glb` to replace the procedural farmhouse the same way.

## Reference images

Put the two reference images in `ref/` as `astronaut.jpg` and `farmhouse.jpg`, turned upright (16:9). The folder is git-ignored.
