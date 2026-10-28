export type OnTagCallback = (serial: string) => void;

export function isNFCSupported(): boolean {
  return typeof window !== "undefined" && "NDEFReader" in window;
}

export async function startScan(onTag: OnTagCallback): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reader = new (window as any).NDEFReader();
  await reader.scan();
  reader.onreading = (e: { serialNumber: string }) => onTag(e.serialNumber);
}
