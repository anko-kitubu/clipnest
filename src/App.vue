<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import ClipboardTab from "./components/ClipboardTab.vue";
import TasksTab from "./components/TasksTab.vue";

type TabKey = "clipboard" | "tasks";

const activeTab = ref<TabKey>("clipboard");
const alwaysOnTop = ref(false);
const isPinBusy = ref(true);
const pinError = ref("");

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: "clipboard", label: "クリップボード" },
  { key: "tasks", label: "タスク" }
];

const pinStateLabel = computed(() => (alwaysOnTop.value ? "ON" : "OFF"));

const syncPinState = async (): Promise<void> => {
  pinError.value = "";
  try {
    const state = await window.desktopApi.getAlwaysOnTop();
    alwaysOnTop.value = state.enabled;
  } catch {
    pinError.value = "ピン止め状態の取得に失敗しました。";
  } finally {
    isPinBusy.value = false;
  }
};

const handlePinToggle = async (event: Event): Promise<void> => {
  const input = event.target as HTMLInputElement | null;
  if (!input) {
    return;
  }

  isPinBusy.value = true;
  pinError.value = "";
  try {
    const state = await window.desktopApi.setAlwaysOnTop(input.checked);
    alwaysOnTop.value = state.enabled;
  } catch {
    pinError.value = "ピン止め状態の切り替えに失敗しました。";
  } finally {
    isPinBusy.value = false;
  }
};

onMounted(() => {
  void syncPinState();
});
</script>

<template>
  <div class="app-shell">
    <p
      v-if="pinError"
      class="pin-error"
    >
      {{ pinError }}
    </p>

    <nav class="tab-nav">
      <div class="tab-buttons">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          type="button"
          :class="{ active: activeTab === tab.key }"
          @click="activeTab = tab.key"
        >
          {{ tab.label }}
        </button>
      </div>

      <label class="pin-control">
        <span class="pin-label">最前面</span>
        <input
          class="pin-input"
          type="checkbox"
          :checked="alwaysOnTop"
          :disabled="isPinBusy"
          @change="handlePinToggle"
        />
        <span class="pin-slider" />
        <span class="pin-state">{{ pinStateLabel }}</span>
      </label>
    </nav>

    <main class="tab-body">
      <ClipboardTab
        class="clipboard-pane"
        v-show="activeTab === 'clipboard'"
        :active="activeTab === 'clipboard'"
      />
      <TasksTab
        class="tasks-pane"
        v-show="activeTab === 'tasks'"
      />
    </main>
  </div>
</template>

<style scoped>
.app-shell {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #ffffff;
}

.pin-error {
  margin: 0;
  padding: 6px 10px;
  color: #a12323;
  background: #ffeaea;
  border-bottom: 1px solid #ffd3d3;
  font-size: 0.78rem;
}

.tab-nav {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: flex-end;
  flex-wrap: nowrap;
  min-width: 0;
  padding: 4px 8px 0;
  border-bottom: 1px solid #d6e1eb;
  background: #e9eef4;
}

.tab-buttons {
  display: flex;
  gap: 0;
  min-width: 0;
  flex: 1;
  overflow: hidden;
}

.pin-control {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  position: relative;
  user-select: none;
  flex-shrink: 0;
  padding-bottom: 4px;
}

.pin-label {
  font-size: 0.74rem;
  color: #2a445b;
  white-space: nowrap;
}

.pin-input {
  position: absolute;
  opacity: 0;
  width: 1px;
  height: 1px;
}

.pin-slider {
  position: relative;
  width: 46px;
  height: 24px;
  border-radius: 999px;
  background: #d2dde8;
  border: 1px solid #afc1d2;
  transition: background-color 0.2s ease;
}

.pin-slider::before {
  content: "";
  position: absolute;
  top: 2px;
  left: 2px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #ffffff;
  transition: transform 0.2s ease;
}

.pin-input:checked + .pin-slider {
  background: #8fd575;
}

.pin-input:checked + .pin-slider::before {
  transform: translateX(22px);
}

.pin-input:disabled + .pin-slider {
  opacity: 0.6;
}

.pin-state {
  display: inline-flex;
  align-items: center;
  min-width: 22px;
  font-size: 0.72rem;
  font-weight: 700;
  color: #1f3a52;
  white-space: nowrap;
}

.tab-buttons button {
  border: 1px solid #b7c4d1;
  border-bottom: none;
  border-radius: 8px 8px 0 0;
  padding: 4px 8px;
  background: #dbe4ee;
  color: #34506a;
  font-weight: 600;
  font-size: 0.78rem;
  line-height: 1.2;
  cursor: pointer;
  white-space: nowrap;
  min-width: 0;
  margin-right: 2px;
  position: relative;
  top: 1px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tab-buttons button.active {
  border-color: #9eb1c4;
  background: #ffffff;
  color: #123e62;
  font-weight: 700;
  z-index: 1;
}

.tab-body {
  flex: 1;
  min-height: 0;
  padding: 4px 8px 6px;
  overflow: hidden;
}

.clipboard-pane {
  height: 100%;
  min-height: 0;
}

.tasks-pane {
  width: 100%;
}
</style>
