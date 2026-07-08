// src/utils/oneDriveUrl.js
// Validates the per-item OneDrive link on a PR item.
//
// Every user in the ecosystem can see and click these links, so an unvalidated
// URL field is an open redirect with a trustworthy label on it. Restrict the host
// to Microsoft's share domains rather than accepting any URL.

const EXACT_HOSTS = new Set([
  "onedrive.live.com",
  "1drv.ms",
]);

// Tenant links look like contoso.sharepoint.com / contoso-my.sharepoint.com.
const isSharePointHost = (h) => h === "sharepoint.com" || h.endsWith(".sharepoint.com");

const MAX_LEN = 2000;

/**
 * @param   {string|null|undefined} raw
 * @returns {{ok: true, value: string|null} | {ok: false, error: string}}
 *          value is null when the field was left blank (the link is optional).
 */
function validateOneDriveUrl(raw) {
  const v = (raw ?? "").trim();
  if (!v) return { ok: true, value: null };

  if (v.length > MAX_LEN) {
    return { ok: false, error: `OneDrive link is too long (max ${MAX_LEN} characters)` };
  }

  let u;
  try { u = new URL(v); }
  catch { return { ok: false, error: "OneDrive link is not a valid URL" }; }

  if (u.protocol !== "https:") {
    return { ok: false, error: "OneDrive link must start with https://" };
  }

  const host = u.hostname.toLowerCase();
  if (!EXACT_HOSTS.has(host) && !isSharePointHost(host)) {
    return { ok: false, error: `"${u.hostname}" is not a OneDrive or SharePoint link` };
  }

  return { ok: true, value: v };
}

/** Validates the link on every item; returns the first error message, or null. */
function checkItemOneDriveUrls(items) {
  for (const it of items) {
    const r = validateOneDriveUrl(it.onedrive_url);
    if (!r.ok) {
      const label = (it.description || "").trim() || it.profile_code || "an item";
      return `${r.error} (on "${label}")`;
    }
  }
  return null;
}

module.exports = { validateOneDriveUrl, checkItemOneDriveUrls };
