export type BoxState = "AT_BLOOD_BANK" | "AT_WARD";
export interface Box {
  id: string;
  state: BoxState;
  location: string;
  deliveredAt: number | null;
}
export const BLOOD_BANK = "Blood Bank";
export const WARDS = ["Ward A", "Ward B", "Ward C", "Ward D"];
export const LOCATIONS = [BLOOD_BANK, ...WARDS];
export function seedBoxes(): Box[] {
  return Array.from({ length: 10 }, (_, i) => ({ id: `BOX-${String(i + 1).padStart(2, "0")}`, state: "AT_BLOOD_BANK", location: BLOOD_BANK, deliveredAt: null }));
}
export function scan(box: Box, location: string, now: number): { box: Box; ok: boolean; message: string } {
  if (!LOCATIONS.includes(location)) return { box, ok: false, message: "Choose a valid checkpoint." };
  if (box.location === location) return { box, ok: true, message: `${box.id} already at ${location}` };
  return {
    box: { ...box, location, state: location === BLOOD_BANK ? "AT_BLOOD_BANK" : "AT_WARD", deliveredAt: location === BLOOD_BANK ? null : now },
    ok: true,
    message: `${box.id} recorded at ${location}`,
  };
}
