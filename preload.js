const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
    selectDDFPath: (type) => ipcRenderer.invoke('select-ddf-path', type),
    runDDF: (ddfPath) => ipcRenderer.invoke('run-ddf', ddfPath),
});