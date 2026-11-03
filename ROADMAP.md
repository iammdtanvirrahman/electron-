# ELECTRON Roadmap

## Milestone 0.1 — Lightweight editor foundation
- [x] Three.js WebGL 2 viewport
- [x] On-demand rendering
- [x] Primitive creation (cube, sphere, cylinder, cone)
- [x] Object selection and scene list
- [x] Move / rotate / scale gizmos
- [x] Transform inspector
- [x] Basic PBR material controls (base color, roughness, metalness)
- [x] GLB export
- [x] Adaptive viewport quality setting
- [ ] First automated build verification

## Milestone 0.2 — Modeling essentials
- [ ] Duplicate and rename objects
- [ ] Delete and undo / redo
- [ ] Editable dimensions and pivot controls
- [ ] Bevel and subdivision modifiers
- [ ] Snap and numeric transform entry
- [ ] Save / open project files

## Milestone 0.3 — Materials and texture workflow
- [ ] Texture maps: base color, normal, roughness, metalness, AO
- [ ] UV inspection and basic UV controls
- [ ] Material presets for plastic, painted metal, rubber and wood
- [ ] Texture resolution and memory budget controls

## Milestone 0.4 — Game asset pipeline
- [ ] GLB validation and export settings
- [ ] Mesh optimization and optional compression
- [ ] Collision proxy generation
- [ ] LOD generation
- [ ] Asset statistics: triangles, materials, textures and file size

## Milestone 0.5 — Production tools
- [ ] Pen and classroom desk starter templates
- [ ] Lighting and studio preview
- [ ] High-quality still render mode
- [ ] Local project library

## Performance rules
- Keep the editor viewport event-driven; do not render idle frames.
- Keep real-time shadows and expensive post-processing off by default.
- Cap device pixel ratio and provide a low-power quality preset.
- Dispose GPU resources when objects are removed or replaced.
- Load large textures only when needed.
