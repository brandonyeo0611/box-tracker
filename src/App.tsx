import { useState, useEffect, useCallback } from "react";
import { scan } from "./stateMachine";
import type { Box, BoxState } from "./stateMachine";
import { isNFCSupported, startScan } from "./scanner";

// ─── constants ───────────────────────────────────────────────────────────────

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

function seedBoxes(): Box[] {
  return Array.from({ length: 10 }, (_, i) => ({
    id: `BOX-${String(i + 1).padStart(2, "0")}`,
    state: "AT_BLOOD_BANK" as BoxState,
    location: BLOOD_BANK,
    deliveredAt: null,
  }));
}

// ─── localStorage helpers ────────────────────────────────────────────────────

function loadBoxes(): Box[] {
  try {
    const raw = localStorage.getItem("boxes");
    if (raw) return JSON.parse(raw) as Box[];
  } catch (_) { /* ignore */ }
  return seedBoxes();
}

function saveBoxes(boxes: Box[]) {
  try { localStorage.setItem("boxes", JSON.stringify(boxes)); } catch (_) { /* ignore */ }
}

function loadTagMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem("tagMap");
    if (raw) return JSON.parse(raw) as Record<string, string>;
  } catch (_) { /* ignore */ }
  return {};
}

function saveTagMap(m: Record<string, string>) {
  try { localStorage.setItem("tagMap", JSON.stringify(m)); } catch (_) { /* ignore */ }
}

function loadLocation(): string {
  try {
    const v = localStorage.getItem("location");
    if (v && ALL_LOCATIONS.includes(v)) return v;
  } catch (_) { /* ignore */ }
  return BLOOD_BANK;
}

function saveLocation(loc: string) {
  try { localStorage.setItem("location", loc); } catch (_) { /* ignore */ }
}

// ─── time formatting ─────────────────────────────────────────────────────────

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
    case "AT_BLOOD_BANK": return "At Blood Bank";
    case "AT_WARD": return "At Ward";
    case "IN_TRANSIT_BACK": return "In Transit";
  }
}

