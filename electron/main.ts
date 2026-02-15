import { app, BrowserWindow, clipboard, ipcMain, nativeImage } from "electron";
import path from "node:path";
import { PreferencesStore } from "./preferences-store";

interface ClipboardImagePayload {
  mimeType: "image/png";
  base64: string;
  width: number;
  height: number;
}

interface ClipboardWriteImagePayload {
  mimeType: "image/png";
  base64: string;
}

interface ClipboardWriteResult {
  ok: boolean;
  reason?: "invalid_payload" | "decode_failed" | "write_failed";
}

interface WindowPinState {
  enabled: boolean;
}

const isDevelopment = process.env.NODE_ENV === "development";
const devServerUrl = process.env.VITE_DEV_SERVER_URL;
const IPC_CHANNELS = {
  readClipboardImage: "clipboard:readImage",
  writeClipboardImage: "clipboard:writeImage",
  getAlwaysOnTop: "window:getAlwaysOnTop",
  setAlwaysOnTop: "window:setAlwaysOnTop"
} as const;

let mainWindow: BrowserWindow | null = null;
let preferencesStore: PreferencesStore | null = null;

const getPreferencesStore = (): PreferencesStore => {
  if (!preferencesStore) {
    preferencesStore = new PreferencesStore();
  }
  return preferencesStore;
};

const createMainWindow = (): BrowserWindow => {
  const preferences = getPreferencesStore().read();

  const window = new BrowserWindow({
    width: 960,
    height: 620,
    minWidth: 560,
    minHeight: 420,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#e8edf0",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (preferences.alwaysOnTop) {
    window.setAlwaysOnTop(true, "screen-saver");
  }

  window.once("ready-to-show", () => {
    window.show();
  });

  if (isDevelopment && devServerUrl) {
    void window.loadURL(devServerUrl);
  } else {
    void window.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  return window;
};

const readClipboardImage = (): ClipboardImagePayload | null => {
  const image = clipboard.readImage();
  if (image.isEmpty()) {
    return null;
  }

  const pngBuffer = image.toPNG();
  const size = image.getSize();
  return {
    mimeType: "image/png",
    base64: pngBuffer.toString("base64"),
    width: size.width,
    height: size.height
  };
};

const writeClipboardImage = (payload: ClipboardWriteImagePayload): ClipboardWriteResult => {
  if (
    !payload ||
    payload.mimeType !== "image/png" ||
    typeof payload.base64 !== "string" ||
    payload.base64.length === 0
  ) {
    return { ok: false, reason: "invalid_payload" };
  }

  const normalizedBase64 = payload.base64.trim();
  if (normalizedBase64.length === 0) {
    return { ok: false, reason: "invalid_payload" };
  }

  let image = nativeImage.createEmpty();
  try {
    const buffer = Buffer.from(normalizedBase64, "base64");
    if (buffer.length > 0) {
      image = nativeImage.createFromBuffer(buffer);
    }
  } catch {
    image = nativeImage.createEmpty();
  }

  if (image.isEmpty()) {
    try {
      image = nativeImage.createFromDataURL(
        `data:${payload.mimeType};base64,${normalizedBase64}`
      );
    } catch {
      image = nativeImage.createEmpty();
    }
  }

  if (image.isEmpty()) {
    return { ok: false, reason: "decode_failed" };
  }

  try {
    clipboard.writeImage(image);
    if (clipboard.readImage().isEmpty()) {
      return { ok: false, reason: "write_failed" };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: "write_failed" };
  }
};

const registerIpcHandlers = (): void => {
  ipcMain.handle(IPC_CHANNELS.readClipboardImage, () => readClipboardImage());
  ipcMain.handle(IPC_CHANNELS.writeClipboardImage, (_event, payload: ClipboardWriteImagePayload) =>
    writeClipboardImage(payload)
  );

  ipcMain.handle(IPC_CHANNELS.getAlwaysOnTop, (): WindowPinState => {
    if (mainWindow) {
      return { enabled: mainWindow.isAlwaysOnTop() };
    }
    return { enabled: getPreferencesStore().read().alwaysOnTop };
  });

  ipcMain.handle(
    IPC_CHANNELS.setAlwaysOnTop,
    (_event, enabled: boolean): WindowPinState => {
      const normalized = Boolean(enabled);
      if (mainWindow) {
        mainWindow.setAlwaysOnTop(normalized, "screen-saver");
      }
      getPreferencesStore().setAlwaysOnTop(normalized);
      return { enabled: normalized };
    }
  );
};

const removeIpcHandlers = (): void => {
  ipcMain.removeHandler(IPC_CHANNELS.readClipboardImage);
  ipcMain.removeHandler(IPC_CHANNELS.writeClipboardImage);
  ipcMain.removeHandler(IPC_CHANNELS.getAlwaysOnTop);
  ipcMain.removeHandler(IPC_CHANNELS.setAlwaysOnTop);
};

app.whenReady().then(() => {
  registerIpcHandlers();
  mainWindow = createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("will-quit", () => {
  removeIpcHandlers();
});
