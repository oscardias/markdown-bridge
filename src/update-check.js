'use strict';

// Update check against GitHub Releases. Pure functions only: the network call and
// the dialogs live in main.js, so everything here is covered by the smoke test.
//
// The builds are unsigned, so a silent self-updater is not an option (macOS refuses
// to swap in an unsigned bundle). Instead the app compares versions and points the
// user at the release page to download the new installer.

const REPO = 'oscardias/markdown-bridge';
const LATEST_RELEASE_API = `https://api.github.com/repos/${REPO}/releases/latest`;
const RELEASES_PAGE = `https://github.com/${REPO}/releases/latest`;
/** Automatic checks run at most once per this interval. */
const AUTO_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** "v1.2.3-beta.1" → { core: [1, 2, 3], pre: "beta.1" }, or null if not a version. */
function parseVersion(input) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(
    String(input ?? '').trim()
  );
  if (!m) return null;
  return { core: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4] ?? null };
}

/** Semver ordering: -1, 0 or 1. A pre-release sorts before its release. Throws on junk. */
function compareVersions(a, b) {
  const va = parseVersion(a);
  const vb = parseVersion(b);
  if (!va || !vb) throw new Error(`Not a version: ${!va ? a : b}`);

  for (let i = 0; i < 3; i++) {
    if (va.core[i] !== vb.core[i]) return va.core[i] < vb.core[i] ? -1 : 1;
  }
  if (va.pre === vb.pre) return 0;
  if (va.pre === null) return 1;
  if (vb.pre === null) return -1;

  const pa = va.pre.split('.');
  const pb = vb.pre.split('.');
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if (pa[i] === undefined) return -1;
    if (pb[i] === undefined) return 1;
    const na = /^\d+$/.test(pa[i]);
    const nb = /^\d+$/.test(pb[i]);
    if (na && nb) {
      if (Number(pa[i]) !== Number(pb[i])) return Number(pa[i]) < Number(pb[i]) ? -1 : 1;
    } else if (na !== nb) {
      return na ? -1 : 1;
    } else if (pa[i] !== pb[i]) {
      return pa[i] < pb[i] ? -1 : 1;
    }
  }
  return 0;
}

/**
 * Turns the GitHub "latest release" payload into what the app needs, or null when it
 * is not a usable published release. The page URL is only trusted when it points back
 * at this repository on github.com — it is handed to shell.openExternal.
 */
function parseRelease(json) {
  if (!json || typeof json !== 'object' || json.draft || json.prerelease) return null;
  const version = parseVersion(json.tag_name);
  if (!version) return null;

  const prefix = `https://github.com/${REPO}/releases/`;
  const url =
    typeof json.html_url === 'string' && json.html_url.startsWith(prefix)
      ? json.html_url
      : RELEASES_PAGE;

  return {
    version: String(json.tag_name).trim().replace(/^v/, ''),
    url,
    notes: typeof json.body === 'string' ? json.body.trim() : '',
  };
}

/**
 * What to tell the user about `release` given the running version.
 * Returns 'update' | 'current' | 'skipped'. 'skipped' only applies to automatic checks:
 * a manual check always reports a newer version, even one the user chose to skip.
 */
function evaluateRelease(release, currentVersion, { skippedVersion = null, manual = false } = {}) {
  if (!release || compareVersions(release.version, currentVersion) <= 0) return 'current';
  if (!manual && skippedVersion && compareVersions(release.version, skippedVersion) === 0) {
    return 'skipped';
  }
  return 'update';
}

/** Whether the startup check should run now. Settings missing → defaults (enabled). */
function shouldAutoCheck(settings, now = Date.now()) {
  if (settings?.checkForUpdates === false) return false;
  const last = Number(settings?.lastUpdateCheck) || 0;
  return now - last >= AUTO_CHECK_INTERVAL_MS || now < last;
}

/** Release notes trimmed for a message box. */
function summarizeNotes(notes, maxLength = 600) {
  const text = String(notes ?? '').replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength).trimEnd()}…` : text;
}

module.exports = {
  REPO,
  LATEST_RELEASE_API,
  RELEASES_PAGE,
  AUTO_CHECK_INTERVAL_MS,
  parseVersion,
  compareVersions,
  parseRelease,
  evaluateRelease,
  shouldAutoCheck,
  summarizeNotes,
};
