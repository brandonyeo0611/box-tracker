import { expect, it, vi, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import App from "./App";
afterEach(() => vi.unstubAllGlobals());
it("retains the original tracking sections and keeps reader controls separate", () => {
  vi.stubGlobal("window", { location: { search: "" } });
  const html = renderToStaticMarkup(<App />);
  expect(html).toContain("Empty boxes waiting");
  expect(html).toContain("All boxes");
  expect(html).toContain('max-width:480px');
  expect(html).not.toContain("Your current location");
  expect(html).not.toContain("No NFC? Simulate");
});
it("moves the original location and simulation controls to the NFC reader", () => {
  vi.stubGlobal("window", { location: { search: "?view=checkpoint" }, NDEFReader: class {}, isSecureContext: true });
  const html = renderToStaticMarkup(<App />);
  expect(html).toContain("Your current location");
  expect(html).toContain("Scan box");
  expect(html).toContain("No NFC? Simulate");
  expect(html).not.toContain("Empty boxes waiting");
  expect(html).not.toContain("All boxes");
});
