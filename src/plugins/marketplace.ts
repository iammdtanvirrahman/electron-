import type { DeclarativePluginPackage } from './ExternalPluginManager';

export const marketplacePackages: DeclarativePluginPackage[] = [
  {
    manifest: {
      id: 'community.shape-tools',
      name: 'Shape Tools',
      version: '1.0.0',
      description: 'Adds torus and cone creation tools.',
      author: 'ELECTRON Community',
      permissions: ['scene:write'],
    },
    tools: [
      { id: 'add-torus', name: 'Add Torus', description: 'Create a donut-shaped mesh.', action: 'add-primitive', primitive: 'torus' },
      { id: 'add-cone', name: 'Add Cone', description: 'Create a cone mesh.', action: 'add-primitive', primitive: 'cone' }
    ]
  },
  {
    manifest: {
      id: 'community.scene-inspector',
      name: 'Scene Inspector',
      version: '1.0.0',
      description: 'Reports how many objects are in the current scene.',
      author: 'ELECTRON Community',
      permissions: ['scene:read'],
    },
    tools: [
      { id: 'count-objects', name: 'Count Scene Objects', description: 'Show the number of objects in the scene.', action: 'count-objects' }
    ]
  }
];
