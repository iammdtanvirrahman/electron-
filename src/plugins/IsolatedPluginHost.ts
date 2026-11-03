import type { PluginManifest, PluginPermission } from './types';

export interface ExternalPluginPackage {
  manifest: PluginManifest;
  code: string;
}

type ToolInfo = { id: string; pluginId: string; name: string; description: string };
type RecordEntry = { pkg: ExternalPluginPackage; frame: HTMLIFrameElement | null; enabled: boolean; tools: Map<string, ToolInfo> };

const PERMISSIONS = new Set<PluginPermission>(['scene:read', 'scene:write', 'ui:notify']);
const PRIMITIVES = new Set(['box', 'sphere', 'cylinder', 'cone', 'torus']);
const STORAGE_KEY = 'electron.external-plugins.v1';

export class IsolatedPluginHost {
  private plugins = new Map<string, RecordEntry>();
  private tools = new Map<string, ToolInfo>();

  constructor(private readonly host: {
    addPrimitive: (kind: 'box' | 'sphere' | 'cylinder' | 'cone' | 'torus') => { name?: string };
    getObjectCount: () => number;
    notify: (message: string) => void;
  }) {
    window.addEventListener('message', (event) => this.onMessage(event));
  }

  private validate(pkg: ExternalPluginPackage) {
    const m = pkg?.manifest;
    if (!m || !/^[a-z0-9][a-z0-9.-]{1,63}$/.test(m.id)) throw new Error('Invalid plugin ID.');
    for (const field of ['name', 'version', 'description', 'author'] as const) {
      if (typeof m[field] !== 'string' || !m[field].trim() || m[field].length > 160) throw new Error('Invalid plugin field: ' + field);
    }
    if (!Array.isArray(m.permissions) || m.permissions.some((p) => !PERMISSIONS.has(p))) throw new Error('Unsupported plugin permission.');
    if (typeof pkg.code !== 'string' || !pkg.code.trim() || pkg.code.length > 100000) throw new Error('Plugin code must be under 100 KB.');
    if (!/^\\s*(async\\s*)?\\(?\\s*api\\s*\\)?\\s*=>/.test(pkg.code)) throw new Error('Plugin code must be an (api) => { ... } function.');
  }

  async install(pkg: ExternalPluginPackage, persist = true) {
    this.validate(pkg);
    const id = pkg.manifest.id;
    if (this.plugins.has(id)) throw new Error('Plugin is already installed.');
    const entry: RecordEntry = { pkg, frame: null, enabled: false, tools: new Map() };
    this.plugins.set(id, entry);
    try {
      await this.enable(id);
      if (persist) this.save();
    } catch (error) {
      this.plugins.delete(id);
      throw error;
    }
  }

  async enable(id: string) {
    const entry = this.plugins.get(id);
    if (!entry) throw new Error('Plugin not found.');
    if (entry.enabled) return;
    const frame = document.createElement('iframe');
    frame.title = 'Isolated plugin: ' + entry.pkg.manifest.name;
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;width:0;height:0;border:0;left:-10000px;top:-10000px';
    const pluginCode = entry.pkg.code.replace(/<\\/script/gi, '<\\\\/script');
    frame.srcdoc = `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; connect-src 'none'; img-src data:; style-src 'unsafe-inline'"><script>
      (() => {
        const activate = (${pluginCode});
        const callbacks = new Map();
        const pending = new Map();
        let sequence = 0;
        const request = (action, args) => new Promise((resolve, reject) => {
          const requestId = ++sequence;
          pending.set(requestId, { resolve, reject });
          parent.postMessage({ channel: 'electron-plugin', type: 'api', requestId, action, args }, '*');
          setTimeout(() => { if (pending.has(requestId)) { pending.delete(requestId); reject(new Error('Host request timed out')); } }, 5000);
        });
        const api = {
          scene: {
            addPrimitive: (kind) => request('scene:addPrimitive', { kind }),
            getObjectCount: () => request('scene:getObjectCount', {})
          },
          ui: { notify: (message) => request('ui:notify', { message }) },
          tools: { register: (tool) => {
            if (!tool || typeof tool.id !== 'string' || typeof tool.name !== 'string' || typeof tool.run !== 'function') throw new Error('Invalid plugin tool');
            callbacks.set(tool.id, tool.run);
            parent.postMessage({ channel: 'electron-plugin', type: 'register-tool', tool: { id: tool.id, name: tool.name, description: String(tool.description || '') } }, '*');
          } }
        };
        addEventListener('message', async (event) => {
          const msg = event.data;
          if (!msg || msg.channel !== 'electron-plugin') return;
          if (msg.type === 'api-result') {
            const item = pending.get(msg.requestId);
            if (item) { pending.delete(msg.requestId); msg.error ? item.reject(new Error(msg.error)) : item.resolve(msg.value); }
          }
          if (msg.type === 'run-tool') {
            try { await callbacks.get(msg.toolId)?.(); }
            catch (error) { parent.postMessage({ channel: 'electron-plugin', type: 'plugin-error', message: String(error) }, '*'); }
          }
        });
        try {
          Promise.resolve(activate(api)).catch(error => parent.postMessage({ channel: 'electron-plugin', type: 'plugin-error', message: String(error) }, '*'));
        } catch (error) {
          parent.postMessage({ channel: 'electron-plugin', type: 'plugin-error', message: String(error) }, '*');
        }
      })();
    <\\/script>`;
    entry.frame = frame;
    document.body.append(frame);
    entry.enabled = true;
    await new Promise<void>((resolve) => window.setTimeout(resolve, 150));
  }

