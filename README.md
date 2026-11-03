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


## Plugin system (v0.2)

ELECTRON now includes a permission-scoped plugin SDK and Plugin Manager.

- Plugin manifests declare an ID, version, author, description and permissions.
- Plugins can register tools that appear in the Plugin Manager.
- Enable, disable and uninstall are handled by the PluginManager API.
- The initial API exposes limited scene operations and UI notifications.
- A built-in **Primitive Pack** example adds a Torus creation tool.

### Plugin developer quick start

Create a TypeScript module that exports an `ElectronPlugin` object:

```ts
import type { ElectronPlugin } from '../types';

const plugin: ElectronPlugin = {
  manifest: {
    id: 'studio.my-plugin',
    name: 'My Plugin',
    version: '1.0.0',
    description: 'A custom creation tool',
    author: 'Your name',
    permissions: ['scene:write', 'ui:notify'],
  },
  activate(api) {
    api.tools.register({
      id: 'add-sphere',
      name: 'Add Sphere',
      description: 'Create a sphere in the scene',
      run() {
        api.scene.addPrimitive('sphere');
        api.ui.notify('Sphere created by My Plugin');
      },
    });
  },
};

export default plugin;
```

Install a bundled plugin with `pluginManager.install(plugin)`. The SDK validates manifest IDs and permission names, scopes API access to declared permissions, and removes registered tools when a plugin is disabled.

**Security note:** this first milestone is intended for bundled or developer-trusted plugins. Permission-scoped APIs are not a substitute for a true sandbox. Loading arbitrary third-party JavaScript, remote marketplace packages, filesystem access and network access are deliberately not enabled yet. Those require an isolated runtime, package signing, review and stronger capability controls.
