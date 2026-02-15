<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import type {
  CanvasImageItem,
  ClipboardCanvasSnapshot,
  ClipboardCanvasState,
  ClipboardImagePayload,
  ClipboardWriteFailureReason
} from "../types/models";

const props = defineProps<{
  active: boolean;
}>();

const CANVAS_WIDTH = 2000;
const CANVAS_HEIGHT = 2000;
const MAX_IMAGES = 50;
const MIN_SIZE = 24;
const INITIAL_MAX_SIDE = 420;
const INITIAL_MIN_SIDE = 80;
const UNDO_LIMIT = 50;
const PLACEMENT_OFFSET_STEP = 24;

type ResizeHandle = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";

interface MoveInteraction {
  mode: "move";
  itemId: string;
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
  startSnapshot: ClipboardCanvasSnapshot;
}

interface ResizeInteraction {
  mode: "resize";
  itemId: string;
  handle: ResizeHandle;
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
  startWidth: number;
  startHeight: number;
  startSnapshot: ClipboardCanvasSnapshot;
}

type Interaction = MoveInteraction | ResizeInteraction;

const HANDLE_DIRECTIONS: ResizeHandle[] = ["n", "ne", "e", "se", "s", "sw", "w", "nw"];

const state = ref<ClipboardCanvasState>({
  items: [],
  selectedId: null,
  nextZIndex: 1,
  placementOffsetIndex: 0
});
const undoStack = ref<ClipboardCanvasSnapshot[]>([]);
const noticeMessage = ref("Ctrl+V / D&D で画像を追加。ドラッグ移動、ハンドルで拡縮できます。");
const isDragActive = ref(false);
const interaction = ref<Interaction | null>(null);
const canvasViewportRef = ref<HTMLDivElement | null>(null);

const selectedItem = computed(() =>
  state.value.items.find((item) => item.id === state.value.selectedId) ?? null
);
const canUndo = computed(() => undoStack.value.length > 0);

const deepCloneItems = (items: CanvasImageItem[]): CanvasImageItem[] =>
  items.map((item) => ({ ...item }));

const createSnapshot = (): ClipboardCanvasSnapshot => ({
  items: deepCloneItems(state.value.items),
  selectedId: state.value.selectedId,
  nextZIndex: state.value.nextZIndex,
  placementOffsetIndex: state.value.placementOffsetIndex
});

const applySnapshot = (snapshot: ClipboardCanvasSnapshot): void => {
  state.value = {
    items: deepCloneItems(snapshot.items),
    selectedId: snapshot.selectedId,
    nextZIndex: snapshot.nextZIndex,
    placementOffsetIndex: snapshot.placementOffsetIndex
  };
};

const toUndoComparable = (snapshot: ClipboardCanvasSnapshot): string =>
  JSON.stringify({
    items: snapshot.items,
    nextZIndex: snapshot.nextZIndex,
    placementOffsetIndex: snapshot.placementOffsetIndex
  });

const isUndoTargetChanged = (
  before: ClipboardCanvasSnapshot,
  after: ClipboardCanvasSnapshot
): boolean => toUndoComparable(before) !== toUndoComparable(after);

const pushUndo = (snapshot: ClipboardCanvasSnapshot): void => {
  const nextSnapshot: ClipboardCanvasSnapshot = {
    items: deepCloneItems(snapshot.items),
    selectedId: snapshot.selectedId,
    nextZIndex: snapshot.nextZIndex,
    placementOffsetIndex: snapshot.placementOffsetIndex
  };

  undoStack.value = [...undoStack.value, nextSnapshot];
  if (undoStack.value.length > UNDO_LIMIT) {
    undoStack.value = undoStack.value.slice(undoStack.value.length - UNDO_LIMIT);
  }
};

const undo = (): void => {
  if (!canUndo.value || interaction.value) {
    return;
  }

  const snapshot = undoStack.value[undoStack.value.length - 1];
  if (!snapshot) {
    return;
  }

  undoStack.value = undoStack.value.slice(0, -1);
  applySnapshot(snapshot);
  noticeMessage.value = "元に戻しました。";
};