  private onMessage(event: MessageEvent) {
    const entry = [...this.plugins.values()].find((item) => item.frame?.contentWindow === event.source);
    if (!entry || !event.data || event.data.channel !== 'electron-plugin') return;
    const msg = event.data;
    if (msg.type === 'register-tool') {
      const tool = msg.tool as { id?: string; name?: string; description?: string };
      if (!tool || typeof tool.id !== 'string' || !/^[a-z0-9-]{1,48}$/.test(tool.id) || typeof tool.name !== 'string' || tool.name.length > 80) return;
      const id = entry.pkg.manifest.id + ':' + tool.id;
      if (this.tools.has(id)) return;
      const info = { id, pluginId: entry.pkg.manifest.id, name: tool.name, description: String(tool.description || '') };
      entry.tools.set(id, info);
      this.tools.set(id, info);
      window.dispatchEvent(new CustomEvent('electron-plugins-changed'));
      return;
    }
    if (msg.type === 'plugin-error') { this.host.notify('Plugin error: ' + String(msg.message).slice(0, 160)); return; }
    if (msg.type !== 'api') return;
    const permissions = new Set(entry.pkg.manifest.permissions);
    const reply = (value?: unknown, error?: string) => entry.frame?.contentWindow?.postMessage({ channel: 'electron-plugin', type: 'api-result', requestId: msg.requestId, value, error }, '*');
    try {
      const args = msg.args || {};
      if (msg.action === 'scene:addPrimitive') {
        if (!permissions.has('scene:write')) throw new Error('Permission denied: scene:write');
        if (!PRIMITIVES.has(args.kind)) throw new Error('Unsupported primitive');
        reply({ name: this.host.addPrimitive(args.kind).name || 'Created' });
      } else if (msg.action === 'scene:getObjectCount') {
        if (!permissions.has('scene:read')) throw new Error('Permission denied: scene:read');
        reply(this.host.getObjectCount());
      } else if (msg.action === 'ui:notify') {
        if (!permissions.has('ui:notify')) throw new Error('Permission denied: ui:notify');
        this.host.notify(String(args.message || '').slice(0, 180));
        reply(true);
      } else throw new Error('Unknown plugin API action');
    } catch (error) { reply(undefined, error instanceof Error ? error.message : 'Plugin API error'); }
  }

  async disable(id: string) {
    const entry = this.plugins.get(id);
    if (!entry || !entry.enabled) return;
    entry.frame?.remove();
    entry.frame = null;
    entry.enabled = false;
    for (const toolId of entry.tools.keys()) this.tools.delete(toolId);
    entry.tools.clear();
    this.save();
    window.dispatchEvent(new CustomEvent('electron-plugins-changed'));
  }

  async uninstall(id: string) { await this.disable(id); this.plugins.delete(id); this.save(); }

  async runTool(id: string) {
    const tool = this.tools.get(id);
    const entry = tool && this.plugins.get(tool.pluginId);
    if (!entry?.enabled || !entry.frame?.contentWindow) throw new Error('Plugin tool unavailable.');
    entry.frame.contentWindow.postMessage({ channel: 'electron-plugin', type: 'run-tool', toolId: id.slice(tool.pluginId.length + 1) }, '*');
  }

  list() { return [...this.plugins.values()].map(({ pkg, enabled }) => ({ manifest: pkg.manifest, enabled })); }
  listTools() { return [...this.tools.values()]; }

  private save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...this.plugins.values()].map((entry) => entry.pkg))); }
    catch { this.host.notify('Plugin storage is full; changes may not persist.'); }
  }

  async restore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const packages = JSON.parse(raw) as ExternalPluginPackage[];
      if (!Array.isArray(packages)) return;
      for (const pkg of packages.slice(0, 20)) {
        try { await this.install(pkg, false); } catch (error) { console.warn('Skipped saved plugin', error); }
      }
    } catch { this.host.notify('Could not restore saved plugins.'); }
  }
}
