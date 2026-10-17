'use strict';
/** The floating AI assistant: providers, window geometry and the text that is shared with the AI. Pure, no Electron. */

const PROVIDERS = Object.freeze({
  chatgpt: { name: 'ChatGPT', url: 'https://chatgpt.com/' },
  claude: { name: 'Claude', url: 'https://claude.ai/new' },
  gemini: { name: 'Gemini', url: 'https://gemini.google.com/app' },
  grok: { name: 'Grok', url: 'https://grok.com/' },
});

/** Providers the person can pick: the four built-in ones, plus their own https link when they set one. */
function providerList(ai) {
  const list = Object.entries(PROVIDERS).map(([id, p]) => ({ id, name: p.name, url: p.url }));
  if (ai && ai.customUrl && /^https:\/\//.test(ai.customUrl)) list.push({ id: 'custom', name: ai.customName || 'Custom AI', url: ai.customUrl });
  return list;
}
function currentProvider(ai) {
  const list = providerList(ai);
  return list.find((p) => p.id === (ai && ai.provider)) || list[0];
}

const SIZES = Object.freeze({ s: { w: 360, h: 520 }, m: { w: 430, h: 660 }, l: { w: 580, h: 780 } });
const BAR_H = 46;
const MARGIN = 16;

/** Keeps the floating panel fully inside the window, whatever size the window has. */
function clampRect(r, W, H, topH = 0) {
  const w = Math.max(300, Math.min(Math.round(r.w), W - 2 * MARGIN));
  const h = Math.max(BAR_H + 160, Math.min(Math.round(r.h), H - topH - 2 * MARGIN));
  const x = Math.max(MARGIN / 2, Math.min(Math.round(r.x), W - w - MARGIN / 2));
  const y = Math.max(topH + MARGIN / 2, Math.min(Math.round(r.y), H - h - MARGIN / 2));
  return { x, y, w, h };
}
const defaultRect = (size, W, H, topH) => clampRect({ ...SIZES[size] || SIZES.m, x: W, y: H }, W, H, topH);

/** The message that is put into the AI's message box. The person still has to press Send. */
function buildPrompt({ kind, title, url, selection, text }) {
  const head = `Page: ${String(title || '').slice(0, 200)}\nAddress: ${String(url || '').slice(0, 500)}`;
  if (kind === 'selection') return `${head}\n\nSelected text:\n"""\n${String(selection || '').slice(0, 20000)}\n"""\n\n`;
  return `${head}\n\nPage text:\n"""\n${String(text || '').slice(0, 20000)}\n"""\n\n`;
}

module.exports = { PROVIDERS, providerList, currentProvider, SIZES, BAR_H, MARGIN, clampRect, defaultRect, buildPrompt };