const clamp = (value: number, min: number, max: number): number => {
  if (max < min) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
};

const isTextInputFocused = (): boolean => {
  const activeElement = document.activeElement as HTMLElement | null;
  if (!activeElement) {
    return false;
  }

  const tag = activeElement.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || activeElement.isContentEditable;
};

const getItemById = (itemId: string): CanvasImageItem | undefined =>
  state.value.items.find((item) => item.id === itemId);

const updateItem = (
  itemId: string,
  updater: (item: CanvasImageItem) => CanvasImageItem
): void => {
  state.value.items = state.value.items.map((item) =>
    item.id === itemId ? updater(item) : item
  );
};

const bringToFront = (itemId: string): boolean => {
  const current = getItemById(itemId);
  if (!current) {
    return false;
  }

  const currentMaxZ = state.value.items.reduce((maxZ, item) => Math.max(maxZ, item.zIndex), 0);
  if (current.zIndex >= currentMaxZ) {
    return false;
  }

  const nextZIndex = state.value.nextZIndex;
  state.value.nextZIndex += 1;
  updateItem(itemId, (item) => ({ ...item, zIndex: nextZIndex }));
  return true;
};

const selectItem = (itemId: string): void => {
  state.value.selectedId = itemId;
  bringToFront(itemId);
};

const enforceImageLimit = (): void => {
  if (state.value.items.length <= MAX_IMAGES) {
    return;
  }

  const overflow = state.value.items.length - MAX_IMAGES;
  const removeIds = new Set(
    [...state.value.items]
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(0, overflow)
      .map((item) => item.id)
  );

  state.value.items = state.value.items.filter((item) => !removeIds.has(item.id));
  if (state.value.selectedId && removeIds.has(state.value.selectedId)) {
    state.value.selectedId = null;
  }
};

const normalizeInitialSize = (
  naturalWidth: number,
  naturalHeight: number
): { width: number; height: number } => {
  const width = Math.max(1, naturalWidth);
  const height = Math.max(1, naturalHeight);
  const longest = Math.max(width, height);

  let scale = 1;
  if (longest > INITIAL_MAX_SIDE) {
    scale = INITIAL_MAX_SIDE / longest;
  } else if (longest < INITIAL_MIN_SIDE) {
    scale = INITIAL_MIN_SIDE / longest;
  }

  return {
    width: Math.max(MIN_SIZE, Math.round(width * scale)),
    height: Math.max(MIN_SIZE, Math.round(height * scale))
  };
};

const getViewportCenter = (): { x: number; y: number } => {
  const viewport = canvasViewportRef.value;
  if (!viewport) {
    return { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 };
  }

  return {
    x: viewport.scrollLeft + viewport.clientWidth / 2,
    y: viewport.scrollTop + viewport.clientHeight / 2
  };
};

const isOutOfBounds = (x: number, y: number, width: number, height: number): boolean =>
  x < 0 || y < 0 || x + width > CANVAS_WIDTH || y + height > CANVAS_HEIGHT;

const resolveInitialPlacement = (width: number, height: number): { x: number; y: number } => {
  const center = getViewportCenter();

  const calc = (offsetIndex: number): { x: number; y: number } => ({
    x: Math.round(center.x - width / 2 + offsetIndex * PLACEMENT_OFFSET_STEP),
    y: Math.round(center.y - height / 2 + offsetIndex * PLACEMENT_OFFSET_STEP)
  });

  let offsetIndex = state.value.placementOffsetIndex;
  let point = calc(offsetIndex);

  if (isOutOfBounds(point.x, point.y, width, height)) {
    offsetIndex = 0;
    point = calc(0);
  }

  state.value.placementOffsetIndex = offsetIndex + 1;

  return {
    x: clamp(point.x, 0, CANVAS_WIDTH - width),
    y: clamp(point.y, 0, CANVAS_HEIGHT - height)
  };
};

