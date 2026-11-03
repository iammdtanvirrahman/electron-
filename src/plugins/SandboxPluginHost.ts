import type { PluginManifest, PluginPermission } from './types';

export interface ExternalPluginPackage {
  manifest: PluginManifest;
  code: string;
}

type ToolInfo = { id: string; pluginId: string; name: string; description: string };
type PluginRecord = { pkg: ExternalPluginPackage; frame: HTMLIFrameElement | null; enabled: boolean; tools: Map<string, ToolInfo> };

const PERMISSIONS = new Set<PluginPermission>(['scene:read', 'scene:write', 'ui:notify']);
const PRIMITIVES = new Set(['box', 'sphere', 'cylinder', 'cone', 'torus']);
const STORAGE_KEY = 'electron.external-plugins.v1';

export class SandboxPluginHost {
  private plugins = new Map<string, PluginRecord>();
  private toolIndex = new Map<string, ToolInfo>();

  constructor(private readonly host: {
    addPrimitive: (kind: 'box' | 'sphere' | 'cylinder' | 'cone' | 'torus') => unknown;
    getObjectCount: () => number;
    notify: (message: string) => void;
  }) {
    window.addEventListener('message', (event: MessageEvent) => this.onMessage(event));
  }

  validate(pkg: ExternalPluginPackage): void {
    const manifest = pkg?.manifest;
    if (!manifest || !/^[a-z0-9][a-z0-9.-]{1,63}$/.test(manifest.id)) throw new Error('Invalid plugin manifest or ID.');
    for (const field of ['name', 'version', 'description', 'author'] as const) {
      if (typeof manifest[field] !== 'string' || !manifest[field].trim() || manifest[field].length > 160) {
        throw new Error(`Invalid plugin manifest field: ${field}`);
      }
    }
    if (!Array.isArray(manifest.permissions) || manifest.permissions.some((p) => !PERMISSIONS.has(p))) {
      throw new Error('Plugin requests an unsupported permission.');
    }
    if (typeof pkg.code !== 'string' || !pkg.code.trim() || pkg.code.length > 100_000) {
      throw new Error('Plugin code must be a non-empty function expression under 100 KB.');
    }
    if (!/^(\s*async\s*)?\(?\s*api\s*\)?\s*=>/.test(pkg.code) && !/^async?\s+function\s*\(/.test(pkg.code)) {
      throw new Error('Plugin code must be an activate(api) function expression.');
    }
  }

  async install(pkg: ExternalPluginPackage, persist = true): Promise<void> {
    this.validate(pkg);
    const id = pkg.manifest.id;
    if (this.plugins.has(id)) throw new Error(`Plugin "${id}" is already installed.`);
    const record: PluginRecord = { pkg, frame: null, enabled: false, tools: new Map() };
    this.plugins.set(id, record);
    try {
      await this.enable(id);
      if (persist) this.persist();
    } catch (error) {
      this.plugins.delete(id);
      throw error;
    }
  }

  async enable(id: string): Promise<void> {
    const record = this.plugins.get(id);
    if (!record) throw new Error('Plugin not found.');
    if (record.enabled) return;
    const frame = document.createElement('iframe');
    frame.title = `Sandbox: ${record.pkg.manifest.name}`;
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;width:0;height:0;border:0;left:-10000px;top:-10000px';
    const code = record.pkg.code.replace(/<\\/script/gi, '<\\\\/script');
    frame.srcdoc = `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; connect-src 'none'; img-src data:; style-src 'unsafe-inline'"><script>
      (() => {
        const activate = (${code});
        const tools = new Map();
        let seq = 0;
        const pending = new Map();
        const request = (action, args) => new Promise((resolve, reject) => {
          const requestId = ++seq;
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
            if (!tool || typeof tool.id !== 'string' || typeof tool.name !== 'string' || typeof tool.run !== 'function') throw new Error('Invalid tool');
            tools.set(tool.id, tool.run);
            parent.postMessage({ channel: 'electron-plugin', type: 'register-tool', tool: { id: tool.id, name: tool.name, description: String(tool.description || '') } }, '*');
          } }
        };
        window.addEventListener('message', async (event) => {
          const msg = event.data;
          if (!msg || msg.channel !== 'electron-plugin') return;
          if (msg.type === 'api-result') {
            const item = pending.get(msg.requestId);
            if (item) { pending.delete(msg.requestId); msg.error ? item.reject(new Error(msg.error)) : item.resolve(msg.value); }
          }
          if (msg.type === 'run-tool') {
            try { await tools.get(msg.toolId)?.(); }
            catch (error) { parent.postMessage({ channel: 'electron-plugin', type: 'plugin-error', message: String(error) }, '*'); }
          }
        });
        try {
          const activate = (0, eval)('(' + source + ')');
          Promise.resolve(activate(api)).catch(error => parent.postMessage({ channel: 'electron-plugin', type: 'plugin-error', message: String(error) }, '*'));
        } catch (error) {
          parent.postMessage({ channel: 'electron-plugin', type: 'plugin-error', message: String(error) }, '*');
        }
      })();
    <\/script>`;
    record.frame = frame;
    document.body.append(frame);
    record.enabled = true;
    await new Promise<void>((resolve) => window.setTimeout(resolve, 120));
  }

  private onMessage(event: MessageEvent): void {
    const record = [...this.plugins.values()].find((item) => item.frame?.contentWindow === event.source);
    if (!record) return;
    const msg = event.data;
    if (!msg || msg.channel !== 'electron-plugin') return;
    if (msg.type === 'register-tool') {
      const tool = msg.tool as { id?: string; name?: string; description?: string };
      if (!tool || typeof tool.id !== 'string' || !/^[a-z0-9-]{1,48}$/.test(tool.id) ||
          typeof tool.name !== 'string' || tool.name.length > 80) return;
      const id = `${record.pkg.manifest.id}:${tool.id}`;
      if (this.toolIndex.has(id)) return;
      const info: ToolInfo = { id, pluginId: record.pkg.manifest.id, name: tool.name, description: String(tool.description || '') };
      record.tools.set(id, info);
      this.toolIndex.set(id, info);
      window.dispatchEvent(new CustomEvent('electron-plugins-changed'));
      return;
    }
    if (msg.type === 'plugin-error') {
      this.host.notify(`Plugin error: ${String(msg.message).slice(0, 180)}`);
      return;
    }
    if (msg.type !== 'api') return;
    const permissions = new Set(record.pkg.manifest.permissions);
    const reply = (value?: unknown, error?: string) => record.frame?.contentWindow?.postMessage({
      channel: 'electron-plugin', type: 'api-result', requestId: msg.requestId, value, error,
    }, '*');
    try {
      const args = msg.args || {};
      if (msg.action === 'scene:addPrimitive') {
        if (!permissions.has('scene:write')) throw new Error('Permission denied: scene:write');
        if (!PRIMITIVES.has(args.kind)) throw new Error('Unsupported primitive');
        const object = this.host.addPrimitive(args.kind);
        reply({ name: (object as { name?: string })?.name || 'Object created' });
      } else if (msg.action === 'scene:getObjectCount') {
        if (!permissions.has('scene:read')) throw new Error('Permission denied: scene:read');
        reply(this.host.getObjectCount());
      } else if (msg.action === 'ui:notify') {
        if (!permissions.has('ui:notify')) throw new Error('Permission denied: ui:notify');
        this.host.notify(String(args.message || '').slice(0, 180));
        reply(true);
      } else {
        throw new Error('Unknown plugin API action');
      }
    } catch (error) {
      reply(undefined, error instanceof Error ? error.message : 'Plugin API error');
    }
  }

  async disable(id: string): Promise<void> {
    const record = this.plugins.get(id);
    if (!record || !record.enabled) return;
    record.frame?.remove();
    record.frame = null;
    record.enabled = false;
    for (const toolId of record.tools.keys()) this.toolIndex.delete(toolId);
    record.tools.clear();
    this.persist();
    window.dispatchEvent(new CustomEvent('electron-plugins-changed'));
  }

  async uninstall(id: string): Promise<void> {
    await this.disable(id);
    this.plugins.delete(id);
    this.persist();
  }

  async runTool(id: string): Promise<void> {
    const tool = this.toolIndex.get(id);
    const record = tool && this.plugins.get(tool.pluginId);
    if (!record?.enabled || !record.frame?.contentWindow) throw new Error('Plugin tool is unavailable.');
    record.frame.contentWindow.postMessage({ channel: 'electron-plugin', type: 'run-tool', toolId: id.split(':').slice(1).join(':') }, '*');
  }

  list() {
    return [...this.plugins.values()].map(({ pkg, enabled }) => ({ manifest: pkg.manifest, enabled }));
  }

  listTools() { return [...this.toolIndex.values()]; }

  private persist(): void {
    const packages = [...this.plugins.values()].map((record) => record.pkg);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(packages)); }
    catch { this.host.notify('Plugin storage is full; this install may not persist after reload.'); }
  }

  async restore(): Promise<void> {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const packages = JSON.parse(raw) as ExternalPluginPackage[];
      if (!Array.isArray(packages)) return;
      for (const pkg of packages.slice(0, 20)) {
        try { await this.install(pkg, false); } catch (error) { console.warn('Skipped invalid saved plugin', error); }
      }
    } catch { this.host.notify('Could not restore saved plugins.'); }
  }
}
