/**
 * Shared "data updated" label for the Meta and Tournaments pages.
 * Reads data/updated.json (one timestamp for both datasets). If that field
 * is missing, uses the response Last-Modified header. Otherwise the label
 * stays hidden.
 *
 * The absolute time is the viewer's local time. Pass timeZone in tests.
 */
(function (root, factory) {
  "use strict";

  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.MTGUpdated = api;
  if (typeof document !== "undefined" && document.getElementById("last-updated")) {
    api.mount();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const ISO_STAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

  function readUpdatedAt(payload) {
    const value = payload && typeof payload.updatedAt === "string" ? payload.updatedAt.trim() : "";
    if (!ISO_STAMP.test(value)) return null;
    const time = Date.parse(value);
    if (Number.isNaN(time)) return null;
    return new Date(time).toISOString();
  }

  function parseHttpDate(value) {
    if (typeof value !== "string" || !value.trim()) return null;
    const time = Date.parse(value);
    if (Number.isNaN(time)) return null;
    return new Date(time).toISOString();
  }

  function chooseUpdatedAt(source) {
    const fromField = readUpdatedAt(source?.payload);
    if (fromField) return fromField;
    return parseHttpDate(source?.lastModified);
  }

  function formatAbsolute(date, timeZone) {
    const options = {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    };
    if (timeZone) options.timeZone = timeZone;
    return new Intl.DateTimeFormat("en-US", options)
      .format(date)
      .replace(/[\u202f\u00a0]/g, " ");
  }

  function relativeHint(thenMs, nowMs) {
    const delta = nowMs - thenMs;
    if (!Number.isFinite(delta) || delta < 0) return "";
    const seconds = Math.round(delta / 1000);
    if (seconds < 45) return "just now";
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return minutes === 1 ? "1 minute ago" : `${minutes} minutes ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
    const days = Math.round(hours / 24);
    if (days < 30) return days === 1 ? "1 day ago" : `${days} days ago`;
    const months = Math.round(days / 30);
    if (months < 12) return months === 1 ? "1 month ago" : `${months} months ago`;
    const years = Math.round(months / 12);
    return years === 1 ? "1 year ago" : `${years} years ago`;
  }

  function formatUpdatedLabel(iso, options) {
    const time = Date.parse(iso);
    if (Number.isNaN(time)) return "";
    const now = options?.now instanceof Date ? options.now : new Date();
    const absolute = formatAbsolute(new Date(time), options?.timeZone);
    if (!absolute) return "";
    const relative = relativeHint(time, now.getTime());
    return relative ? `Data updated ${absolute} · ${relative}` : `Data updated ${absolute}`;
  }

  function applyLabel(el, iso, options) {
    const label = iso ? formatUpdatedLabel(iso, options) : "";
    if (!label) {
      el.hidden = true;
      el.textContent = "";
      el.removeAttribute("datetime");
      return "";
    }
    el.textContent = label;
    el.dateTime = iso;
    el.hidden = false;
    return label;
  }

  async function loadUpdatedAt(fetchImpl, url) {
    const res = await fetchImpl(url || "data/updated.json", { cache: "no-store" });
    if (!res || !res.ok) return null;
    let payload = null;
    try {
      payload = await res.json();
    } catch {
      payload = null;
    }
    const header = typeof res.headers?.get === "function" ? res.headers.get("Last-Modified") : null;
    return chooseUpdatedAt({ payload, lastModified: header });
  }

  async function mount(options) {
    const doc = options?.document || (typeof document !== "undefined" ? document : null);
    const el = doc?.getElementById("last-updated");
    if (!el) return "";
    const fetchImpl = options?.fetch || (typeof fetch === "function" ? fetch : null);
    if (!fetchImpl) return applyLabel(el, null);
    try {
      const iso = await loadUpdatedAt(fetchImpl, options?.url);
      return applyLabel(el, iso, { now: options?.now, timeZone: options?.timeZone });
    } catch {
      return applyLabel(el, null);
    }
  }

  return {
    readUpdatedAt,
    parseHttpDate,
    chooseUpdatedAt,
    formatUpdatedLabel,
    relativeHint,
    loadUpdatedAt,
    applyLabel,
    mount,
  };
});
