import { useState, useEffect, useRef } from "react";
import { waitingWards } from "./collectionList";
import type { Box, BoxState } from "./stateMachine";
import { isNFCSupported, startScan } from "./scanner";

const BLOOD_BANK = "Blood Bank";

const WARDS = [
  { name: "Ward A", level: 2 },
  { name: "Ward B", level: 2 },
  { name: "Ward C", level: 3 },
  { name: "Ward D", level: 4 },
];

const ALL_LOCATIONS = [BLOOD_BANK, ...WARDS.map((w) => w.name)];

function levelOf(wardName: string): number | null {
  return WARDS.find((w) => w.name === wardName)?.level ?? null;
}

function locationLabel(loc: string): string {
  const ward = WARDS.find((w) => w.name === loc);
  return ward ? `Level ${ward.level} · ${ward.name}` : loc;
}


function formatAge(ms: number): string {
  if (ms < 0) ms = 0;
  const totalMins = Math.floor(ms / 60000);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

function stateLabel(s: BoxState): string {
  switch (s) {
    case "AT_BLOOD_BANK": return "Retrieved";
    case "AT_WARD": return "Awaiting retrieval";
  }
}


async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/${path}`, body === undefined
    ? { cache: "no-store", signal: AbortSignal.timeout(5000) }
    : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(5000) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Unable to reach the shared server.");
  return data;
}
const errorMessage = (error: unknown) => error instanceof Error ? error.message : "Unable to save. Try again.";

export default function App() {
  const checkpoint = new URLSearchParams(window.location.search).get("view") === "checkpoint";
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [connected, setConnected] = useState(false);
  const [now, setNow] = useState(Date.now);
  const [location, setLocation] = useState(() => {
    try { const saved = localStorage.getItem("location") || localStorage.getItem("checkpointLocation"); return saved && ALL_LOCATIONS.includes(saved) ? saved : BLOOD_BANK; }
    catch { return BLOOD_BANK; }
  });
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [allOpen, setAllOpen] = useState(false);
  const [expandedWard, setExpandedWard] = useState<string | null>(null);
  const [filterState, setFilterState] = useState<BoxState | "">("");
  const [filterLocation, setFilterLocation] = useState("");
  const [simOpen, setSimOpen] = useState(false);
  const [simBoxId, setSimBoxId] = useState("BOX-01");
  const [pendingSerial, setPendingSerial] = useState<string | null>(null);
  const [pendingBoxId, setPendingBoxId] = useState("BOX-01");
  const [scanning, setScanning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [busy, setBusy] = useState(false);
  const nfcAvailable = isNFCSupported();
  const session = useRef<AbortController | null>(null);
  const inFlight = useRef(false);
  const lastRead = useRef({ tag: "", at: 0 });

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const data = await request<Box[]>("boxes");
        if (active) { setBoxes(data); setConnected(true); setNow(Date.now()); }
      } catch { if (active) setConnected(false); }
      finally { if (active) timer = setTimeout(poll, 1500); }
    };
    void poll();
    return () => { active = false; clearTimeout(timer); session.current?.abort(); };
  }, []);
  useEffect(() => { try { localStorage.setItem("location", location); } catch { /* Keep the selection for this session. */ } }, [location]);

  const stop = () => { session.current?.abort(); session.current = null; setScanning(false); setStarting(false); };
  const applyBoxScan = async (identity: { tag: string } | { boxId: string }) => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true);
    try {
      const saved = await request<{ message: string }>("scans", { ...identity, location });
      setResult({ ok: true, message: saved.message });
    } catch (error) {
      const message = errorMessage(error);
      setResult({ ok: false, message });
      if ("tag" in identity && message.startsWith("Unknown tag.")) {
        stop(); setPendingSerial(identity.tag); setPendingBoxId("BOX-01");
      }
    } finally { inFlight.current = false; setBusy(false); }
  };
  const handleScanButton = async () => {
    if (session.current) { stop(); return; }
    const controller = new AbortController(); session.current = controller;
    setStarting(true); setResult(null); setPendingSerial(null); lastRead.current = { tag: "", at: 0 };
    try {
      await startScan(tag => {
        if (controller.signal.aborted || inFlight.current) return;
        const now = Date.now();
        if (lastRead.current.tag === tag && now - lastRead.current.at < 2000) return;
        lastRead.current = { tag, at: now };
        void applyBoxScan({ tag });
      }, message => setResult({ ok: false, message }), controller.signal);
      if (!controller.signal.aborted) setScanning(true);
    } catch (error) {
      if (!controller.signal.aborted) { session.current = null; setResult({ ok: false, message: errorMessage(error) }); }
    } finally { if (session.current === controller) setStarting(false); }
  };
  const confirmTagMapping = async () => {
    if (!pendingSerial || inFlight.current) return;
    setBusy(true);
    try {
      await request("tags", { tag: pendingSerial, boxId: pendingBoxId });
      setPendingSerial(null);
      await applyBoxScan({ boxId: pendingBoxId });
    } catch (error) { setResult({ ok: false, message: errorMessage(error) }); }
    finally { setBusy(false); }
  };
  const handleSimulate = () => { void applyBoxScan({ boxId: simBoxId }); };
  const handleReset = async () => {
    if (!window.confirm("Reset all shared demo boxes and tag mappings?")) return;
    stop(); setBusy(true);
    try {
      await request("reset", {}); setPendingSerial(null); setLocation(BLOOD_BANK);
      setResult({ ok: true, message: "Demo boxes and tags reset." });
    } catch (error) { setResult({ ok: false, message: errorMessage(error) }); }
    finally { setBusy(false); }
  };

  const sortedWards = waitingWards(boxes);

  return (
    <div style={S.page}>
      <header style={S.header}>
        <h1 style={S.title}>Box Tracker</h1>
      </header>

      <main style={S.main}>
        {checkpoint && <>
        {/* 1. Location */}
        <section style={S.card}>
          <label htmlFor="location-select" style={S.label}>
            Your current location
          </label>
          <select
            id="location-select"
            value={location}
            disabled={scanning || starting || busy}
            onChange={(e) => { setLocation(e.target.value); setResult(null); }}
            style={S.select}
          >
            <option value={BLOOD_BANK}>{BLOOD_BANK}</option>
            {WARDS.map((w) => (
              <option key={w.name} value={w.name}>
                Level {w.level} · {w.name}
              </option>
            ))}
          </select>
        </section>

        {/* 2. Scan */}
        <section style={S.card}>
          {nfcAvailable ? (
            <button
              style={{ ...S.scanBtn, opacity: scanning ? 0.6 : 1 }}
              onClick={handleScanButton}
              disabled={busy || (!connected && !scanning && !starting)}
            >
              {starting ? "Cancel starting" : scanning ? "Stop scanning" : "Scan box"}
            </button>
          ) : (
            <p style={S.nfcNote}>NFC unavailable. Use HTTPS on a compatible NFC phone, or Simulate below.</p>
          )}

          {pendingSerial && (
            <div style={S.unknownTag}>
              <p style={S.unknownTagLabel}>
                Unknown tag <code>{pendingSerial}</code>. Which box is this?
              </p>
              <div style={S.row}>
                <select
                  value={pendingBoxId}
                  disabled={busy}
                  onChange={(e) => setPendingBoxId(e.target.value)}
                  style={{ ...S.select, flex: 1 }}
                >
                  {boxes.map((b) => (
                    <option key={b.id} value={b.id}>{b.id}</option>
                  ))}
                </select>
                <button style={S.confirmBtn} disabled={busy || !connected} onClick={() => void confirmTagMapping()}>
                  Confirm
                </button>
              </div>
            </div>
          )}

          {result && (
            <p style={{ ...S.resultLine, color: result.ok ? "#0a7d52" : "#9a5400" }}>
              {result.ok ? "✓" : "⚠"} {result.message}
            </p>
          )}
        </section>

        </>}
        {!checkpoint && <>
        {/* 3. Round list */}
        <section style={S.card}>
          <h2 style={S.sectionTitle}>Empty boxes waiting</h2>
          {sortedWards.length === 0 ? (
            <p style={S.emptyState}>No empty boxes waiting.</p>
          ) : sortedWards.map(({ ward, boxes: bxs, oldest }) => {
            const age = oldest < Infinity ? formatAge(now - oldest) : "—";
            const count = bxs.length;
            const isOpen = expandedWard === ward;
            return (
              <div key={ward}>
                <p style={S.levelHeading}>Level {levelOf(ward)}</p>
                <button style={S.wardRowBtn} onClick={() => setExpandedWard(isOpen ? null : ward)}>
                  <span style={S.wardName}>{ward}</span>
                  <span style={S.wardDetail}>
                    {count} empty {count === 1 ? "box" : "boxes"} · oldest {age}
                    <span style={S.chevron}>{isOpen ? " ▾" : " ▸"}</span>
                  </span>
                </button>
                {isOpen && (
                  <div style={S.boxChips}>
                    {bxs.map(b => <span key={b.id} style={S.chip}>{b.id}</span>)}
                  </div>
                )}
              </div>
            );
          })}
        </section>

        {/* 4. All boxes */}
        <section style={S.card}>
          <button style={S.collapseBtn} onClick={() => setAllOpen((v) => !v)}>
            {allOpen ? "▾" : "▸"} All boxes
          </button>
          {allOpen && (() => {
            const filtered = boxes.filter(
              (b) =>
                (filterState === "" || b.state === filterState) &&
                (filterLocation === "" || b.location === filterLocation)
            );
            return (
              <>
                <div style={{ ...S.row, marginTop: "12px", gap: "8px" }}>
                  <select
                    aria-label="Filter by state"
                    value={filterState}
                    onChange={(e) => setFilterState(e.target.value as BoxState | "")}
                    style={{ ...S.select, flex: 1, height: "36px", fontSize: "0.85rem" }}
                  >
                    <option value="">All states</option>
                    <option value="AT_BLOOD_BANK">Retrieved</option>
                    <option value="AT_WARD">Awaiting retrieval</option>
                  </select>
                  <select
                    aria-label="Filter by location"
                    value={filterLocation}
                    onChange={(e) => setFilterLocation(e.target.value)}
                    style={{ ...S.select, flex: 1, height: "36px", fontSize: "0.85rem" }}
                  >
                    <option value="">All locations</option>
                    {ALL_LOCATIONS.map((loc) => (
                      <option key={loc} value={loc}>{locationLabel(loc)}</option>
                    ))}
                  </select>
                </div>
                <table style={S.table}>
                  <thead>
                    <tr>
                      <th style={S.th}>ID</th>
                      <th style={S.th}>State</th>
                      <th style={S.th}>Location</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr><td colSpan={3} style={{ ...S.td, color: "#6b7a8d" }}>No boxes match.</td></tr>
                    ) : (
                      filtered.map((b) => (
                        <tr key={b.id}>
                          <td style={S.td}>{b.id}</td>
                          <td style={{ ...S.td, color: b.state === "AT_BLOOD_BANK" ? "#0a7d52" : "#b42318" }}>{stateLabel(b.state)}</td>
                          <td style={S.td}>{locationLabel(b.location)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </>
            );
          })()}
        </section>

        </>}
        {checkpoint && <>
        {/* 5. Simulate */}
        <section style={S.card}>
          <button style={S.collapseBtn} onClick={() => setSimOpen((v) => !v)}>
            {simOpen ? "▾" : "▸"} No NFC? Simulate
          </button>
          {simOpen && (
            <div style={{ marginTop: "12px" }}>
              <label htmlFor="sim-box" style={S.label}>Box</label>
              <div style={S.row}>
                <select
                  id="sim-box"
                  value={simBoxId}
                  onChange={(e) => setSimBoxId(e.target.value)}
                  style={{ ...S.select, flex: 1 }}
                >
                  {boxes.map((b) => (
                    <option key={b.id} value={b.id}>{b.id}</option>
                  ))}
                </select>
                <button style={S.confirmBtn} disabled={busy || !connected || scanning || starting} onClick={handleSimulate}>
                  Scan
                </button>
              </div>
            </div>
          )}
        </section>
        </>}
        {!connected && <p style={S.nfcNote} role="status">Not connected. Check the server; displayed locations may be out of date.</p>}
      </main>

      <footer style={S.footer}>
        {checkpoint && <button style={S.resetBtn} disabled={busy || !connected} onClick={() => void handleReset()}>Reset everything</button>}
        <p><a style={{ color: BLUE, fontSize: "0.85rem" }} href={checkpoint ? "/" : "/?view=checkpoint"} onClick={stop}>{checkpoint ? "View tracking" : "Reader interface"}</a></p>
      </footer>
    </div>
  );
}

// ─── styles ───────────────────────────────────────────────────────────────────

const BLUE = "#1a3a5c";
const TEAL = "#007a87";
const BG = "#f5f7fa";
const BORDER = "#dde3ea";

const S: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: BG,
    fontFamily: "'Segoe UI', system-ui, sans-serif",
    color: BLUE,
    display: "flex",
    flexDirection: "column",
  },
  header: {
    background: BLUE,
    padding: "16px 20px",
  },
  title: {
    margin: 0,
    color: "#ffffff",
    fontSize: "1.25rem",
    fontWeight: 700,
    letterSpacing: "0.02em",
  },
  main: {
    flex: 1,
    padding: "16px",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    maxWidth: "480px",
    width: "100%",
    margin: "0 auto",
    boxSizing: "border-box",
  },
  card: {
    background: "#ffffff",
    border: `1px solid ${BORDER}`,
    borderRadius: "8px",
    padding: "16px",
  },
  label: {
    display: "block",
    fontSize: "0.75rem",
    fontWeight: 600,
    color: BLUE,
    marginBottom: "6px",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  select: {
    width: "100%",
    height: "44px",
    border: `1px solid ${BORDER}`,
    borderRadius: "6px",
    padding: "0 12px",
    fontSize: "1rem",
    color: BLUE,
    background: "#fff",
    boxSizing: "border-box",
  },
  scanBtn: {
    display: "block",
    width: "100%",
    height: "56px",
    background: TEAL,
    color: "#fff",
    fontSize: "1.1rem",
    fontWeight: 700,
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
  },
  nfcNote: {
    color: "#9a5400",
    fontWeight: 500,
    margin: 0,
  },
  unknownTag: {
    marginTop: "12px",
    padding: "12px",
    background: "#fffbe6",
    borderRadius: "6px",
    border: "1px solid #f0d070",
  },
  unknownTagLabel: {
    margin: "0 0 8px 0",
    fontSize: "0.9rem",
    color: "#5a4000",
  },
  row: {
    display: "flex",
    gap: "8px",
    alignItems: "center",
  },
  confirmBtn: {
    height: "44px",
    padding: "0 16px",
    background: BLUE,
    color: "#fff",
    border: "none",
    borderRadius: "6px",
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap",
    flexShrink: 0,
  },
  resultLine: {
    marginTop: "12px",
    marginBottom: 0,
    fontWeight: 600,
    fontSize: "0.95rem",
  },
  sectionTitle: {
    margin: "0 0 12px 0",
    fontSize: "1rem",
    fontWeight: 700,
  },
  emptyState: {
    color: "#6b7a8d",
    margin: 0,
    fontSize: "0.9rem",
  },
  levelHeading: {
    margin: "8px 0 4px 0",
    fontWeight: 700,
    fontSize: "0.75rem",
    color: TEAL,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  wardRowBtn: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    padding: "8px 0",
    gap: "8px",
    width: "100%",
    background: "none",
    border: "none",
    borderBottom: `1px solid ${BORDER}`,
    cursor: "pointer",
    textAlign: "left",
  },
  boxChips: {
    display: "flex",
    flexWrap: "wrap",
    gap: "6px",
    padding: "8px 0 10px 0",
    borderBottom: `1px solid ${BORDER}`,
  },
  chip: {
    background: "#e8f4f5",
    color: TEAL,
    borderRadius: "4px",
    padding: "2px 8px",
    fontSize: "0.8rem",
    fontWeight: 600,
    fontFamily: "monospace",
  },
  chevron: {
    color: TEAL,
  },
  wardName: {
    fontWeight: 600,
    fontSize: "0.95rem",
  },
  wardDetail: {
    fontSize: "0.85rem",
    color: "#4a5568",
    textAlign: "right",
  },
  collapseBtn: {
    background: "none",
    border: "none",
    padding: 0,
    fontSize: "1rem",
    fontWeight: 700,
    color: BLUE,
    cursor: "pointer",
    width: "100%",
    textAlign: "left",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    marginTop: "12px",
    fontSize: "0.85rem",
  },
  th: {
    textAlign: "left",
    padding: "6px 8px",
    borderBottom: `2px solid ${BORDER}`,
    color: TEAL,
    fontWeight: 700,
    textTransform: "uppercase",
    fontSize: "0.75rem",
    letterSpacing: "0.05em",
  },
  td: {
    padding: "6px 8px",
    borderBottom: `1px solid ${BORDER}`,
    color: BLUE,
  },
  footer: {
    padding: "16px",
    textAlign: "center",
  },
  resetBtn: {
    background: "none",
    border: `1px solid ${BORDER}`,
    borderRadius: "6px",
    padding: "10px 20px",
    fontSize: "0.85rem",
    color: "#6b7a8d",
    cursor: "pointer",
  },
};
