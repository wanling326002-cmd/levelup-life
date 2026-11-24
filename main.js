const { app, BrowserWindow, shell, Menu } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1440, height: 920, minWidth: 380, minHeight: 600,
    backgroundColor: '#06060b', title: 'LevelUp Life', autoHideMenuBar: true,
    icon: path.join(__dirname, 'web', 'icon.png'),
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.loadFile(path.join(__dirname, 'web', 'index.html'));
  // Open external links (lessons, YouTube, charities) in the user's normal browser.
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file://')) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
}
Menu.setApplicationMenu(null);
app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
