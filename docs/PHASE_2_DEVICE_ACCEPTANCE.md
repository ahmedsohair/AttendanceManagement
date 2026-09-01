# Phase 2 Scanner Device Acceptance

Use the staging scanner at `https://exampulse-stagings.vercel.app/scan` with synthetic code `AMS-T001-0001`. Do not use production data.

Run this once on a representative Android phone and once on an iPhone:

1. Sign in, confirm the assigned rooms load, and open a room.
2. Allow OCR to initialize; confirm manual entry remains usable if OCR is retried or unavailable.
3. Scan or manually look up a synthetic student (`9000001` through `9001000`).
4. From the review state, use the phone/browser Back action; confirm review closes and scanning resumes.
5. From the camera state, use Back; confirm the camera stops and room selection appears without returning to login.
6. Reopen the room, background the browser for ten seconds, then return; confirm scanning resumes or a clear Restart Camera action appears.
7. Complete at least ten consecutive lookups and confirm the camera, OCR status, and controls remain responsive.
8. Lock and unlock the phone while the scanner is open; confirm recovery remains possible without a blank page.

Record `Pass` or the exact failed step:

| Browser | Result | Notes |
| --- | --- | --- |
| Android Chrome or Samsung Internet | Pending | |
| iPhone Safari | Pending | |

Phase 3 must remain inactive until both rows pass or an explicit exception is documented.
