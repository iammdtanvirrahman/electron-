import type { ExternalPluginPackage } from './SandboxPluginHost';

export const marketplacePackages: ExternalPluginPackage[] = [
  {
    manifest: {
      id: 'community.shape-tools',
      name: 'Shape Tools',
      version: '1.0.0',
      description: 'Adds extra primitive creation tools.',
      author: 'ELECTRON Community',
      permissions: ['scene:write', 'ui:notify'],
    },
    code: `(api) => {
      api.tools.register({
        id: 'add-torus',
        name: 'Add Torus',
        description: 'Create a donut-shaped mesh',
        run: async () => {
          await api.scene.addPrimitive('torus');
          await api.ui.notify('Torus created');
        }
      });
    }`,
  },
  {
    manifest: {
      id: 'community.scene-inspector',
      name: 'Scene Inspector',
      version: '1.0.0',
      description: 'Reports the current scene object count.',
      author: 'ELECTRON Community',
      permissions: ['scene:read', 'ui:notify'],
    },
    code: `(api) => {
      api.tools.register({
        id: 'count-objects',
        name: 'Count Scene Objects',
        description: 'Show the number of scene objects',
        run: async () => {
          const count = await api.scene.getObjectCount();
          await api.ui.notify('Scene contains ' + count + ' objects');
        }
      });
    }`,
  },
];
