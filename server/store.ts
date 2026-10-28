import { DatabaseSync } from "node:sqlite";
import { scan, seedBoxes, LOCATIONS } from "../src/stateMachine.ts";
import type { Box } from "../src/stateMachine.ts";
export class Store {
  db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS boxes (id TEXT PRIMARY KEY, state TEXT NOT NULL, location TEXT NOT NULL, deliveredAt INTEGER); CREATE TABLE IF NOT EXISTS tags (tag TEXT PRIMARY KEY, boxId TEXT NOT NULL UNIQUE REFERENCES boxes(id));");
    const insert = this.db.prepare("INSERT OR IGNORE INTO boxes VALUES (?, ?, ?, ?)");
    for (const b of seedBoxes()) insert.run(b.id, b.state, b.location, b.deliveredAt);
  }
  boxes(): Box[] { return this.db.prepare("SELECT * FROM boxes ORDER BY id").all() as unknown as Box[]; }
  resolve(tag: string): string | undefined {
    return (this.db.prepare("SELECT boxId FROM tags WHERE tag = ?").get(tag) as { boxId: string } | undefined)?.boxId;
  }
  register(tag: string, boxId: string) {
    if (!tag || tag.length > 256 || !this.boxes().some(b => b.id === boxId)) throw new Error("Choose a known box and a valid tag.");
    const existing = this.resolve(tag);
    if (existing === boxId) return;
    if (existing) throw new Error("This tag is already assigned to another box.");
    if (this.db.prepare("SELECT tag FROM tags WHERE boxId = ?").get(boxId)) throw new Error("This box already has a tag.");
    this.db.prepare("INSERT INTO tags VALUES (?, ?)").run(tag, boxId);
  }
  record(boxId: string, location: string) {
    if (!LOCATIONS.includes(location)) throw new Error("Choose a valid checkpoint.");
    const box = this.boxes().find(b => b.id === boxId);
    if (!box) throw new Error("Unknown box. Register its tag in checkpoint setup first.");
    const result = scan(box, location, Date.now());
    this.db.prepare("UPDATE boxes SET state = ?, location = ?, deliveredAt = ? WHERE id = ?")
      .run(result.box.state, result.box.location, result.box.deliveredAt, boxId);
    return result;
  }
  reset() {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.exec("DELETE FROM tags; UPDATE boxes SET state = 'AT_BLOOD_BANK', location = 'Blood Bank', deliveredAt = NULL;");
      this.db.exec("COMMIT");
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  close() { this.db.close(); }
}

