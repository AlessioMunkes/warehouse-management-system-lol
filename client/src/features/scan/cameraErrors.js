// ─────────────────────────────────────────────────────────────
// client/src/features/scan/cameraErrors.js
//
// What went wrong starting the camera, from whatever the browser or the
// scanner library threw. The library throws Errors, DOMExceptions and
// plain strings, so this reads all of them as text.
//
//   'denied'    the person (or the browser's settings) refused the camera
//   'noCamera'  there is no camera to use
//   'failed'    anything else: an insecure page, a camera in use elsewhere,
//               a browser that cannot start it
// ─────────────────────────────────────────────────────────────
export const classifyCameraError = (err) => {
  const text = `${err?.name ?? ''} ${err?.message ?? ''} ${typeof err === 'string' ? err : ''}`.toLowerCase();
  if (/notallowed|permission|denied|dismissed/.test(text)) return 'denied';
  if (/notfound|no camera|requested device not found|devicesnotfound|overconstrained|no cameras/.test(text)) return 'noCamera';
  return 'failed';
};
