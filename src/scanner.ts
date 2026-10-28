export type OnTagCallback = (identity: string) => void;
interface Reading { serialNumber?: string }
interface Reader {
  scan(options: { signal: AbortSignal }): Promise<void>;
  onreading: ((event: Reading) => void) | null;
  onreadingerror: (() => void) | null;
}
export function isNFCSupported(): boolean {
  return typeof window !== "undefined" && "NDEFReader" in window && window.isSecureContext !== false;
}
export async function startScan(onTag: OnTagCallback, onError: (message: string) => void = () => {}, signal?: AbortSignal): Promise<() => void> {
  const ReaderClass = (window as unknown as { NDEFReader: new () => Reader }).NDEFReader;
  const reader = new ReaderClass();
  const controller = new AbortController();
  const stop = () => { controller.abort(); reader.onreading = null; reader.onreadingerror = null; signal?.removeEventListener("abort", stop); };
  signal?.addEventListener("abort", stop, { once: true });
  if (signal?.aborted) { stop(); return stop; }
  reader.onreading = event => {
    const identity = event.serialNumber?.trim();
    if (identity) onTag(identity);
    else onError("This tag has no readable identity. Try a different tag.");
  };
  reader.onreadingerror = () => onError("Could not read the tag. Hold one tag close to the phone and try again.");
  try { await reader.scan({ signal: controller.signal }); }
  catch (error) { stop(); throw error; }
  return stop;
}
