'use strict';
/**
 * "You need to update" check. At start-up it asks GitHub for the newest release of the Zentro repo.
 * If that release is newer than the running version, the browser does not open; an update screen does.
 * If GitHub cannot be reached, the browser opens normally (people without internet are never locked out).
 */
const { app } = require('electron');
const cfg = require('../core/config');
const { isOutdated, isRepoConfigured, readRelease } = require('../core/version');
const { fetchJson } = require('./http');

class Updater {
  constructor() { this.info = null; }
  async check() {
    const repo = cfg.UPDATE_REPO;
    if (!isRepoConfigured(repo)) return { required: false, configured: false };
    try {
      const r = await fetchJson(`https://api.github.com/repos/${repo}/releases/latest`, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'ZentroBrowser-UpdateCheck' }, timeout: 6000,
      });
      const rel = r.ok ? readRelease(r.json, repo) : null;
      if (!rel) return { required: false, configured: true };
      const current = app.getVersion();
      if (isOutdated(current, rel.version)) { this.info = { current, latest: rel.version, name: rel.name, url: rel.url }; return { required: true, configured: true }; }
    } catch { /* offline or rate limited: let the person in */ }
    return { required: false, configured: true };
  }
}

module.exports = { Updater };
