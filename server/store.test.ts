import { afterEach, describe, expect, it } from "vitest";
import { Store } from "./store";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const stores: Store[] = [];
const open = (path = ":memory:") => { const s = new Store(path); stores.push(s); return s; };
afterEach(() => { for (const s of stores.splice(0)) s.close(); });
describe("shared checkpoint store", () => {
  it("updates counts and clears the ward on return, without pickup", () => {
    const s = open();
    s.record("BOX-01", "Ward A"); s.record("BOX-02", "Ward A");
    s.record("BOX-01", "Ward A");
    expect(s.boxes().filter(b => b.location === "Ward A")).toHaveLength(2);
    s.record("BOX-01", "Blood Bank");
    expect(s.boxes().filter(b => b.location === "Ward A")).toHaveLength(1);
  });
  it("rejects unknown boxes and checkpoints without changing data", () => {
    const s = open(); const before = s.boxes();
    expect(() => s.record("unknown", "Ward A")).toThrow();
    expect(() => s.record("BOX-01", "unknown")).toThrow();
    expect(s.boxes()).toEqual(before);
  });
  it("shares tag registration and resolves tags on subsequent scans", () => {
    const s = open();
    s.register("tag-1", "BOX-01");
    expect(s.resolve("tag-1")).toBe("BOX-01");
    expect(() => s.register("tag-1", "BOX-02")).toThrow();
    expect(() => s.register("tag-2", "BOX-01")).toThrow();
  });
  it("resets shared boxes and tag mappings for another demo", () => {
    const s = open(); s.register("tag-1", "BOX-01"); s.record("BOX-01", "Ward A");
    s.reset();
    expect(s.boxes().every(b => b.location === "Blood Bank" && b.deliveredAt === null)).toBe(true);
    expect(s.resolve("tag-1")).toBeUndefined();
  });
  it("persists boxes and mappings across server restarts", () => {
    const dir = mkdtempSync(join(tmpdir(), "box-tracker-"));
    try {
      const path = join(dir, "test.sqlite"); const s = new Store(path);
      s.register("tag-1", "BOX-01"); s.record("BOX-01", "Ward A"); s.close();
      const reopened = new Store(path);
      try { expect(reopened.resolve("tag-1")).toBe("BOX-01"); expect(reopened.boxes()[0].location).toBe("Ward A"); }
      finally { reopened.close(); }
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

