# Project Customization Rules: Alamnagar CHC

## 1. Webpage Icon / Favicon Configuration
- The main logo is `alchc-logo.png` (large format).
- The web browser favicon is `favicon.png` (35KB optimized round icon) located in the `public/` directory. Keep it linked in all HTML heads (`<link rel="icon" type="image/png" href="favicon.png">`).

## 2. Prescription Print Layout & Mobile Compatibility
- **Do not modify the print layout structures** unless explicitly requested by the user.
- **Hidden Iframe Print Isolation**: For all standard web browsers (desktop and mobile Chrome/Safari), use a hidden `<iframe>` to isolate and print prescriptions cleanly (defined in `admin.js` and `patient-portal.js`). Do NOT use `window.open('', '_blank')` as mobile pop-up blockers block it, and mobile Chrome fails to render dynamic popups.
- **Absolute Page-Bottom Footer**: The printed document is styled as a flex-column layout with `min-height: 262mm` (A4 printable area safe-height). The digital footer is pushed to the absolute bottom of the paper via `margin-top: auto` and contains:
  - A dashed border divider line.
  - Clear instructions with the exact secure digital share link (`/share.html?id=<appointmentId>`).
  - A scanable QR code generated via a dynamic secure API that redirects phone cameras to the patient share link.
- **Doctor Signature**: The doctor signature area must remain right-aligned in its own main footer block (`.print-footer-section`), positioned above the absolute bottom digital footer.

## 3. Webview Cache-Busting
- Always append a cache-busting timestamp `?t=${Date.now()}` to GET requests fetching medical reports or prescriptions in `patient-portal.js` to prevent Android Chrome/WebView from recalling cached database records.