const createCanvasItem = (
  dataUrl: string,
  naturalWidth: number,
  naturalHeight: number,
  source: CanvasImageItem["source"]
): CanvasImageItem => {
  const size = normalizeInitialSize(naturalWidth, naturalHeight);
  const placement = resolveInitialPlacement(size.width, size.height);

  const nextZIndex = state.value.nextZIndex;
  state.value.nextZIndex += 1;

  return {
    id: crypto.randomUUID(),
    source,
    dataUrl,
    naturalWidth,
    naturalHeight,
    x: placement.x,
    y: placement.y,
    width: size.width,
    height: size.height,
    zIndex: nextZIndex,
    createdAt: Date.now()
  };
};

const addCanvasItem = (
  dataUrl: string,
  naturalWidth: number,
  naturalHeight: number,
  source: CanvasImageItem["source"]
): void => {
  const newItem = createCanvasItem(dataUrl, naturalWidth, naturalHeight, source);
  state.value.items = [...state.value.items, newItem];
  state.value.selectedId = newItem.id;
  enforceImageLimit();
};

const removeItem = (itemId: string): boolean => {
  const beforeLength = state.value.items.length;
  state.value.items = state.value.items.filter((item) => item.id !== itemId);
  if (state.value.items.length !== beforeLength && state.value.selectedId === itemId) {
    state.value.selectedId = null;
  }
  return state.value.items.length !== beforeLength;
};

const removeSelectedItem = (trackUndo = true): void => {
  if (!state.value.selectedId) {
    return;
  }

  const beforeSnapshot = createSnapshot();
  const removed = removeItem(state.value.selectedId);
  if (!removed) {
    return;
  }

  if (trackUndo) {
    pushUndo(beforeSnapshot);
  }

  noticeMessage.value = "選択画像を削除しました。";
};

const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("ファイル読み込みに失敗しました。"));
    reader.readAsDataURL(file);
  });

const convertToPngDataUrl = (
  sourceDataUrl: string
): Promise<{ dataUrl: string; width: number; height: number }> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const width = Math.max(1, image.naturalWidth || image.width);
      const height = Math.max(1, image.naturalHeight || image.height);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("canvas context を作成できません。"));
        return;
      }

      context.drawImage(image, 0, 0, width, height);
      resolve({
        dataUrl: canvas.toDataURL("image/png"),
        width,
        height
      });
    };
    image.onerror = () => reject(new Error("画像変換に失敗しました。"));
    image.src = sourceDataUrl;
  });

const addDroppedFiles = async (fileList: FileList): Promise<void> => {
  const imageFiles = Array.from(fileList).filter((file) => file.type.startsWith("image/"));
  if (imageFiles.length === 0) {
    noticeMessage.value = "画像ファイルをドロップしてください。";
    return;
  }

  const beforeSnapshot = createSnapshot();
  let successCount = 0;
  let failureCount = 0;

  for (const file of imageFiles) {
    try {
      const rawDataUrl = await readFileAsDataUrl(file);
      const pngImage = await convertToPngDataUrl(rawDataUrl);
      addCanvasItem(pngImage.dataUrl, pngImage.width, pngImage.height, "drop");
      successCount += 1;
    } catch {
      failureCount += 1;
    }
  }

  if (successCount === 0) {
    noticeMessage.value = "画像を追加できませんでした。";
    return;
  }

  pushUndo(beforeSnapshot);

  if (failureCount > 0) {
    noticeMessage.value = `${successCount}件追加し、${failureCount}件は失敗しました。`;
    return;
  }

  noticeMessage.value = `${successCount}件の画像を追加しました。`;
};

const addImageFromClipboard = (payload: ClipboardImagePayload): void => {
  addCanvasItem(
    `data:${payload.mimeType};base64,${payload.base64}`,
    payload.width,
    payload.height,
    "paste"
  );
};