// ─── App ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [boxes, setBoxes] = useState<Box[]>(loadBoxes);
  const [tagMap, setTagMap] = useState<Record<string, string>>(loadTagMap);
  const [location, setLocation] = useState<string>(loadLocation);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [, setNow] = useState(Date.now());

  const [allOpen, setAllOpen] = useState(false);
  const [expandedWard, setExpandedWard] = useState<string | null>(null);
  const [filterState, setFilterState] = useState<BoxState | "">("");
  const [filterLocation, setFilterLocation] = useState("");
  const [simOpen, setSimOpen] = useState(false);
  const [simBoxId, setSimBoxId] = useState("BOX-01");

  const nfcAvailable = isNFCSupported();
  const [pendingSerial, setPendingSerial] = useState<string | null>(null);
  const [pendingBoxId, setPendingBoxId] = useState("BOX-01");
  const [scanning, setScanning] = useState(false);
  const [nfcError, setNfcError] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => { saveBoxes(boxes); }, [boxes]);
  useEffect(() => { saveTagMap(tagMap); }, [tagMap]);
  useEffect(() => { saveLocation(location); }, [location]);

  const applyBoxScan = useCallback(
    (boxId: string) => {
      setBoxes((prev) => {
        const box = prev.find((b) => b.id === boxId);
        if (!box) {
          setResult({ ok: false, message: `Unknown box: ${boxId}` });
          return prev;
        }
        const res = scan(box, location, Date.now());
        setResult({ ok: res.ok, message: res.message });
        return prev.map((b) => (b.id === boxId ? res.box : b));
      });
    },
    [location]
  );

  const handleScanButton = async () => {
    if (!nfcAvailable) return;
    setScanning(true);
    try {
      await startScan((serial) => {
        setScanning(false);
        const mapped = tagMap[serial];
        if (mapped) {
          applyBoxScan(mapped);
        } else {
          setPendingSerial(serial);
          setPendingBoxId("BOX-01");
        }
      });
    } catch (_) {
      setScanning(false);
      setNfcError(true);
    }
  };

  const confirmTagMapping = () => {
    if (!pendingSerial) return;
    const updated = { ...tagMap, [pendingSerial]: pendingBoxId };
    setTagMap(updated);
    applyBoxScan(pendingBoxId);
    setPendingSerial(null);
  };

  const handleSimulate = () => {
    applyBoxScan(simBoxId);
  };

  const handleReset = () => {
    const fresh = seedBoxes();
    setBoxes(fresh);
    setResult(null);
    setTagMap({});
    setPendingSerial(null);
    setLocation(BLOOD_BANK);
    setFilterState("");
    setFilterLocation("");
    setAllOpen(false);
    setSimOpen(false);
    setExpandedWard(null);
    try {
      localStorage.removeItem("boxes");
      localStorage.removeItem("tagMap");
      localStorage.removeItem("location");
    } catch (_) { /* ignore */ }
  };

  // round list
  const wardBoxes = boxes.filter((b) => b.state === "AT_WARD");
  const roundMap = new Map<number, Map<string, Box[]>>();
  for (const b of wardBoxes) {
    const lvl = levelOf(b.location);
    if (lvl === null) continue;
    if (!roundMap.has(lvl)) roundMap.set(lvl, new Map());
    const wardMap = roundMap.get(lvl)!;
    if (!wardMap.has(b.location)) wardMap.set(b.location, []);
    wardMap.get(b.location)!.push(b);
  }
  const sortedLevels = Array.from(roundMap.keys()).sort((a, b) => a - b);

  return (
    <div style={S.page}>
      <header style={S.header}>
        <h1 style={S.title}>Box Tracker</h1>
      </header>

      <main style={S.main}>
        {/* 1. Location */}
        <section style={S.card}>
          <label htmlFor="location-select" style={S.label}>
            Your current location
          </label>
          <select
            id="location-select"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
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
          {nfcAvailable && !nfcError ? (
            <button
              style={{ ...S.scanBtn, opacity: scanning ? 0.6 : 1 }}
              onClick={handleScanButton}
              disabled={scanning}
            >
              {scanning ? "Scanning…" : "Scan box"}
            </button>
          ) : (
            <p style={S.nfcNote}>NFC not supported. Use Simulate below.</p>
          )}

          {pendingSerial && (
            <div style={S.unknownTag}>
              <p style={S.unknownTagLabel}>
                Unknown tag <code>{pendingSerial}</code>. Which box is this?
              </p>
              <div style={S.row}>
                <select
                  value={pendingBoxId}
                  onChange={(e) => setPendingBoxId(e.target.value)}
                  style={{ ...S.select, flex: 1 }}
                >
                  {boxes.map((b) => (
                    <option key={b.id} value={b.id}>{b.id}</option>
                  ))}
                </select>
                <button style={S.confirmBtn} onClick={confirmTagMapping}>
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

        {/* 3. Round list */}
        <section style={S.card}>
          <h2 style={S.sectionTitle}>Empty boxes waiting</h2>
          {sortedLevels.length === 0 ? (
            <p style={S.emptyState}>No empty boxes waiting.</p>
          ) : (
            sortedLevels.map((lvl) => {
              const wardMap = roundMap.get(lvl)!;
              return (
                <div key={lvl}>
                  <p style={S.levelHeading}>Level {lvl}</p>
                  {Array.from(wardMap.entries()).map(([ward, bxs]) => {
                    const oldest = bxs.reduce(
                      (min, b) => (b.deliveredAt !== null && b.deliveredAt < min ? b.deliveredAt : min),
                      Infinity
                    );
                    const age = oldest < Infinity ? formatAge(Date.now() - oldest) : "—";
                    const count = bxs.length;
                    const isOpen = expandedWard === ward;
                    return (
                      <div key={ward}>
                        <button
                          style={S.wardRowBtn}
                          onClick={() => setExpandedWard(isOpen ? null : ward)}
                        >
                          <span style={S.wardName}>{ward}</span>
                          <span style={S.wardDetail}>
                            {count} empty {count === 1 ? "box" : "boxes"} · oldest {age}
                            <span style={S.chevron}>{isOpen ? " ▾" : " ▸"}</span>
                          </span>
                        </button>
                        {isOpen && (
                          <div style={S.boxChips}>
                            {bxs.map((b) => (
                              <span key={b.id} style={S.chip}>{b.id}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })
          )}
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
                    <option value="AT_BLOOD_BANK">At Blood Bank</option>
                    <option value="AT_WARD">At Ward</option>
                    <option value="IN_TRANSIT_BACK">In Transit</option>
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
                          <td style={S.td}>{stateLabel(b.state)}</td>
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
                <button style={S.confirmBtn} onClick={handleSimulate}>
                  Scan
                </button>
              </div>
            </div>
          )}
        </section>
      </main>

      <footer style={S.footer}>
        <button style={S.resetBtn} onClick={handleReset}>
          Reset everything
        </button>
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
