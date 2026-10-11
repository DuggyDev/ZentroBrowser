'use strict';
/**
 * Extensions use Electron's built-in (partial) Chromium extension support. Only UNPACKED extensions that you
 * choose yourself are loaded; there is no Chrome Web Store integration and toolbar popups are not available.
 */
const fs = require('fs');
const path = require('path');
const { dialog } = require('electron');

const bad = (m) => Object.assign(new Error(m), { expose: true });

class Extensions {
  constructor(ctx) { this.ctx = ctx; }

  get ses() { return this.ctx.regularSession; }

  async init() {
    for (const e of this.ctx.profile.extensions) if (e.enabled) await this._load(e);
    this.ctx.profile.setExtensions(this.ctx.profile.extensions);
  }

  async _load(e) {
    try {
      const x = await this.ses.extensions.loadExtension(e.path, { allowFileAccess: false });
      e.id = x.id; e.name = x.name || e.name; e.version = x.version || e.version; e.error = null;
    } catch (err) {
      e.error = String(err && err.message ? err.message : err).slice(0, 200);
    }
  }

  list() { return this.ctx.profile.extensions.map((e) => ({ ...e })); }

  async chooseAndAdd(win) {
    const r = await dialog.showOpenDialog(win, { title: 'Choose an unpacked extension folder', properties: ['openDirectory'] });
    if (r.canceled || !r.filePaths[0]) return null;
    return this.add(r.filePaths[0]);
  }

  async add(dir) {
    let manifest;
    try { manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')); } catch { throw bad('That folder has no valid manifest.json.'); }
    if (![2, 3].includes(manifest.manifest_version) || typeof manifest.name !== 'string' || typeof manifest.version !== 'string') {
      throw bad('This does not look like a browser extension (manifest version 2 or 3 is required).');
    }
    const list = this.ctx.profile.extensions;
    if (list.some((e) => e.path === dir)) throw bad('That extension is already added.');
    const entry = {
      path: dir, enabled: true, id: null, name: manifest.name.slice(0, 80), version: manifest.version.slice(0, 30), error: null,
      permissions: [...(manifest.permissions || []), ...(manifest.host_permissions || [])].filter((p) => typeof p === 'string').slice(0, 30),
    };
    await this._load(entry);
    list.push(entry);
    this.ctx.profile.setExtensions(list);
    return { ...entry };
  }

  async setEnabled(p, enabled) {
    const e = this.ctx.profile.extensions.find((x) => x.path === p);
    if (!e) throw bad('Extension not found.');
    if (enabled) { e.enabled = true; await this._load(e); } else {
      e.enabled = false;
      if (e.id) { try { await this.ses.extensions.removeExtension(e.id); } catch { /* already gone */ } }
      e.id = null; e.error = null;
    }
    this.ctx.profile.setExtensions(this.ctx.profile.extensions);
  }

  async remove(p) {
    await this.setEnabled(p, false).catch(() => {});
    this.ctx.profile.setExtensions(this.ctx.profile.extensions.filter((x) => x.path !== p));
  }
}

module.exports = { Extensions };
