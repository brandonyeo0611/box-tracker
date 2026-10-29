import { expect, it } from "vitest";
import { waitingWards } from "./collectionList";
import type { Box } from "./stateMachine";
const box = (id: string, location: string, deliveredAt: number | null): Box => ({ id, location, deliveredAt, state: "AT_WARD" });
it("sorts wards by oldest box across levels and boxes by arrival", () => {
  const result = waitingWards([box("1", "Ward A", 300), box("2", "Ward C", 100), box("3", "Ward A", 200)]);
  expect(result.map(group => group.ward)).toEqual(["Ward C", "Ward A"]);
  expect(result[1].boxes.map(b => b.id)).toEqual(["3", "1"]);
});
it("puts missing times last and excludes retrieved boxes", () => {
  const result = waitingWards([box("1", "Ward A", null), box("2", "Ward B", 0), { ...box("3", "Blood Bank", null), state: "AT_BLOOD_BANK" }]);
  expect(result.map(group => group.ward)).toEqual(["Ward B", "Ward A"]);
});
