import { contextBridge, ipcRenderer } from "electron";

interface ClipboardImagePayload {
  mimeType: "image/png";
  base64: string;
  width: number;
  height: number;
}

interface ClipboardWritePayload {
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

const desktopApi = {
  readClipboardImage: () =>
    ipcRenderer.invoke("clipboard:readImage") as Promise<ClipboardImagePayload | null>,
  writeClipboardImage: (payload: ClipboardWritePayload) =>
    ipcRenderer.invoke("clipboard:writeImage", payload) as Promise<ClipboardWriteResult>,
  setAlwaysOnTop: (enabled: boolean) =>
    ipcRenderer.invoke("window:setAlwaysOnTop", enabled) as Promise<WindowPinState>,
  getAlwaysOnTop: () =>
    ipcRenderer.invoke("window:getAlwaysOnTop") as Promise<WindowPinState>
};

contextBridge.exposeInMainWorld("desktopApi", desktopApi);