const extractBase64 = (dataUrl: string): string | null => {
  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex === -1) {
    return null;
  }
  return dataUrl.slice(commaIndex + 1);
};

const getCopyFailureMessage = (reason?: ClipboardWriteFailureReason): string => {
  switch (reason) {
    case "invalid_payload":
      return "コピー用データが不正です。";
    case "decode_failed":
      return "画像データの変換に失敗しました。";
    case "write_failed":
      return "OSクリップボードへの書き込みに失敗しました。";
    default:
      return "コピーに失敗しました。";
  }
};

const copySelectedImage = async (): Promise<void> => {
  if (!props.active || !selectedItem.value) {
    return;
  }

  const base64 = extractBase64(selectedItem.value.dataUrl);
  if (!base64) {
    noticeMessage.value = "コピー用データを作成できませんでした。";
    return;
  }

  try {
    const result = await window.desktopApi.writeClipboardImage({
      mimeType: "image/png",
      base64
    });
    if (result.ok) {
      noticeMessage.value = "選択画像をクリップボードへコピーしました。";
      return;
    }

    noticeMessage.value = getCopyFailureMessage(result.reason);
  } catch {
    noticeMessage.value = "コピーに失敗しました。";
  }
};

const isCornerHandle = (handle: ResizeHandle): boolean => handle.length === 2;

const stopInteraction = (commitHistory: boolean): void => {
  const current = interaction.value;
  interaction.value = null;
  window.removeEventListener("mousemove", handlePointerMove);
  window.removeEventListener("mouseup", handlePointerUp);

  if (!commitHistory || !current) {
    return;
  }

  const currentSnapshot = createSnapshot();
  if (isUndoTargetChanged(current.startSnapshot, currentSnapshot)) {
    pushUndo(current.startSnapshot);
  }
};

const handlePointerUp = (): void => {
  stopInteraction(true);
};

const computeEdgeResize = (
  current: ResizeInteraction,
  deltaX: number,
  deltaY: number
): { x: number; y: number; width: number; height: number } => {
  const { handle, startX, startY, startWidth, startHeight } = current;

  let nextX = startX;
  let nextY = startY;
  let nextWidth = startWidth;
  let nextHeight = startHeight;

  if (handle.includes("e")) {
    nextWidth = startWidth + deltaX;
  }
  if (handle.includes("s")) {
    nextHeight = startHeight + deltaY;
  }
  if (handle.includes("w")) {
    nextWidth = startWidth - deltaX;
    nextX = startX + deltaX;
  }
  if (handle.includes("n")) {
    nextHeight = startHeight - deltaY;
    nextY = startY + deltaY;
  }

  if (nextWidth < MIN_SIZE) {
    if (handle.includes("w")) {
      nextX = startX + (startWidth - MIN_SIZE);
    }
    nextWidth = MIN_SIZE;
  }

  if (nextHeight < MIN_SIZE) {
    if (handle.includes("n")) {
      nextY = startY + (startHeight - MIN_SIZE);
    }
    nextHeight = MIN_SIZE;
  }

  if (nextX < 0) {
    if (handle.includes("w")) {
      nextWidth += nextX;
    }
    nextX = 0;
  }

  if (nextY < 0) {
    if (handle.includes("n")) {
      nextHeight += nextY;
    }
    nextY = 0;
  }

  if (nextX + nextWidth > CANVAS_WIDTH) {
    if (handle.includes("e")) {
      nextWidth = CANVAS_WIDTH - nextX;
    } else {
      nextX = CANVAS_WIDTH - nextWidth;
    }
  }

  if (nextY + nextHeight > CANVAS_HEIGHT) {
    if (handle.includes("s")) {
      nextHeight = CANVAS_HEIGHT - nextY;
    } else {
      nextY = CANVAS_HEIGHT - nextHeight;
    }
  }

  nextWidth = Math.max(MIN_SIZE, nextWidth);
  nextHeight = Math.max(MIN_SIZE, nextHeight);
  nextX = clamp(nextX, 0, CANVAS_WIDTH - nextWidth);
  nextY = clamp(nextY, 0, CANVAS_HEIGHT - nextHeight);

  return {
    x: Math.round(nextX),
    y: Math.round(nextY),
    width: Math.round(nextWidth),
    height: Math.round(nextHeight)
  };
};

