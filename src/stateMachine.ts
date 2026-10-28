export type BoxState = "AT_BLOOD_BANK" | "AT_WARD" | "IN_TRANSIT_BACK";

export interface Box {
  id: string;
  state: BoxState;
  location: string;
  deliveredAt: number | null;
}

export interface ScanResult {
  box: Box;
  ok: boolean;
  message: string;
}

export function scan(box: Box, scanLocation: string, now: number): ScanResult {
  const isBloodBank = scanLocation === "Blood Bank";

  if (box.state === "AT_BLOOD_BANK" && !isBloodBank) {
    return {
      box: { ...box, state: "AT_WARD", location: scanLocation, deliveredAt: now },
      ok: true,
      message: `${box.id} delivered to ${scanLocation}`,
    };
  }

  if (box.state === "AT_WARD" && scanLocation === box.location) {
    return {
      box: { ...box, state: "IN_TRANSIT_BACK" },
      ok: true,
      message: `${box.id} collected from ${box.location}`,
    };
  }

  if (box.state === "IN_TRANSIT_BACK" && isBloodBank) {
    return {
      box: { ...box, state: "AT_BLOOD_BANK", location: "Blood Bank", deliveredAt: null },
      ok: true,
      message: `${box.id} returned to Blood Bank`,
    };
  }

  const stateLabel =
    box.state === "AT_BLOOD_BANK"
      ? "at Blood Bank"
      : box.state === "AT_WARD"
      ? `at ${box.location}`
      : `in transit back from ${box.location}`;

  return {
    box,
    ok: false,
    message: `${box.id} is ${stateLabel}. Nothing changed.`,
  };
}
