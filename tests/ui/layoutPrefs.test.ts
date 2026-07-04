import { describe, expect, it, beforeEach } from "vitest";
import {
  loadNumber,
  saveNumber,
  sideRatioKey,
  previewRatioKey,
} from "../../src/ui/layoutPrefs";

// vitest.config.ts runs this suite under the "node" environment (no real
// `window`), so we stub the minimal localStorage surface layoutPrefs.ts
// relies on rather than pulling in jsdom for one file.
class FakeStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  clear(): void {
    this.store.clear();
  }
}

beforeEach(() => {
  (globalThis as unknown as { window: { localStorage: FakeStorage } }).window = {
    localStorage: new FakeStorage(),
  };
});

describe("layoutPrefs", () => {
  it("returns the fallback when nothing is saved", () => {
    expect(loadNumber("missing-key", 0.42)).toBe(0.42);
  });

  it("round-trips a saved value", () => {
    saveNumber("some-key", 0.71);
    expect(loadNumber("some-key", 0.42)).toBe(0.71);
  });

  it("falls back on corrupted (non-numeric) stored data", () => {
    window.localStorage.setItem("bad-key", "not-a-number");
    expect(loadNumber("bad-key", 0.5)).toBe(0.5);
  });

  it("namespaces keys per diagram kind, not globally", () => {
    saveNumber(sideRatioKey("gantt"), 0.6);
    expect(loadNumber(sideRatioKey("pie"), 0.42)).toBe(0.42);
    expect(loadNumber(sideRatioKey("gantt"), 0.42)).toBe(0.6);
  });

  it("keeps side and preview ratios independent for the same kind", () => {
    saveNumber(sideRatioKey("quadrantChart"), 0.5);
    saveNumber(previewRatioKey("quadrantChart"), 0.3);
    expect(loadNumber(sideRatioKey("quadrantChart"), 0.42)).toBe(0.5);
    expect(loadNumber(previewRatioKey("quadrantChart"), 0.58)).toBe(0.3);
  });
});
