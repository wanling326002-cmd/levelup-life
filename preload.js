// The only bridge between the app's pages and the desktop. Pages get a small, fixed set of functions, never Node.js.
const {contextBridge, ipcRenderer} = require('electron');

const call = (name, ...args) => ipcRenderer.invoke('cmp:' + name, ...args);

contextBridge.exposeInMainWorld('levelupDesktop', {
  isDesktop: true,
  setLang: code => call('setLang', String(code)),
  snapshot: () => call('snapshot'),
  setPaused: paused => call('setPaused', !!paused),
  editGame: (id, patch) => call('editGame', String(id), patch),
  removeGame: id => call('removeGame', String(id)),
  addGameFromFile: () => call('addGameFromFile'),
  listRunning: () => call('listRunning'),
  addGameFromProcess: (proc, name) => call('addGameFromProcess', proc, String(name || '')),
  addExeToGame: id => call('addExeToGame', String(id)),
  rescan: () => call('rescan'),
  setSettings: s => call('setSettings', s),
  setStartup: on => call('setStartup', !!on),
  connect: () => call('connect'),
  disconnect: () => call('disconnect'),
  deleteHistory: online => call('deleteHistory', !!online),
  openWebsite: hash => call('openWebsite', String(hash || '')),
  onUpdate: cb => { const h = (_e, data) => cb(data); ipcRenderer.on('cmp:update', h); return () => ipcRenderer.removeListener('cmp:update', h); },
});
