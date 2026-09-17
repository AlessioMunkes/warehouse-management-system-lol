// ─────────────────────────────────────────────────────────────
// client/src/lib/clipboard.js
//
// navigator.clipboard is unavailable on a non-HTTPS/non-localhost
// origin — the same LAN-tablet case api.js's newIdempotencyKey
// comment documents for crypto.randomUUID. Falls back to the
// hidden-textarea + execCommand trick, which works everywhere the
// async API doesn't.
// ─────────────────────────────────────────────────────────────
export const copyToClipboard = async (text) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }
  const el = document.createElement('textarea');
  el.value = text;
  el.style.position = 'fixed';
  el.style.opacity = '0';
  document.body.appendChild(el);
  el.select();
  const ok = document.execCommand('copy');
  document.body.removeChild(el);
  return ok;
};
