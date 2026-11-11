/**
 * Shared trailing window for the Meta and Tournaments pages.
 * Presets are 7, 14, 30, and 90 days. A custom From/To range is tournaments-only;
 * Meta snaps it to the nearest preset by inclusive length.
 */
(function (root, factory) {
  "use strict";

  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.MTGWindow = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const PRESET_DAYS = [7, 14, 30, 90];
  const DEFAULT_DAYS = 30;
  const STORAGE_KEY = "mtg-meta-window-days";

  function validDate(value) {
    const text = String(value || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return "";
    const [year, month, day] = text.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
      return "";
    }
    return text;
  }

  function presetDays(value) {
    const days = Number(value);
    return PRESET_DAYS.includes(days) ? days : null;
  }

  function todayISO(now) {
    const date = now instanceof Date ? now : new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function shiftDate(iso, days) {
    const [year, month, day] = validDate(iso).split("-").map(Number);
    if (!year) return "";
    const date = new Date(Date.UTC(year, month - 1, day));
    date.setUTCDate(date.getUTCDate() + days);
    const nextYear = date.getUTCFullYear();
    const nextMonth = String(date.getUTCMonth() + 1).padStart(2, "0");
    const nextDay = String(date.getUTCDate()).padStart(2, "0");
    return `${nextYear}-${nextMonth}-${nextDay}`;
  }

  function inclusiveSpan(from, to) {
    const start = validDate(from);
    const end = validDate(to);
    if (!start || !end || start > end) return null;
    const startMs = Date.parse(`${start}T00:00:00Z`);
    const endMs = Date.parse(`${end}T00:00:00Z`);
    return Math.round((endMs - startMs) / 86400000) + 1;
  }

  function presetRange(days, today) {
    const end = validDate(today);
    const length = presetDays(days) || DEFAULT_DAYS;
    if (!end) return { from: "", to: "" };
    return { from: shiftDate(end, -(length - 1)), to: end };
  }

  function nearestPreset(from, to) {
    const span = inclusiveSpan(from, to);
    if (span == null) return DEFAULT_DAYS;
    let best = DEFAULT_DAYS;
    let bestDiff = Infinity;
    for (const days of PRESET_DAYS) {
      const diff = Math.abs(span - days);
      if (diff < bestDiff || (diff === bestDiff && days < best)) {
        best = days;
        bestDiff = diff;
      }
    }
    return best;
  }

  function pickerBounds(dates, today) {
    const end = validDate(today) || todayISO();
    const known = (dates || []).map(validDate).filter(Boolean).sort();
    const min = known[0] || end;
    const latest = known[known.length - 1] || end;
    const max = latest > end ? latest : end;
    return { min, max: max < min ? min : max };
  }

  function clampDate(iso, bounds) {
    const date = validDate(iso);
    if (!date) return "";
    if (bounds?.min && date < bounds.min) return bounds.min;
    if (bounds?.max && date > bounds.max) return bounds.max;
    return date;
  }

  function clampRange(from, to, bounds) {
    let start = clampDate(from, bounds);
    let end = clampDate(to, bounds);
    if (start && end && start > end) start = end;
    return { from: start, to: end };
  }

  function readStoredDays(storage) {
    if (!storage || typeof storage.getItem !== "function") return null;
    try {
      return presetDays(storage.getItem(STORAGE_KEY));
    } catch {
      return null;
    }
  }

  function writeStoredDays(storage, days) {
    const preset = presetDays(days);
    if (!preset || !storage || typeof storage.setItem !== "function") return;
    try {
      storage.setItem(STORAGE_KEY, String(preset));
    } catch {
      /* private mode or a full store */
    }
  }

  function resolveWindow(options) {
    const params = new URLSearchParams(options?.search || "");
    const fallback = presetDays(options?.defaultDays) || DEFAULT_DAYS;
    const explicit = params.has("days") || params.has("from") || params.has("to");
    const days = presetDays(params.get("days"));
    if (days) return { mode: "preset", days };
    const from = validDate(params.get("from"));
    const to = validDate(params.get("to"));
    if (from && to && from <= to) return { mode: "custom", from, to };
    if (explicit) return { mode: "preset", days: fallback };
    const stored = presetDays(options?.storedDays);
    if (stored) return { mode: "preset", days: stored };
    return { mode: "preset", days: fallback };
  }

  function metaDays(options) {
    const resolved = resolveWindow(options);
    if (resolved.mode === "custom") return nearestPreset(resolved.from, resolved.to);
    return resolved.days;
  }

  function activeRange(window, today) {
    if (window?.mode === "custom") {
      return { from: validDate(window.from), to: validDate(window.to) };
    }
    return presetRange(window?.days, today);
  }

  function emptyWindowMessage(window) {
    if (window?.mode === "custom" && window.from && window.to) {
      return `No events between ${window.from} and ${window.to}.`;
    }
    const days = presetDays(window?.days) || DEFAULT_DAYS;
    return `No events in the last ${days} days.`;
  }

  function decorateNav(doc, window) {
    if (!doc?.querySelector) return;
    const days = window?.mode === "custom" ? nearestPreset(window.from, window.to) : (presetDays(window?.days) || DEFAULT_DAYS);
    const meta = doc.querySelector('.site-nav a[href^="index.html"]');
    const tournaments = doc.querySelector('.site-nav a[href^="tournaments.html"]');
    if (meta) meta.setAttribute("href", `index.html?days=${days}`);
    if (!tournaments) return;
    const params = new URLSearchParams();
    if (window?.mode === "custom" && window.from && window.to) {
      params.set("from", window.from);
      params.set("to", window.to);
    } else {
      params.set("days", String(presetDays(window?.days) || days));
    }
    if (window?.format) params.set("format", window.format);
    if (window?.type) params.set("type", window.type);
    if (window?.event) params.set("event", window.event);
    if (window?.fixture) params.set("fixture", "bracket");
    tournaments.setAttribute("href", `tournaments.html?${params.toString()}`);
  }

  return {
    PRESET_DAYS,
    DEFAULT_DAYS,
    STORAGE_KEY,
    validDate,
    presetDays,
    todayISO,
    shiftDate,
    inclusiveSpan,
    presetRange,
    nearestPreset,
    pickerBounds,
    clampDate,
    clampRange,
    readStoredDays,
    writeStoredDays,
    resolveWindow,
    metaDays,
    activeRange,
    emptyWindowMessage,
    decorateNav,
  };
});
