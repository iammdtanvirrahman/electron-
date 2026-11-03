import type { ElectronPlugin, ElectronPluginApi, PluginTool } from './types';

export class PluginManager {
  private plugins = new Map<string, ElectronPlugin>();
  private tools = new Map<string, { pluginId: string; tool: PluginTool }>();
  private enabled = new Set<string>();

  constructor(private readonly api: ElectronPluginApi) {}

  async install(plugin: ElectronPlugin): Promise<void> {
    const { manifest } = plugin;
    if (!/^[a-z0-9][a-z0-9.-]{1,63}$/.test(manifest.id)) {
      throw new Error('Invalid plugin ID. Use 2–64 lowercase letters, numbers, dots or hyphens.');
    }
    if (this.plugins.has(manifest.id)) throw new Error(`Plugin "${manifest.id}" is already installed.`);
    const allowed = new Set(['scene:read', 'scene:write', 'ui:notify']);
    const unknown = manifest.permissions.filter((permission) => !allowed.has(permission));
    if (unknown.length) throw new Error(`Unsupported permissions: ${unknown.join(', ')}`);
    this.plugins.set(manifest.id, plugin);
    try {
      await this.enable(manifest.id);
    } catch (error) {
      this.plugins.delete(manifest.id);
      throw error;
    }
  }

  async enable(id: string): Promise<void> {
    const plugin = this.plugins.get(id);
    if (!plugin) throw new Error('Plugin not found.');
    if (this.enabled.has(id)) return;
    const declared = new Set(plugin.manifest.permissions);
    const scopedApi: ElectronPluginApi = {
      scene: {
        addPrimitive: (kind) => {
          if (!declared.has('scene:write')) throw new Error('Plugin lacks scene:write permission.');
          return this.api.scene.addPrimitive(kind);
        },
        getObjectCount: () => {
          if (!declared.has('scene:read')) throw new Error('Plugin lacks scene:read permission.');
          return this.api.scene.getObjectCount();
        },
      },
      ui: {
        notify: (message) => {
          if (!declared.has('ui:notify')) throw new Error('Plugin lacks ui:notify permission.');
          this.api.ui.notify(message);
        },
      },
      tools: {
        register: (tool) => {
          if (!tool.id || !tool.name || typeof tool.run !== 'function') throw new Error('Invalid plugin tool definition.');
          const toolId = `${id}:${tool.id}`;
          if (this.tools.has(toolId)) throw new Error(`Tool "${toolId}" already exists.`);
          this.tools.set(toolId, { pluginId: id, tool });
        },
      },
    };
    await plugin.activate(scopedApi);
    this.enabled.add(id);
  }

  async disable(id: string): Promise<void> {
    const plugin = this.plugins.get(id);
    if (!plugin || !this.enabled.has(id)) return;
    await plugin.deactivate?.();
    this.enabled.delete(id);
    for (const [toolId, entry] of this.tools) {
      if (entry.pluginId === id) this.tools.delete(toolId);
    }
  }

  async uninstall(id: string): Promise<void> {
    await this.disable(id);
    this.plugins.delete(id);
  }

  async runTool(id: string): Promise<void> {
    const entry = this.tools.get(id);
    if (!entry || !this.enabled.has(entry.pluginId)) throw new Error('Plugin tool is not available.');
    await entry.tool.run();
  }

  list() {
    return [...this.plugins.values()].map((plugin) => ({
      manifest: plugin.manifest,
      enabled: this.enabled.has(plugin.manifest.id),
      tools: [...this.tools.entries()]
        .filter(([, entry]) => entry.pluginId === plugin.manifest.id)
        .map(([id, entry]) => ({ id, name: entry.tool.name, description: entry.tool.description })),
    }));
  }

  listTools() {
    return [...this.tools.entries()].map(([id, entry]) => ({
      id, pluginId: entry.pluginId, name: entry.tool.name, description: entry.tool.description,
    }));
  }
}
