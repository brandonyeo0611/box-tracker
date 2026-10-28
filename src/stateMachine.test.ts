import { describe, it, expect } from "vitest";
import { scan } from "./stateMachine";
import type { Box } from "./stateMachine";
const box: Box = { id: "BOX-01", state: "AT_BLOOD_BANK", location: "Blood Bank", deliveredAt: null };
describe("location checkpoint scans", () => {
  it("places a box at a ward", () => {
    expect(scan(box, "Ward A", 100).box).toEqual({ ...box, state: "AT_WARD", location: "Ward A", deliveredAt: 100 });
  });
  it("keeps repeated ward reads at the ward and preserves arrival time", () => {
    const first = scan(box, "Ward A", 100).box;
    expect(scan(first, "Ward A", 200).box).toEqual(first);
  });
  it("moves a box to the most recently scanned ward", () => {
    expect(scan(scan(box, "Ward A", 100).box, "Ward B", 200).box).toEqual({ ...box, state: "AT_WARD", location: "Ward B", deliveredAt: 200 });
  });
  it("returns a ward box directly to Blood Bank without pickup scan", () => {
    expect(scan(scan(box, "Ward A", 100).box, "Blood Bank", 200).box).toEqual(box);
  });
  it("leaves repeated Blood Bank scans available", () => {
    expect(scan(box, "Blood Bank", 100).ok).toBe(true);
    expect(scan(box, "Blood Bank", 100).box).toEqual(box);
  });
});
