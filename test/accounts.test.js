'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { compareVersions, isOutdated, isRepoConfigured, readRelease } = require('../src/core/version');
const { makePkce, googleAuthUrl, readCallback } = require('../src/core/oauth');
const { sanitizeServers, proxyRule, publicServer } = require('../src/core/vpn');
const { evaluateSessions } = require('../server/premium-logic');
const cfg = require('../src/core/config');

test('versions: only a certainly newer release blocks the app', () => {
  assert.equal(isOutdated('1.1.0', 'v1.2.0'), true);
  assert.equal(isOutdated('1.2.0', 'v1.2.0'), false);
  assert.equal(isOutdated('1.10.0', '1.9.9'), false);
  assert.equal(isOutdated('2.0.0', '1.9.9'), false);
  assert.equal(compareVersions('1.2.3-beta.1', '1.2.3'), 0);
  assert.equal(isOutdated('1.0.0', 'banana'), false);
  assert.equal(isOutdated('1.0.0', ''), false);
});

test('update repo placeholder counts as not configured', () => {
  assert.equal(isRepoConfigured('YOUR-NAME/ZentroBrowser'), false);
  assert.equal(isRepoConfigured('jan/ZentroBrowser'), true);
  assert.equal(isRepoConfigured('../evil'), false);
});

test('release info only links to the configured GitHub repo', () => {
  const ok = readRelease({ tag_name: 'v1.3.0', html_url: 'https://github.com/a/b/releases/tag/v1.3.0', assets: [{ name: 'Zentro-Setup.exe', browser_download_url: 'https://github.com/a/b/releases/download/v1.3.0/Zentro-Setup.exe' }] }, 'a/b');
  assert.equal(ok.version, '1.3.0');
  assert.match(ok.url, /Zentro-Setup\.exe$/);
  const evil = readRelease({ tag_name: 'v9.0.0', html_url: 'https://evil.example/x', assets: [{ name: 'a.exe', browser_download_url: 'https://evil.example/a.exe' }] }, 'a/b');
  assert.equal(evil.url, 'https://github.com/a/b/releases/latest');
  assert.equal(readRelease({ tag_name: 'nightly' }, 'a/b'), null);
});

test('Google OAuth: PKCE, URL and callback checks', () => {
  const p = makePkce();
  assert.ok(p.verifier.length >= 43 && p.challenge !== p.verifier);
  const u = new URL(googleAuthUrl({ clientId: 'cid', redirectUri: 'http://127.0.0.1:5000', challenge: p.challenge, state: p.state }));
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(u.searchParams.get('redirect_uri'), 'http://127.0.0.1:5000');
  assert.equal(readCallback(`/?code=abc&state=${p.state}`, p.state).code, 'abc');
  assert.ok(readCallback('/?code=abc&state=wrong', p.state).error);
  assert.ok(readCallback(`/?error=access_denied&state=${p.state}`, p.state).error);
  assert.ok(readCallback('/favicon.ico', p.state).ignore);
});

test('VPN server list is validated and credentials never reach the interface', () => {
  const list = sanitizeServers([
    { id: 'nl1', name: 'Amsterdam', country: 'NL', scheme: 'https', host: 'NL1.example.com', port: 443, username: 'u', password: 'p' },
    { id: 'bad host', scheme: 'https', host: 'x.com', port: 1 },
    { id: 'x2', scheme: 'ftp', host: 'x.com', port: 1 },
    { id: 'x3', scheme: 'socks5', host: 'a b', port: 1 },
    { id: 'x4', scheme: 'socks5', host: 'ok.com', port: 70000 },
    { id: 'nl1', scheme: 'https', host: 'dup.com', port: 443 },
  ]);
  assert.equal(list.length, 1);
  assert.equal(proxyRule(list[0]), 'https://nl1.example.com:443');
  assert.deepEqual(Object.keys(publicServer(list[0])).sort(), ['country', 'id', 'name']);
  assert.deepEqual(sanitizeServers('nope'), []);
});

test('Premium: decided from Stripe sessions', () => {
  const who = { uid: 'U1', email: 'Me@Example.com' };
  const paid = { status: 'complete', mode: 'payment', payment_status: 'paid', customer_details: { email: 'me@example.com' } };
  assert.equal(evaluateSessions([paid], who).premium, true);
  assert.equal(evaluateSessions([{ ...paid, payment_status: 'unpaid' }], who).premium, false);
  assert.equal(evaluateSessions([{ ...paid, status: 'open' }], who).premium, false);
  assert.equal(evaluateSessions([{ ...paid, customer_details: { email: 'other@x.com' } }], who).premium, false);
  assert.equal(evaluateSessions([{ ...paid, customer_details: { email: 'other@x.com' }, client_reference_id: 'U1' }], who).premium, true);
  const sub = { status: 'complete', mode: 'subscription', payment_status: 'paid', client_reference_id: 'U1', subscription: { status: 'canceled' } };
  assert.equal(evaluateSessions([sub], who).premium, false);
  assert.equal(evaluateSessions([{ ...sub, subscription: { status: 'active', current_period_end: 2e9 } }], who).premium, true);
  assert.equal(evaluateSessions(null, who).premium, false);
});

test('config: Stripe link is a buy.stripe.com link and no secret is shipped in the app', () => {
  assert.equal(new URL(cfg.STRIPE_PAYMENT_LINK).hostname, 'buy.stripe.com');
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'config.js'), 'utf8');
  assert.doesNotMatch(src, /sk_(test|live)_|whsec_/);
});

test('the sign-in and update screens can only use "gate" IPC methods', () => {
  const ipc = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'ipc.js'), 'utf8');
  assert.match(ipc, /info\.role === 'gate' && h\.scope !== 'gate'/);
  for (const page of ['login/login.js', 'update/update.js']) {
    const src = fs.readFileSync(path.join(__dirname, '..', 'pages', page), 'utf8');
    for (const m of src.matchAll(/call\(\s*'([a-z]+[:a-z-]*)'/g)) assert.match(ipc, new RegExp(`def\\('${m[1]}', 'gate'`), `${page} uses ${m[1]} which is not a gate method`);
  }
});

test('the update gate runs before any browser window opens', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'app.js'), 'utf8');
  const start = app.slice(app.indexOf('async start('));
  assert.ok(start.indexOf('updater.check()') < start.indexOf('openStartupWindows(argv)'));
  assert.ok(start.indexOf("openGate(this, 'update')") < start.indexOf('openStartupWindows(argv)'));
});
