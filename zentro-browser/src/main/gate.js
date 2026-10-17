'use strict';
/** Small stand-alone windows shown before the browser opens: the sign-in screen and the "update needed" screen. */
const path = require('path');
const { BrowserWindow } = require('electron');

const PRELOAD = path.join(__dirname, '..', '..', 'preload.js');
const ICON = path.join(__dirname, '..', '..', 'pages', 'shared', 'icon.png');

function openGate(z, page) {
  const win = new BrowserWindow({
    width: 460, height: page === 'login' ? 720 : 500, resizable: false, maximizable: false, fullscreenable: false,
    autoHideMenuBar: true, show: false, backgroundColor: '#0a0a0c', title: 'Zentro Browser', icon: ICON,
    webPreferences: { session: z.uiSession, preload: PRELOAD, contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true },
  });
  win.removeMenu();
  z.register(win.webContents, { window: null, role: 'gate' });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.on('will-attach-webview', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => { if (z.gate === win) { z.gate = null; z.quit(); } }); // closing the screen = leaving the app
  win.loadURL(`zentro://${page}/`);
  return win;
}

module.exports = { openGate };
