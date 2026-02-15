export interface ClipboardImagePayload {
  mimeType: "image/png";
  base64: string;
  width: number;
  height: number;
}

export interface ClipboardWritePayload {
  mimeType: "image/png";
  base64: string;
}

export type ClipboardWriteFailureReason =
  | "invalid_payload"
  | "decode_failed"
  | "write_failed";

export interface ClipboardWriteResult {
  ok: boolean;
  reason?: ClipboardWriteFailureReason;
}

export interface WindowPinState {
  enabled: boolean;
}

export interface CanvasImageItem {
  id: string;
  source: "paste" | "drop";
  dataUrl: string;
  naturalWidth: number;
  naturalHeight: number;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  createdAt: number;
}

export interface ClipboardCanvasState {
  items: CanvasImageItem[];
  selectedId: string | null;
  nextZIndex: number;
  placementOffsetIndex: number;
}

export interface ClipboardCanvasSnapshot {
  items: CanvasImageItem[];
  selectedId: string | null;
  nextZIndex: number;
  placementOffsetIndex: number;
}

export interface TaskItem {
  id: string;
  text: string;
  createdAt: number;
}

export interface UiPreferences {
  alwaysOnTop: boolean;
}
