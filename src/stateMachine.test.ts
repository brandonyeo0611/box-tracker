import { describe, it, expect } from "vitest";
import { scan } from "./stateMachine";
import type { Box } from "./stateMachine";

const NOW = 1_000_000;

const box = (state: Box["state"], location: string): Box => ({
  id: "BOX-01",
  state,
  location,
  deliveredAt: state === "AT_WARD" ? NOW - 5000 : null,
});

describe("stateMachine scan", () => {
  const cases: [string, Box, string, boolean, string][] = [
    [
      "AT_BLOOD_BANK + ward -> AT_WARD",
      box("AT_BLOOD_BANK", "Blood Bank"),
      "Ward A",
      true,
      "BOX-01 delivered to Ward A",
    ],
    [
      "AT_WARD + same ward -> IN_TRANSIT_BACK",
      box("AT_WARD", "Ward A"),
      "Ward A",
      true,
      "BOX-01 collected from Ward A",
    ],
    [
      "IN_TRANSIT_BACK + Blood Bank -> AT_BLOOD_BANK",
      box("IN_TRANSIT_BACK", "Ward A"),
      "Blood Bank",
      true,
      "BOX-01 returned to Blood Bank",
    ],
    [
      "AT_WARD + wrong ward -> no change",
      box("AT_WARD", "Ward A"),
      "Ward B",
      false,
      "BOX-01 is at Ward A. Nothing changed.",
    ],
  ];

  for (const [name, input, location, expectedOk, expectedMsg] of cases) {
    it(name, () => {
      const result = scan(input, location, NOW);
      expect(result.ok).toBe(expectedOk);
      expect(result.message).toBe(expectedMsg);
      if (!expectedOk) {
        expect(result.box).toEqual(input);
      }
    });
  }
});