const computeCornerResize = (
  current: ResizeInteraction,
  deltaX: number,
  deltaY: number
): { x: number; y: number; width: number; height: number } => {
  const { handle, startX, startY, startWidth, startHeight } = current;

  const anchorX = handle.includes("w") ? startX + startWidth : startX;
  const anchorY = handle.includes("n") ? startY + startHeight : startY;

  const pointerX = handle.includes("w")
    ? startX + deltaX
    : startX + startWidth + deltaX;
  const pointerY = handle.includes("n")
    ? startY + deltaY
    : startY + startHeight + deltaY;

  const rawWidth = handle.includes("w") ? anchorX - pointerX : pointerX - anchorX;
  const rawHeight = handle.includes("n") ? anchorY - pointerY : pointerY - anchorY;

  const minScale = Math.max(MIN_SIZE / startWidth, MIN_SIZE / startHeight);
  let scale = Math.max(rawWidth / startWidth, rawHeight / startHeight, minScale);

  const maxWidth = handle.includes("w") ? anchorX : CANVAS_WIDTH - anchorX;
  const maxHeight = handle.includes("n") ? anchorY : CANVAS_HEIGHT - anchorY;
  const maxScale = Math.max(
    minScale,
    Math.min(maxWidth / startWidth, maxHeight / startHeight)
  );

  if (!Number.isFinite(scale)) {
    scale = minScale;
  }

  scale = clamp(scale, minScale, maxScale);

  const width = Math.max(MIN_SIZE, Math.round(startWidth * scale));
  const height = Math.max(MIN_SIZE, Math.round(startHeight * scale));

  let x = handle.includes("w") ? anchorX - width : anchorX;
  let y = handle.includes("n") ? anchorY - height : anchorY;

  x = clamp(x, 0, CANVAS_WIDTH - width);
  y = clamp(y, 0, CANVAS_HEIGHT - height);

  return {
    x: Math.round(x),
    y: Math.round(y),
    width,
    height
  };
};

const handlePointerMove = (event: MouseEvent): void => {
  const currentInteraction = interaction.value;
  if (!currentInteraction) {
    return;
  }

  const item = getItemById(currentInteraction.itemId);
  if (!item) {
    stopInteraction(false);
    return;
  }

  const deltaX = event.clientX - currentInteraction.startClientX;
  const deltaY = event.clientY - currentInteraction.startClientY;

  if (currentInteraction.mode === "move") {
    const nextX = clamp(currentInteraction.startX + deltaX, 0, CANVAS_WIDTH - item.width);
    const nextY = clamp(currentInteraction.startY + deltaY, 0, CANVAS_HEIGHT - item.height);

    updateItem(currentInteraction.itemId, (target) => ({
      ...target,
      x: Math.round(nextX),
      y: Math.round(nextY)
    }));
    return;
  }

  const geometry = isCornerHandle(currentInteraction.handle)
    ? computeCornerResize(currentInteraction, deltaX, deltaY)
    : computeEdgeResize(currentInteraction, deltaX, deltaY);

  updateItem(currentInteraction.itemId, (target) => ({
    ...target,
    ...geometry
  }));
};

const startMove = (event: MouseEvent, itemId: string): void => {
  if (!props.active || event.button !== 0) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  const item = getItemById(itemId);
  if (!item) {
    return;
  }

  const startSnapshot = createSnapshot();
  selectItem(itemId);

  interaction.value = {
    mode: "move",
    itemId,
    startClientX: event.clientX,
    startClientY: event.clientY,
    startX: item.x,
    startY: item.y,
    startSnapshot
  };

  window.addEventListener("mousemove", handlePointerMove);
  window.addEventListener("mouseup", handlePointerUp);
};

