'use strict';
/**
 * The floating AI assistant. Two native views float over the page:
 *   bar  - Zentro's own header (provider tabs, share buttons, drag handle)
 *   site - the AI's real website (ChatGPT, Claude, Gemini, Grok or your own link), signed in with YOUR account there
 * Nothing is sent to an AI automatically. "Share" puts the page text, your selection or a screenshot into the AI's
 * message box when you press the button; you still press Send yourself.
 */
const path = require('path');
const { WebContentsView, clipboard } = require('electron');
const compat = require('./compat');
const { providerList, currentProvider, SIZES, BAR_H, defaultRect, clampRect, buildPrompt } = require('../core/ai');

const PRELOAD = path.join(__dirname, '..', '..', 'preload.js');
const fail = (m) => Object.assign(new Error(m), { expose: true });

// Fixed scripts: no page text or user input is ever placed inside them.
const EXTRACT = `(() => {
  const sel = String(getSelection() || '').slice(0, 20000);
  const root = document.querySelector('article, main') || document.body;
  const text = ((root && root.innerText) || '').replace(/\\n{3,}/g, '\\n\\n').slice(0, 20000);
  return { selection: sel, text };
})()`;
const FOCUS_INPUT = `(() => {
  const c = [...document.querySelectorAll('textarea, [contenteditable="true"], [role="textbox"]')].filter((e) => e.offsetParent !== null);
  const e = c[0];
  if (e) { e.focus(); return true; }
  return false;
})()`;

class AiPanel {
  constructor(win) {
    this.win = win;
    this.open = false;
    this.bar = null;
    this.site = null;
    this.rect = null;
    this.size = 'm';
    this.providerId = null;
    this.loading = false;
    this.anim = null;
    this.extra = 0;
  }

  get settings() { return this.win.profile.settings; }
  get enabled() { return !!this.settings.ai.enabled; }

  state() {
    const list = providerList(this.settings.ai);
    const cur = this.providerId && list.find((p) => p.id === this.providerId) || currentProvider(this.settings.ai);
    return { open: this.open, provider: cur.id, providers: list.map((p) => ({ id: p.id, name: p.name })), loading: this.loading, size: this.size, private: this.win.isPrivate };
  }
  push() {
    for (const v of [this.bar, this.win.top]) if (v && !v.webContents.isDestroyed()) v.webContents.send('zentro:event', 'ai-state', this.state());
  }

  // ------------------------------------------------------------ open / close
  toggle() { if (this.open) this.close(); else this.show(); }

  show() {
    if (!this.enabled) throw fail('The AI assistant is turned off in Settings.');
    if (this.open) { this.win.win.contentView.addChildView(this.bar); this.win.raise(); return; }
    const cur = currentProvider(this.settings.ai);
    this.providerId = cur.id;
    this.bar = this._view('ai', 'zentro://ui/ai.html', true);
    this.site = this._view('aisite', null, false);
    this._loadSite(cur);
    this.open = true;
    const { W, H, topH } = this._dims();
    this.rect = this.rect ? clampRect(this.rect, W, H, topH) : defaultRect(this.size, W, H, topH);
    this.win.win.contentView.addChildView(this.site);
    this.win.win.contentView.addChildView(this.bar);
    this.win.raise();
    this.place(true);
    this.push();
    this.win.send('ui', { ai: this.state() });
  }

  close() {
    if (!this.open) return;
    this.open = false;
    clearInterval(this.anim);
    for (const v of [this.bar, this.site]) {
      if (!v) continue;
      try { this.win.win.contentView.removeChildView(v); } catch { /* detached */ }
      try { v.webContents.close(); } catch { /* closed */ }
    }
    this.bar = null; this.site = null;
    this.win.send('ui', { ai: this.state() });
    this.push();
  }
  destroy() { this.close(); }

  _view(role, url, withPreload) {
    const v = new WebContentsView({
      webPreferences: {
        session: withPreload ? this.win.app.uiSession : this.win.ses, ...(withPreload ? { preload: PRELOAD } : {}),
        contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true, spellcheck: !withPreload,
      },
    });
    v.setBackgroundColor(withPreload ? '#00000000' : '#0a0a0c');
    try { v.setBorderRadius(14); } catch { /* older Electron */ }
    const wc = v.webContents;
    this.win.app.register(wc, { window: this.win, role });
    this.win.guard(wc);
    if (url) wc.loadURL(url).catch(() => {});
    if (!withPreload) {
      this.win.app.vpn.applyToContents(wc);
      const ua = (u) => { try { wc.setUserAgent(compat.isGoogleAuth(u) ? compat.FIREFOX_UA : compat.CHROME_UA); } catch { /* gone */ } };
      wc.on('will-navigate', (_e, u) => ua(u));
      wc.on('will-redirect', (_e, u) => ua(u));
      wc.on('did-start-loading', () => { this.loading = true; this.push(); });
      wc.on('did-stop-loading', () => { this.loading = false; this.push(); });
      wc.on('render-process-gone', () => { this.loading = false; this.push(); });
    }
    return v;
  }
  _loadSite(p) {
    this.providerId = p.id;
    this.site.webContents.setUserAgent(compat.CHROME_UA);
    this.site.webContents.loadURL(p.url).catch(() => {});
    this.push();
  }

