# Box Tracker

A mobile web app for hospital porters to track empty transport boxes at wards.

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # run unit tests
npm run build      # production build in dist/
```

## Deploy (HTTPS required for Web NFC)

**Vercel:**
```bash
npm i -g vercel
vercel --prod
```

**Netlify:**
```bash
npm i -g netlify-cli
netlify deploy --prod --dir dist
```

Web NFC works only on Android Chrome over HTTPS. On other browsers the "Scan box" button is hidden and the Simulate section is used instead.

---

## Assumptions and limitations

- **NFC simulates RFID.** The app uses the Web NFC API (tag serial number only). A production system would use fixed UHF RFID readers that know their own location and can read a whole trolley at once without manual location selection.
- **State is stored on one device only.** localStorage is not shared between devices. In a real deployment, boxes scanned on one phone are invisible to another phone; a backend would be required.
- **Locations are hard-coded constants.** Ward names and levels in `App.tsx` are demo placeholders — edit the `WARDS` array to match a real hospital layout.
- **No authentication.** Any porter using the device sees and can change all data.
- **Time display.** "Oldest waited" ticks in 1-minute increments; it is not a real-time counter.