const startResize = (event: MouseEvent, itemId: string, handle: ResizeHandle): void => {
  if (!props.active || event.button !== 0) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  const item = getItemById(itemId);
  if (!item) {
    return;
  }

  const startSnapshot = createSnapshot();
  selectItem(itemId);

  interaction.value = {
    mode: "resize",
    itemId,
    handle,
    startClientX: event.clientX,
    startClientY: event.clientY,
    startX: item.x,
    startY: item.y,
    startWidth: item.width,
    startHeight: item.height,
    startSnapshot
  };

  window.addEventListener("mousemove", handlePointerMove);
  window.addEventListener("mouseup", handlePointerUp);
};

const clearSelection = (event: MouseEvent): void => {
  if (!props.active || event.button !== 0) {
    return;
  }

  state.value.selectedId = null;
};

const handlePaste = async (event: ClipboardEvent): Promise<void> => {
  if (!props.active) {
    return;
  }

  event.preventDefault();

  try {
    const payload = await window.desktopApi.readClipboardImage();
    if (!payload) {
      noticeMessage.value = "クリップボードに画像が見つかりません。";
      return;
    }

    const beforeSnapshot = createSnapshot();
    addImageFromClipboard(payload);
    pushUndo(beforeSnapshot);
    noticeMessage.value = "画像を追加しました。";
  } catch {
    noticeMessage.value = "貼り付けに失敗しました。";
  }
};

const handleKeyDown = (event: KeyboardEvent): void => {
  if (!props.active || isTextInputFocused()) {
    return;
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") {
    if (!state.value.selectedId) {
      return;
    }
    event.preventDefault();
    void copySelectedImage();
    return;
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
    if (!canUndo.value || interaction.value) {
      return;
    }
    event.preventDefault();
    undo();
    return;
  }

  if (event.key === "Delete") {
    if (!state.value.selectedId) {
      return;
    }
    event.preventDefault();
    removeSelectedItem(true);
  }
};

const onCanvasDrop = async (event: DragEvent): Promise<void> => {
  isDragActive.value = false;

  if (!props.active) {
    return;
  }

  const files = event.dataTransfer?.files;
  if (!files) {
    return;
  }

  await addDroppedFiles(files);
};

const preventWindowDrop = (event: Event): void => {
  event.preventDefault();
};

const getItemStyle = (item: CanvasImageItem): Record<string, string | number> => ({
  left: `${item.x}px`,
  top: `${item.y}px`,
  width: `${item.width}px`,
  height: `${item.height}px`,
  zIndex: item.zIndex
});

onMounted(() => {
  window.addEventListener("paste", handlePaste);
  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("dragover", preventWindowDrop);
  window.addEventListener("drop", preventWindowDrop);
});

onBeforeUnmount(() => {
  stopInteraction(false);
  window.removeEventListener("paste", handlePaste);
  window.removeEventListener("keydown", handleKeyDown);
  window.removeEventListener("dragover", preventWindowDrop);
  window.removeEventListener("drop", preventWindowDrop);
});
</script>

