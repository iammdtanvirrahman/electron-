import type { PluginManifest, PluginPermission } from './types';

export type DeclarativePluginTool = {
  id: string;
  name: string;
  description: string;
  action: 'add-primitive' | 'count-objects';
  primitive?: 'box' | 'sphere' | 'cylinder' | 'cone' | 'torus';
};

export interface DeclarativePluginPackage {
  manifest: PluginManifest;
  tools: DeclarativePluginTool[];
}

const permissions = new Set<PluginPermission>(['scene:read', 'scene:write', 'ui:notify']);
const storageKey = 'electron.declarative-plugins.v1';

export class ExternalPluginManager {
  private packages = new Map<string, DeclarativePluginPackage>();
  private enabled = new Set<string>();

  constructor(private readonly host: {
    addPrimitive: (kind: 'box' | 'sphere' | 'cylinder' | 'cone' | 'torus') => unknown;
    getObjectCount: () => number;
    notify: (message: string) => void;
  }) {}

  private validate(pkg: DeclarativePluginPackage) {
    const m = pkg?.manifest;
    if (!m || !/^[a-z0-9][a-z0-9.-]{1,63}$/.test(m.id)) throw new Error('Invalid plugin ID.');
    for (const field of ['name', 'version', 'description', 'author'] as const) {
      if (typeof m[field] !== 'string' || !m[field].trim() || m[field].length > 160) throw new Error('Invalid plugin field: ' + field);
    }
    if (!Array.isArray(m.permissions) || m.permissions.some((permission) => !permissions.has(permission))) throw new Error('Unsupported permission.');
    if (!Array.isArray(pkg.tools) || pkg.tools.length > 30) throw new Error('Plugin may define up to 30 tools.');
    const ids = new Set<string>();
    for (const tool of pkg.tools) {
      if (!tool || !/^[a-z0-9-]{1,48}$/.test(tool.id) || ids.has(tool.id)) throw new Error('Invalid or duplicate tool ID.');
      ids.add(tool.id);
      if (typeof tool.name !== 'string' || !tool.name.trim() || tool.name.length > 80) throw new Error('Invalid tool name.');
      if (tool.action === 'add-primitive') {
        if (!m.permissions.includes('scene:write') || !['box', 'sphere', 'cylinder', 'cone', 'torus'].includes(tool.primitive || '')) {
          throw new Error('add-primitive requires scene:write and a supported primitive.');
        }
      } else if (tool.action === 'count-objects') {
        if (!m.permissions.includes('scene:read')) throw new Error('count-objects requires scene:read.');
      } else throw new Error('Unsupported plugin action.');
    }
  }

  async install(pkg: DeclarativePluginPackage, persist = true) {
    this.validate(pkg);
    if (this.packages.has(pkg.manifest.id)) throw new Error('Plugin already installed.');
    this.packages.set(pkg.manifest.id, pkg);
    this.enabled.add(pkg.manifest.id);
    if (persist) this.save();
  }

  async enable(id: string) {
    if (!this.packages.has(id)) throw new Error('Plugin not found.');
    this.enabled.add(id);
    this.save();
  }

  async disable(id: string) {
    this.enabled.delete(id);
    this.save();
  }

  async uninstall(id: string) {
    this.enabled.delete(id);
    this.packages.delete(id);
    this.save();
  }

  async runTool(id: string) {
    const [pluginId, ...toolParts] = id.split(':');
    const toolId = toolParts.join(':');
    const pkg = this.packages.get(pluginId);
    if (!pkg || !this.enabled.has(pluginId)) throw new Error('Plugin is disabled or unavailable.');
    const tool = pkg.tools.find((item) => item.id === toolId);
    if (!tool) throw new Error('Plugin tool not found.');
    if (tool.action === 'add-primitive' && tool.primitive) {
      if (!pkg.manifest.permissions.includes('scene:write')) throw new Error('Permission denied.');
      this.host.addPrimitive(tool.primitive);
      this.host.notify(tool.name + ' completed');
    } else if (tool.action === 'count-objects') {
      if (!pkg.manifest.permissions.includes('scene:read')) throw new Error('Permission denied.');
      this.host.notify('Scene contains ' + this.host.getObjectCount() + ' objects');
    }
  }

  list() {
    return [...this.packages.values()].map((pkg) => ({ manifest: pkg.manifest, enabled: this.enabled.has(pkg.manifest.id) }));
  }

  listTools() {
    return [...this.packages.values()].filter((pkg) => this.enabled.has(pkg.manifest.id))
      .flatMap((pkg) => pkg.tools.map((tool) => ({ id: pkg.manifest.id + ':' + tool.id, name: tool.name, description: tool.description })));
  }

  private save() {
    try { localStorage.setItem(storageKey, JSON.stringify([...this.packages.values()])); }
    catch { this.host.notify('Plugin storage is full; changes may not persist.'); }
  }

  async restore() {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const packages = JSON.parse(raw) as DeclarativePluginPackage[];
      if (!Array.isArray(packages)) return;
      for (const pkg of packages.slice(0, 30)) {
        try { await this.install(pkg, false); } catch (error) { console.warn('Skipped invalid plugin package', error); }
      }
    } catch { this.host.notify('Could not restore installed plugins.'); }
  }
}
