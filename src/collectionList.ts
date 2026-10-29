import type { Box } from "./stateMachine";
export function waitingWards(boxes: Box[]) {
  const wards = new Map<string, Box[]>();
  for (const box of boxes) {
    if (box.state !== "AT_WARD") continue;
    if (!wards.has(box.location)) wards.set(box.location, []);
    wards.get(box.location)!.push(box);
  }
  return Array.from(wards, ([ward, members]) => {
    const sorted = [...members].sort((a, b) => (a.deliveredAt ?? Infinity) - (b.deliveredAt ?? Infinity) || a.id.localeCompare(b.id));
    return { ward, boxes: sorted, oldest: sorted[0].deliveredAt ?? Infinity };
  }).sort((a, b) => a.oldest - b.oldest || a.ward.localeCompare(b.ward));
}
