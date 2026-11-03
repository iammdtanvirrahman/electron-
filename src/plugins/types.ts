import type * as THREE from 'three';

export type PluginPermission = 'scene:read' | 'scene:write' | 'ui:notify';

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  permissions: PluginPermission[];
}

export interface PluginTool {
  id: string;
  name: string;
  description: string;
  run: () => void | Promise<void>;
}

export interface ElectronPluginApi {
  scene: {
    addPrimitive: (kind: 'box' | 'sphere' | 'cylinder' | 'cone' | 'torus') => THREE.Mesh;
    getObjectCount: () => number;
  };
  ui: {
    notify: (message: string) => void;
  };
  tools: {
    register: (tool: PluginTool) => void;
  };
}

export interface ElectronPlugin {
  manifest: PluginManifest;
  activate: (api: ElectronPluginApi) => void | Promise<void>;
  deactivate?: () => void | Promise<void>;
}
