# ELECTRON — Realtime 3D Asset Studio

A lightweight, browser-based 3D asset creation studio designed for game-ready assets.

## Current milestone: Foundation

- Lightweight Three.js WebGL 2 viewport
- Dark, focused editor interface
- Primitive creation: box, sphere, cylinder
- Select and transform objects
- Material color editing
- GLB export
- Adaptive quality settings for integrated GPUs

## Development

```bash
npm install
npm run dev
```

## Performance principles

- Render only when the scene changes or the camera moves
- Cap device pixel ratio
- Keep real-time shadows and post-processing disabled by default
- Dispose removed GPU resources
- Prefer compact geometry and compressed textures for exported assets

## Tech stack

- TypeScript
- Vite
- Three.js / WebGL 2
- GLTFExporter

ELECTRON is an independent 3D asset editor project.
