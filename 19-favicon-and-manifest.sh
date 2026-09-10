#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# 19-favicon-and-manifest.sh
#
# The favicon was never deleted. Commit ba3f2f8 ("Landing page
# iteration 1") MOVED it:
#
#   R100  client/public/favicon.svg -> client/public/icons/favicon.svg
#
# R100 is a pure rename, so the file is intact at
# client/public/icons/favicon.svg. What the move left behind is three
# references to the old path, all of which now 404:
#
#   index.html      <link rel="icon" href="/favicon.svg">
#   vite.config.js  includeAssets: ['./favicon.svg']
#   vite.config.js  manifest.icons[].src: './favicon.svg'
#
# The last build proves it — dist/manifest.webmanifest still says
# "src":"./favicon.svg" and there is no favicon.svg at the root of
# dist/. Nothing failed loudly because a missing icon is a 404 the
# browser swallows.
#
# The references are updated rather than the file moved back: it sits
# in icons/ deliberately, alongside every other SVG the app serves.
#
# ALSO IN HERE, because they are the same two files and the same
# oversight:
#
#   - The PWA manifest name and short_name were the repo slug,
#     "warehouse-management-system-lol". That is what an installed
#     shortcut would have been called on someone's home screen.
#   - <title> was the same slug. It is the text next to the favicon.
#   - index.html loaded the Tabler icon webfont TWICE, from two
#     different URLs. The glyphs are real (StaffTabBar.jsx uses
#     `ti ti-truck-delivery` and friends), but one of the two links
#     omits /dist/ and does not match the package layout. One stays.
#
# Idempotent. Aborts without writing if the source has drifted.
# ─────────────────────────────────────────────────────────────
set -euo pipefail

if [ ! -f client/index.html ] || [ ! -f client/vite.config.js ]; then
  echo "ERROR: run this from the repository root (the folder containing client/ and server/)." >&2
  exit 1
fi

if [ ! -f client/public/icons/favicon.svg ]; then
  echo "ERROR: client/public/icons/favicon.svg is missing." >&2
  echo "This script repoints references at that file; it cannot create it." >&2
  echo "Recover it with: git checkout ba3f2f8 -- client/public/icons/favicon.svg" >&2
  exit 1
fi

python3 - <<'PYEOF'
import os, sys

CHANGES = 0
FAILED  = []

def _read(p):
    with open(p, 'rb') as f:
        b = f.read()
    return b.decode('utf-8').replace('\r\n', '\n'), (b'\r\n' in b)

def _write(p, s, crlf):
    with open(p, 'wb') as f:
        f.write((s.replace('\n', '\r\n') if crlf else s).encode('utf-8'))

def patch(path, old, new, label):
    global CHANGES
    if not os.path.exists(path):
        FAILED.append("%s: file not found (%s)" % (label, path)); return
    s, crlf = _read(path)
    if new in s:
        print("  = %s (already applied)" % label); return
    if old not in s:
        FAILED.append("%s: anchor not found in %s" % (label, path)); return
    n = s.count(old)
    if n != 1:
        FAILED.append("%s: anchor appears %d times in %s (expected 1)" % (label, n, path)); return
    _write(path, s.replace(old, new, 1), crlf)
    CHANGES += 1
    print("  + %s" % label)

INDEX = 'client/index.html'
VITE  = 'client/vite.config.js'

# ══════════════════════════════════════════════════════════════
print("1  index.html")
# ══════════════════════════════════════════════════════════════

# One head rewrite rather than three patches: the duplicate stylesheet
# link makes two of the lines non-unique enough to anchor on
# separately, and the whole block is eight lines.
patch(INDEX,
"""    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/tabler-icons.min.css" />
    
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/dist/tabler-icons.min.css" />
    <title>warehouse-management-system-lol</title>""",
"""    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />

    <!-- /icons/favicon.svg, not /favicon.svg. Commit ba3f2f8 moved the
         file into public/icons/ and this link kept pointing at the old
         path, so the tab icon 404'd silently from then on. -->
    <link rel="icon" type="image/svg+xml" href="/icons/favicon.svg" />

    <!-- Tabler icon webfont. StaffTabBar.jsx renders `ti ti-home`,
         `ti ti-truck-delivery` and friends, so this is load-bearing.
         There were two of these, and the other one omitted /dist/ —
         a second CDN round trip for a path the package does not
         publish. Worth pinning a version instead of @latest at some
         point: a CDN tag that moves under you is a dependency you
         did not agree to. -->
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/dist/tabler-icons.min.css" />

    <title>Ladles of Love — Warehouse Management</title>""",
"index.html: favicon path, one icon font, a real title")

# ══════════════════════════════════════════════════════════════
print("2  vite.config.js")
# ══════════════════════════════════════════════════════════════

patch(VITE,
"""let faviconURL = './favicon.svg'""",
"""// Two forms of the same file, because the two consumers want
// different things:
//   FAVICON_ASSET — a path relative to publicDir, for the workbox
//                   glob in includeAssets.
//   FAVICON_URL   — a root-absolute URL, for manifest icon src, which
//                   the browser resolves against the site root rather
//                   than against the manifest's own location.
// Both point into icons/ because that is where ba3f2f8 put the file.
const FAVICON_ASSET = 'icons/favicon.svg'
const FAVICON_URL   = '/icons/favicon.svg'""",
"vite.config.js: point the favicon at icons/")

patch(VITE,
"""      includeAssets: [faviconURL],
      manifest: {
        theme_color: '#7A1A1A',                 // updated to match your brand
        icons: [
          { src: faviconURL, sizes: '512x512', type: 'image/svg+xml', purpose: 'any maskable' },
          { src: faviconURL, sizes: '192x192',  type: 'image/svg+xml' }
        ]
      }""",
"""      includeAssets: [FAVICON_ASSET],
      manifest: {
        // name and short_name were both the repo slug, so an installed
        // shortcut would have read "warehouse-management-system-lol"
        // on someone's home screen. short_name is what a launcher
        // shows under the icon, where there is room for about twelve
        // characters.
        name: 'Ladles of Love Warehouse Management',
        short_name: 'LoL WMS',
        description: 'Stock, receiving, packing and dispatch for the Ladles of Love warehouse.',
        theme_color: '#7A1A1A',                 // updated to match your brand
        icons: [
          { src: FAVICON_URL, sizes: '512x512', type: 'image/svg+xml', purpose: 'any maskable' },
          { src: FAVICON_URL, sizes: '192x192', type: 'image/svg+xml' }
        ]
      }""",
"vite.config.js: manifest name, short_name and icon src")

# ── Report ────────────────────────────────────────────────────
print("")
if FAILED:
    print("ABORTED — the failures below were not applied:")
    for f in FAILED:
        print("  ! %s" % f)
    print("")
    print("%d change(s) applied before the failure." % CHANGES)
    sys.exit(1)

print("%d change(s) applied." % CHANGES)
PYEOF

echo ""
echo "─────────────────────────────────────────────────────────────"
echo "Script 19 done. No migration."
echo ""
echo "Rebuild and check what the manifest now says:"
echo ""
echo "  cd client && npm run build"
echo "  cat dist/manifest.webmanifest"
echo ""
echo "Expect \"src\":\"/icons/favicon.svg\" and a real name/short_name."
echo ""
echo "The tab icon is cached hard by browsers. If it still looks empty"
echo "after a rebuild, hard-reload (Ctrl+Shift+R) or open the site in a"
echo "private window — the 404 gets cached too."
echo "─────────────────────────────────────────────────────────────"