  setProvider(id) {
    const p = providerList(this.settings.ai).find((x) => x.id === id);
    if (!p) throw fail('Unknown assistant.');
    this.win.profile.updateSettings({ ai: { provider: p.id } });
    if (this.open) this._loadSite(p);
    this.win.app.broadcast('settings-changed');
  }
  newChat() { if (this.open) this._loadSite(providerList(this.settings.ai).find((p) => p.id === this.providerId) || currentProvider(this.settings.ai)); }
  reload() { if (this.open && this.site) this.site.webContents.reload(); }

  // ------------------------------------------------------------ geometry
  _dims() {
    const { width: W, height: H } = this.win.win.getContentBounds();
    return { W, H, topH: this.win.metrics().topH };
  }
  place(animate = false) {
    if (!this.open || !this.bar || this.win.destroyed) return;
    const visible = !this.win.htmlFullscreen;
    this.bar.setVisible(visible); this.site.setVisible(visible);
    if (!visible) return;
    const { W, H, topH } = this._dims();
    this.rect = clampRect(this.rect, W, H, topH);
    const apply = (dy) => {
      const r = this.rect;
      this.bar.setBounds({ x: r.x, y: r.y + dy, width: r.w, height: BAR_H + this.extra });
      this.site.setBounds({ x: r.x, y: r.y + dy + BAR_H - 16, width: r.w, height: r.h - BAR_H + 16 });
    };
    clearInterval(this.anim);
    if (animate && this.settings.animations) {            // slide up and settle
      let i = 0; const steps = 10;
      apply(36);
      this.anim = setInterval(() => {
        i += 1;
        const k = 1 - (1 - i / steps) ** 3;
        apply(Math.round(36 * (1 - k)));
        if (i >= steps) clearInterval(this.anim);
      }, 16);
    } else apply(0);
  }
  setExtra(n) { this.extra = Math.max(0, Math.min(300, Math.round(Number(n) || 0))); this.place(); }
  move(dx, dy) {
    if (!this.open) return;
    this.rect = { ...this.rect, x: this.rect.x + Number(dx || 0), y: this.rect.y + Number(dy || 0) };
    this.place();
  }
  resize(size) {
    if (!SIZES[size]) throw fail('Unknown size.');
    this.size = size;
    const r = this.rect; const s = SIZES[size];
    this.rect = { x: r.x + r.w - s.w, y: r.y + r.h - s.h, w: s.w, h: s.h }; // grows from the bottom-right corner
    this.place();
    this.push();
  }

  // ------------------------------------------------------------ sharing what you see
  async _focusPrompt() {
    const wc = this.site.webContents;
    const ok = await wc.executeJavaScript(FOCUS_INPUT).catch(() => false);
    if (!ok) throw fail('Click the message box in the assistant first, then press Share again.');
    wc.focus();
  }

  async share(kind) {
    if (!this.open) throw fail('Open the assistant first.');
    if (!['page', 'selection', 'screenshot'].includes(kind)) throw fail('Unknown share option.');
    const tab = this.win.active();
    if (!tab || !tab.wc || tab.wc.isDestroyed() || !/^https?:/i.test(tab.url)) throw fail('Open a web page first. Browser pages cannot be shared.');
    if (kind === 'screenshot') {
      const img = await tab.wc.capturePage();
      const prev = clipboard.readText();
      clipboard.writeImage(img);
      await this._focusPrompt();
      this.site.webContents.paste();
      setTimeout(() => { if (prev) clipboard.writeText(prev); }, 800); // give the clipboard text back
      return true;
    }
    const data = await tab.wc.executeJavaScript(EXTRACT);
    if (kind === 'selection' && !(data && data.selection)) throw fail('Select some text on the page first.');
    await this._focusPrompt();
    this.site.webContents.insertText(buildPrompt({ kind, title: tab.title, url: tab.url, selection: data.selection, text: data.text }));
    return true;
  }
}

module.exports = { AiPanel };
