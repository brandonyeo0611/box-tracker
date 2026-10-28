import { afterEach, expect, it, vi } from "vitest";
import { startScan } from "./scanner";
afterEach(() => vi.unstubAllGlobals());
it("supports stopping the reader and delivers nonempty tag identities", async () => {
  let signal: AbortSignal | undefined;
  const reader = {
    onreading: null as ((e: unknown) => void) | null,
    async scan(options: { signal: AbortSignal }) { signal = options.signal; },
  };
  function Reader() { return reader; }
  vi.stubGlobal("window", { NDEFReader: Reader });
  const received: string[] = [];
  const stop = await startScan(id => received.push(id));
  reader.onreading?.({ serialNumber: "tag-1" });
  reader.onreading?.({ serialNumber: "" });
  expect(received).toEqual(["tag-1"]);
  stop(); expect(signal?.aborted).toBe(true); expect(reader.onreading).toBeNull();
});
