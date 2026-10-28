# Box Tracker

A simple checkpoint demo for empty transport boxes. Phones act as NFC checkpoint readers; a laptop displays the collection list. No pickup scans or action menus.

## Run locally

Requires Node.js 24 or newer (uses built-in SQLite and TypeScript support).

```sh
npm install
npm run dev
```

Open http://localhost:5173 on the laptop for the dashboard. Open http://localhost:5173/?view=checkpoint for the reader view.

Both views connect to the same Node server. Box locations and tag mappings are stored in `data/boxes.sqlite` on that server, and survive restarts. The dashboard refreshes about every 1.5 seconds and displays a warning if it cannot connect. There is no browser-local fallback that could silently diverge between devices. Existing browser-only demo data is not imported; the shared demo starts with BOX-01 through BOX-10 at Blood Bank.

## Phone connection and NFC

Use a compatible NFC-capable Android phone/browser with NFC enabled. Real Web NFC requires HTTPS (a laptop LAN HTTP address is sufficient for manual demo input, but not phone NFC).

For a phone NFC demonstration, run the app on the laptop and expose port 5173 through a trusted HTTPS reverse proxy or tunnel. If you already use Cloudflare Tunnel, for example:

```sh
cloudflared tunnel --url http://localhost:5173
```

Use the generated HTTPS address on **both** devices; append `/?view=checkpoint` on the phone. The tunnel is a separately installed tool, not a project dependency. The laptop and server must remain running. With a trusted local HTTPS reverse proxy, point it at port 5173 and open its HTTPS address instead.

A production build avoids development-server tunnel hostname restrictions:

```sh
npm run build
npm start
```

`npm start` serves both the built website and its API on port 5173. A static-only Vercel/Netlify deployment does **not** run this database server. `PORT` and `DATA_DIR` may be configured through environment variables. Run one server instance with persistent storage for this prototype.

## Set up the demo once

The tracking page retains the original prototype: **Empty boxes waiting**, grouped by level with ward counts, oldest waiting time and expandable box IDs; and **All boxes**, with the original state/location filters and table.

The reader page contains the original **Your current location**, **Scan box**, and **No NFC? Simulate** controls. It uses the same original colours, sizing and card styles.

1. Open `/?view=checkpoint` on the phone and choose **Your current location**.
2. Press **Scan box**, allow NFC permission, and hold a tag near the phone. Scanning stays active until **Stop scanning** is pressed.
3. For an unknown tag, scanning stops and the original **Which box is this?** prompt appears. Choose the box and press **Confirm**. This saves the shared tag mapping and records the box at the selected location.
4. Press **Scan box** again to continue. Known tags update locations automatically. Stop scanning before changing location.
5. **Reset everything** is on the reader page only. It asks for confirmation, then resets the shared boxes and tag mappings on every device.

The current adapter uses the tag serial identity, matching the original prototype. Tags without an exposed identity show an error rather than being merged together. Physical tag/device compatibility still needs testing; NDEF text parsing and tag writing are not included. Keep the reader page visible and the phone awake. Present tags individually; this is not bulk RFID reading. Cardboard must not prevent close contact with the phone's NFC antenna.

## Demonstrate

1. Set the phone to **Ward A**. Scan BOX-01 and BOX-02: the laptop shows Ward A with two boxes.
2. Re-read BOX-01: it remains at Ward A, with its original arrival time. It is never treated as a pickup.
3. Collect boxes physically without scanning. They remain listed at their last ward until returned.
4. Set the phone to **Blood Bank**, or use a second phone permanently set there. Scan BOX-01: Ward A now has one box; BOX-01 is available at Blood Bank.
5. With one phone, stop scanning and change its location between scenes. Two phones can stay at their respective checkpoints.

Without NFC, use **No NFC? Simulate → Box → Scan**. This changes the same shared database and is clearly labelled as simulation. Unknown physical tags show the original box-assignment prompt.

## Checks

```sh
npm test
npm run test:http
npm run build
npm run lint
```

Prototype only: synthetic boxes/wards, no patient data. There is no sign-in; anyone who can access the server can update demo data. Expose a tunnel only during a controlled demo and close it afterwards. There are no collection-round controls or pickup scans. Reset and scanning controls live on the reader page, separate from tracking.
