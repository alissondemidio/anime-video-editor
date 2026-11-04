import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("desktop", {
  platform: process.platform,
  chooseExportPath: (defaultName: string): Promise<string | null> =>
    ipcRenderer.invoke("choose-export-path", String(defaultName).slice(0, 240)),
});
