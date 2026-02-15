import { app } from "electron";
import fs from "node:fs";
import path from "node:path";

export interface UiPreferences {
  alwaysOnTop: boolean;
}

const DEFAULT_PREFERENCES: UiPreferences = {
  alwaysOnTop: false
};

export class PreferencesStore {
  private readonly filePath: string;

  constructor() {
    this.filePath = path.join(app.getPath("userData"), "ui-preferences.json");
  }

  read(): UiPreferences {
    if (!fs.existsSync(this.filePath)) {
      return { ...DEFAULT_PREFERENCES };
    }

    try {
      const rawText = fs.readFileSync(this.filePath, "utf8");
      const parsed = JSON.parse(rawText) as Partial<UiPreferences>;
      return this.sanitize(parsed);
    } catch {
      return { ...DEFAULT_PREFERENCES };
    }
  }

  setAlwaysOnTop(enabled: boolean): UiPreferences {
    const nextPreferences: UiPreferences = {
      ...this.read(),
      alwaysOnTop: enabled
    };
    this.write(nextPreferences);
    return nextPreferences;
  }

  private sanitize(value: Partial<UiPreferences>): UiPreferences {
    return {
      alwaysOnTop:
        typeof value.alwaysOnTop === "boolean"
          ? value.alwaysOnTop
          : DEFAULT_PREFERENCES.alwaysOnTop
    };
  }

  private write(preferences: UiPreferences): void {
    const directory = path.dirname(this.filePath);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(preferences, null, 2), "utf8");
  }
}
