import type { ElectronPlugin } from '../types';

const primitivePack: ElectronPlugin = {
  manifest: {
    id: 'electron.primitive-pack',
    name: 'Primitive Pack',
    version: '1.0.0',
    description: 'Adds a torus creation tool to the 3D workspace.',
    author: 'ELECTRON',
    permissions: ['scene:write', 'ui:notify'],
  },
  activate(api) {
    api.tools.register({
      id: 'add-torus',
      name: 'Create Torus',
      description: 'Add a smooth donut-shaped mesh to the current scene.',
      run() {
        api.scene.addPrimitive('torus');
        api.ui.notify('Torus added by Primitive Pack');
      },
    });
  },
};

export default primitivePack;
