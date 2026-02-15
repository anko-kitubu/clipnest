<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import type { TaskItem } from "../types/models";

const STORAGE_KEY = "taskClipboard.tasks.v1";

const draftTask = ref("");
const tasks = ref<TaskItem[]>([]);
const hintMessage = ref("タスクを追加してください。");

const persistTasks = (): void => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks.value));
};

const loadTasks = (): void => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    tasks.value = [];
    return;
  }

  try {
    const parsed = JSON.parse(raw) as TaskItem[];
    tasks.value = parsed.filter(
      (task) =>
        typeof task.id === "string" &&
        typeof task.text === "string" &&
        typeof task.createdAt === "number"
    );
  } catch {
    tasks.value = [];
  }
};

const addTask = (): void => {
  const text = draftTask.value.trim();
  if (!text) {
    hintMessage.value = "空白タスクは追加できません。";
    return;
  }

  tasks.value = [
    {
      id: crypto.randomUUID(),
      text,
      createdAt: Date.now()
    },
    ...tasks.value
  ];
  draftTask.value = "";
  hintMessage.value = "チェックすると削除されます。";
};

const completeTask = (taskId: string): void => {
  tasks.value = tasks.value.filter((task) => task.id !== taskId);
  hintMessage.value = "タスクを削除しました。";
};

onMounted(() => {
  loadTasks();
});

watch(
  tasks,
  () => {
    persistTasks();
  },
  { deep: true }
);
</script>

<template>
  <section class="tasks-tab">
    <form
      class="task-form"
      @submit.prevent="addTask"
    >
      <input
        v-model="draftTask"
        type="text"
        placeholder="例: 見積もりを送る"
      />
      <button type="submit">追加</button>
    </form>

    <p class="hint">{{ hintMessage }}</p>

    <ul
      v-if="tasks.length > 0"
      class="task-list"
    >
      <li
        v-for="task in tasks"
        :key="task.id"
      >
        <label>
          <input
            type="checkbox"
            @change="completeTask(task.id)"
          />
          <span>{{ task.text }}</span>
        </label>
      </li>
    </ul>

    <p
      v-else
      class="empty"
    >
      未完了タスクはありません。
    </p>
  </section>
</template>

<style scoped>
.tasks-tab {
  display: grid;
  gap: 8px;
}

.task-form {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
}

.task-form input {
  border: 1px solid #b8c8d7;
  border-radius: 8px;
  padding: 7px 9px;
  background: #ffffff;
  font-size: 0.82rem;
}

.task-form button {
  border: 1px solid #1e5a7d;
  background: #1e5a7d;
  color: #ffffff;
  border-radius: 8px;
  padding: 7px 10px;
  cursor: pointer;
  font-weight: 700;
  font-size: 0.8rem;
  line-height: 1.2;
}

.hint {
  margin: 0;
  color: #3a546c;
  font-size: 0.8rem;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.task-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 8px;
}

.task-list li {
  border: 1px solid #d4dfeb;
  border-radius: 8px;
  background: #ffffff;
}

.task-list label {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 9px;
  cursor: pointer;
  font-size: 0.82rem;
  line-height: 1.3;
}

.task-list input[type="checkbox"] {
  width: 16px;
  height: 16px;
  accent-color: #1e5a7d;
}

.empty {
  margin: 0;
  color: #4b6278;
  font-size: 0.8rem;
}

@media (max-width: 560px) {
  .task-form {
    grid-template-columns: 1fr;
  }
}
</style>
