import type {
  ClipboardImagePayload,
  ClipboardWritePayload,
  ClipboardWriteResult,
  WindowPinState
} from "./models";

interface DesktopApi {
  readClipboardImage: () => Promise<ClipboardImagePayload | null>;
  writeClipboardImage: (payload: ClipboardWritePayload) => Promise<ClipboardWriteResult>;
  setAlwaysOnTop: (enabled: boolean) => Promise<WindowPinState>;
  getAlwaysOnTop: () => Promise<WindowPinState>;
}

declare global {
  interface Window {
    desktopApi: DesktopApi;
  }
}

export {};
