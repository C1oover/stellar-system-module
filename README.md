# Stellar System Module

First-pass Foundry VTT module scaffold for an Augur-style animated solar system scene.

## Implemented in this pass

- Scene-backed solar system data stored on scene flags
- Animated root system view
- Single-star and binary-star autopopulate presets
- Adjustable stars (color, size, glow)
- Binary stars orbiting around a barycenter
- Planets orbiting a star or a binary barycenter
- Figure-eight orbit mode for test bodies around a binary center
- Moon support via parent/child relationships
- Dual-planet support via shared pair IDs
- GM-only editor window with context-aware body fields
- Canvas click-to-select for GMs while the editor is open
- Player drill-down views: system -> planet -> moon
- Info popup for focused bodies

## Not implemented yet

- Texture maps / material layers for planets
- Journals linked directly by picker UI
- Dedicated local map scene hand-off
- Persistence of per-user nested view state across reloads
- A custom Foundry document type for bodies
- Route network / warp highways between star systems

## Installation

1. Copy the `stellar-system-module` folder into `Data/modules/`.
2. Enable the module in Foundry.
3. Open a scene.
4. Use the new **Solar System Editor** scene-control button.
5. Click an autopopulate button, then refine bodies in the editor.

## Notes

- This scaffold intentionally uses simple circles and shader-backed PIXI filters rather than textures.
- The module treats each Foundry scene as one star-system canvas for this first phase.
- The next logical step is linking bodies to JournalEntry pages and local map scenes.