<template>
  <section class="clipboard-tab">
    <div class="canvas-toolbar">
      <button
        type="button"
        class="undo-button"
        :disabled="!canUndo"
        @click="undo"
      >
        元に戻す
      </button>
      <button
        type="button"
        class="copy-button"
        :disabled="!selectedItem"
        @click="copySelectedImage"
      >
        選択画像をコピー
      </button>
      <p class="notice">{{ noticeMessage }}</p>
    </div>

    <div
      ref="canvasViewportRef"
      class="canvas-viewport"
      :class="{ active: isDragActive }"
      @mousedown="clearSelection"
      @dragenter.prevent="props.active && (isDragActive = true)"
      @dragover.prevent="props.active && (isDragActive = true)"
      @dragleave.prevent="isDragActive = false"
      @drop.prevent="onCanvasDrop"
    >
      <div class="canvas-surface">
        <div
          v-for="item in state.items"
          :key="item.id"
          class="canvas-item"
          :class="{ selected: state.selectedId === item.id }"
          :style="getItemStyle(item)"
          @mousedown="startMove($event, item.id)"
        >
          <img
            :src="item.dataUrl"
            alt="配置画像"
            draggable="false"
          />

          <template v-if="state.selectedId === item.id">
            <span
              v-for="handle in HANDLE_DIRECTIONS"
              :key="handle"
              class="resize-handle"
              :class="`handle-${handle}`"
              @mousedown="startResize($event, item.id, handle)"
            />
          </template>
        </div>
      </div>
    </div>

    <p class="canvas-meta">画像数: {{ state.items.length }} / {{ MAX_IMAGES }}</p>
  </section>
</template>

<style scoped>
.clipboard-tab {
  display: grid;
  gap: 4px;
  height: 100%;
  min-height: 0;
  grid-template-rows: auto 1fr auto;
}

.canvas-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: nowrap;
  min-width: 0;
  padding: 1px 0;
}

.undo-button,
.copy-button {
  border-radius: 7px;
  padding: 4px 8px;
  cursor: pointer;
  font-weight: 700;
  font-size: 0.75rem;
  line-height: 1.2;
  flex-shrink: 0;
}

.undo-button {
  border: 1px solid #8aa0b5;
  background: #eaf1f8;
  color: #2f4c66;
}

.copy-button {
  border: 1px solid #1e5a7d;
  background: #1e5a7d;
  color: #ffffff;
}

.undo-button:disabled,
.copy-button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.notice {
  margin: 0;
  color: #36536d;
  font-size: 0.75rem;
  line-height: 1.35;
  overflow-wrap: anywhere;
  min-width: 0;
  flex: 1;
}

.canvas-viewport {
  height: 100%;
  min-height: 0;
  overflow: auto;
  border: 1px solid #c8d7e5;
  border-radius: 8px;
  background: #edf4fa;
}

.canvas-viewport.active {
  border-color: #0e6f81;
  box-shadow: inset 0 0 0 1px #0e6f81;
}

.canvas-surface {
  width: 2000px;
  height: 2000px;
  position: relative;
  background: #ffffff;
}

.canvas-item {
  position: absolute;
  cursor: move;
  user-select: none;
  border: 1px solid transparent;
  box-sizing: border-box;
}

.canvas-item.selected {
  border-color: #2f6f9c;
  box-shadow: 0 0 0 1px rgba(47, 111, 156, 0.3);
}

.canvas-item img {
  width: 100%;
  height: 100%;
  display: block;
  pointer-events: none;
}

.resize-handle {
  position: absolute;
  width: 10px;
  height: 10px;
  border-radius: 2px;
  background: #ffffff;
  border: 1px solid #2f6f9c;
}

.handle-n {
  top: -6px;
  left: calc(50% - 5px);
  cursor: n-resize;
}

.handle-ne {
  top: -6px;
  right: -6px;
  cursor: ne-resize;
}

.handle-e {
  top: calc(50% - 5px);
  right: -6px;
  cursor: e-resize;
}

.handle-se {
  right: -6px;
  bottom: -6px;
  cursor: se-resize;
}

.handle-s {
  bottom: -6px;
  left: calc(50% - 5px);
  cursor: s-resize;
}

.handle-sw {
  bottom: -6px;
  left: -6px;
  cursor: sw-resize;
}

.handle-w {
  top: calc(50% - 5px);
  left: -6px;
  cursor: w-resize;
}

.handle-nw {
  top: -6px;
  left: -6px;
  cursor: nw-resize;
}

.canvas-meta {
  margin: 0;
  color: #3f5f78;
  font-size: 0.72rem;
  line-height: 1;
}
</style>
