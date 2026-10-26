const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('workbench', {
  call: async (command, input) => {
    const result = await ipcRenderer.invoke('workbench', command, input)
    if (!result.ok) throw new Error(result.error)
    return result.value
  },
  subscribe: callback => {
    const listener = (_event, state) => callback(state)
    ipcRenderer.on('state-changed', listener)
    return () => ipcRenderer.removeListener('state-changed', listener)
  },
})
