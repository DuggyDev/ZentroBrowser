'use strict';
const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const { registerScheme } = require('./src/main/protocol');
const { CHROME_UA } = require('./src/main/compat');

// Look like a normal Chromium browser to websites (no "Electron" token), which many sites require.
app.userAgentFallback = CHROME_UA;

// "Dark mode for websites" is a Chromium start-up switch, so the saved setting is read before the app is ready.
let forceDark = true;
try {
  const raw = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'zentro-profile.json'), 'utf8'));
  if (raw && raw.settings && raw.settings.forceDark === false) forceDark = false;
} catch { /* first start: default is on */ }
if (forceDark) app.commandLine.appendSwitch('enable-features', 'WebContentsForceDark');
global.zentroForceDark = forceDark;
registerScheme();

let zentro = null;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => { if (zentro) zentro.handleSecondInstance(argv); });

  app.whenReady().then(async () => {
    const { ZentroApp } = require('./src/main/app');
    const { registerIpc } = require('./src/main/ipc');
    zentro = new ZentroApp();
    registerIpc(zentro);
    await zentro.start(process.argv);
  });

  app.on('before-quit', () => { if (zentro) zentro.shutdown(); });
  app.on('window-all-closed', () => app.quit());
  // Certificate errors are never bypassed: with no 'certificate-error' handler Chromium refuses the connection.
  app.on('web-contents-created', (_e, contents) => contents.on('will-attach-webview', (e) => e.preventDefault()));
}
