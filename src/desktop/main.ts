import { app, BrowserWindow, dialog, ipcMain } from "electron";
import path from "node:path";
import { access } from "node:fs/promises";
import type { Server } from "node:http";
import { createApp } from "../server/app.js";

let server: Server | undefined;
let mainWindow: BrowserWindow | undefined;
const exportGrants = new Set<string>();
let appOrigin = "";
let stopExports: (() => void) | undefined;
app
  .whenReady()
  .then(async () => {
    const resourceRoot = app.isPackaged
      ? process.resourcesPath
      : app.getAppPath();
    process.env.KURO_RESOURCE_DIR = resourceRoot;
    if (app.isPackaged && process.platform === "win32") {
      // Set before the API's lazy renderer import loads the native canvas binding.
      const nativeDir = path.join(resourceRoot, "windows");
      const ffmpeg = path.join(nativeDir, "ffmpeg.exe");
      const ffprobe = path.join(nativeDir, "ffprobe.exe");
      const canvas = path.join(nativeDir, "skia.win32-x64-msvc.node");
      if (process.arch !== "x64")
        throw new Error(
          "This package requires the Windows x64 Electron runtime",
        );
      await Promise.all([ffmpeg, ffprobe, canvas].map((file) => access(file)));
      process.env.FFMPEG_PATH = ffmpeg;
      process.env.FFPROBE_PATH = ffprobe;
      process.env.NAPI_RS_NATIVE_LIBRARY_PATH = canvas;
    }
    const localApp = createApp({
      dataDir: path.join(app.getPath("userData"), "studio"),
      publicDir: path.join(resourceRoot, "public"),
      uiDir: path.join(app.getAppPath(), "dist", "ui"),
      allowExportPath(file) {
        const granted = exportGrants.has(file);
        if (granted) exportGrants.delete(file);
        return granted;
      },
    });
    stopExports = localApp.locals.shutdown;
    server = await new Promise<Server>((resolve, reject) => {
      const running = localApp.listen(0, "127.0.0.1", () => resolve(running));
      running.once("error", reject);
    });
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Local server did not start");
    appOrigin = `http://127.0.0.1:${address.port}`;
    ipcMain.handle(
      "choose-export-path",
      async (event, defaultName: unknown) => {
        if (
          !mainWindow ||
          event.sender !== mainWindow.webContents ||
          !event.senderFrame?.url.startsWith(`${appOrigin}/`)
        )
          throw new Error("Untrusted dialog request");
        const safeName =
          typeof defaultName === "string"
            ? path
                .basename(defaultName)
                .replace(/[<>:"/\\|?*\x00-\x1f]/g, "-")
                .slice(0, 150)
            : "Kuro-export.mp4";
        const result = await dialog.showSaveDialog(mainWindow, {
          title: "Export video",
          defaultPath: path.join(
            app.getPath("videos"),
            safeName.endsWith(".mp4") ? safeName : `${safeName}.mp4`,
          ),
          filters: [{ name: "MP4 Video", extensions: ["mp4"] }],
        });
        if (result.canceled || !result.filePath) return null;
        exportGrants.add(result.filePath);
        return result.filePath;
      },
    );
    function openWindow() {
      mainWindow = new BrowserWindow({
        width: 1520,
        height: 980,
        minWidth: 1100,
        minHeight: 720,
        title: "Kuro Studio",
        backgroundColor: "#171917",
        webPreferences: {
          preload: path.join(__dirname, "preload.cjs"),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      });
      mainWindow.setMenuBarVisibility(false);
      mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      mainWindow.webContents.on("will-navigate", (event, url) => {
        if (new URL(url).origin !== appOrigin) event.preventDefault();
      });
      mainWindow.webContents.on("will-prevent-unload", (event) => {
        if (!mainWindow) return;
        const choice = dialog.showMessageBoxSync(mainWindow, {
          type: "question",
          title: "Unsaved project",
          message: "Discard your unsaved changes?",
          detail: "Choose Keep editing to save your project before closing.",
          buttons: ["Keep editing", "Discard changes"],
          defaultId: 0,
          cancelId: 0,
        });
        if (choice === 1) event.preventDefault();
      });
      mainWindow.on("closed", () => {
        mainWindow = undefined;
      });
      void mainWindow.loadURL(appOrigin);
    }
    openWindow();
    app.on("activate", () => {
      if (!mainWindow) openWindow();
    });
  })
  .catch((error) => {
    dialog.showErrorBox("Kuro Studio could not start", String(error));
    app.quit();
  });
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("before-quit", () => {
  stopExports?.();
  server?.close();
});
