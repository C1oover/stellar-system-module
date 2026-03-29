# Generic Solar System

Prototype FoundryVTT module scaffold for a scene-level solar system renderer.

## Included in this first pass

- Scene-stored solar system configuration in module flags
- Shader-driven stellar glow for suns
- Single-star or binary-star systems
- Autopopulated generation dialog for stars, planets, moons, and twin-planet pairs
- Kepler-style orbits based on mass and distance for single-primary and binary-pair cases
- Circumbinary support and a figure-8 preview mode for bodies traveling between two suns
- GM-side floating editor with context-sensitive body controls
- Player-facing nested zoom flow with info popups
- Local-client zoom state, so each player can inspect bodies independently

## Current limitations

- Figure-8 motion is a stylized deterministic path, not a full three-body numerical solver
- Surface textures, atmospheric layers, rings, asteroid belts, and journal integration are not implemented yet
- The editor is functional but still prototype-level; deeper validation and drag handles are not included yet
- No server-authoritative sync loop is needed yet because the animation is deterministic from shared config and local time

## Install for local testing

1. Copy this folder into your Foundry user data `Data/modules/` directory.
2. Enable **Generic Solar System** in your world.
3. Open a scene.
4. Click the new globe tool in Scene Controls to open the GM editor.
5. Use **Create** or **Autopopulate**.

## Suggested next steps

1. Replace the figure-8 preview path with a restricted three-body integrator.
2. Add drag-to-reposition orbit anchors and live handles on the canvas.
3. Split the UI into a creation wizard and a richer editor app.
4. Add journal generation, notes, textures, and per-body detail pages.
5. Add scene-region masking and optional space skyboxes.
