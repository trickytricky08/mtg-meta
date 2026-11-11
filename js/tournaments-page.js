/**
 * Tournaments page controller. Reads data/tournaments.json on each load.
 * ?format= selects the tab. ?days= or ?from=&to= selects the window.
 * ?fixture=bracket mixes in
 * tests/fixtures/bracket-event.json so the bracket drawer can be checked.
 * That fixture is not part of the weekly data file.
 */
(() => {
  "use strict";

  const T = globalThis.MTGTournaments;
  const W = globalThis.MTGWindow;
  if (!T || !W) return;

  const els = {
    stamp: document.getElementById("meta-stamp"),
    formatBar: document.getElementById("format-bar"),
    formatDesc: document.getElementById("format-desc"),
    window: document.getElementById("window"),
    custom: document.getElementById("custom-range"),
    from: document.getElementById("date-from"),
    to: document.getElementById("date-to"),
    type: document.getElementById("event-type"),
    count: document.getElementById("result-count"),
    table: document.getElementById("events-table"),
    tbody: document.getElementById("event-body"),
    tableWrap: document.getElementById("table-wrap"),
    fixtureNote: document.getElementById("fixture-note"),
    root: document.getElementById("drawer-root"),
    backdrop: document.getElementById("drawer-backdrop"),
    drawer: document.getElementById("drawer"),
  };

  const state = {
    events: [],
    formatId: "standard",
    type: "",
    mode: "preset",
    days: W.DEFAULT_DAYS,
    from: "",
    to: "",
    bounds: null,
    openId: null,
    fixture: false,
  };

  function readQuery() {
    const params = new URLSearchParams(location.search);
    state.formatId = T.normalizeFormat(params.get("format"));
    state.type = params.get("type") || "";
    state.openId = params.get("event") || null;
    state.fixture = params.get("fixture") === "bracket";
    if (state.events.length || state.bounds) {
      applyResolvedWindow(W.resolveWindow({
        search: location.search,
        storedDays: W.readStoredDays(localStorage),
      }));
    }
  }

  function applyResolvedWindow(resolved) {
    const today = W.todayISO();
    const realDates = state.events.filter((event) => !event.devFixture).map((event) => event.date);
    state.bounds = W.pickerBounds(realDates, today);
    if (resolved.mode === "custom") {
      const range = W.clampRange(resolved.from, resolved.to, state.bounds);
      if (!range.from || !range.to || range.from > range.to) {
        state.mode = "preset";
        state.days = W.DEFAULT_DAYS;
        const preset = W.presetRange(state.days, today);
        state.from = preset.from;
        state.to = preset.to;
        W.writeStoredDays(localStorage, state.days);
        return;
      }
      state.mode = "custom";
      state.from = range.from;
      state.to = range.to;
      state.days = W.nearestPreset(range.from, range.to);
      return;
    }
    state.mode = "preset";
    state.days = resolved.days;
    const preset = W.presetRange(state.days, today);
    state.from = preset.from;
    state.to = preset.to;
    W.writeStoredDays(localStorage, state.days);
  }

  function writeQuery() {
    const params = new URLSearchParams();
    params.set("format", state.formatId);
    if (state.type) params.set("type", state.type);
    if (state.mode === "custom") {
      params.set("from", state.from);
      params.set("to", state.to);
    } else {
      params.set("days", String(state.days));
    }
    if (state.openId) params.set("event", state.openId);
    if (state.fixture) params.set("fixture", "bracket");
    const next = `${location.pathname}?${params.toString()}`;
    if (`${location.pathname}${location.search}` !== next) {
      history.replaceState(null, "", next);
    }
    W.decorateNav(document, {
      mode: state.mode,
      days: state.days,
      from: state.from,
      to: state.to,
      format: state.formatId,
      type: state.type,
      event: state.openId,
      fixture: state.fixture,
    });
  }

  async function init() {
    readQuery();
    let file = null;
    try {
      const res = await fetch("data/tournaments.json");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      file = await res.json();
    } catch (err) {
      if (els.tableWrap) {
        els.tableWrap.innerHTML =
          `<div class="empty">Could not load <code>data/tournaments.json</code>. ` +
          `Serve this folder over HTTP (see README). <br><small>${T.escapeHtml(String(err))}</small></div>`;
      }
      return;
    }

    state.events = Array.isArray(file.events) ? file.events.slice() : [];
    if (els.stamp) els.stamp.textContent = "MTGGoldfish tournaments";

    if (state.fixture) await loadFixture();
    applyResolvedWindow(W.resolveWindow({
      search: location.search,
      storedDays: W.readStoredDays(localStorage),
    }));
    bind();
    render();
    if (state.openId) openDrawer(state.openId, { skipFocus: false, fromQuery: true });
  }

  async function loadFixture() {
    try {
      const res = await fetch("tests/fixtures/bracket-event.json");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const fixture = await res.json();
      const extra = Array.isArray(fixture) ? fixture : [fixture];
      const ids = new Set(state.events.map((event) => String(event.id)));
      for (const event of extra) {
        if (!event || ids.has(String(event.id))) continue;
        state.events.push(event);
      }
      if (els.fixtureNote) els.fixtureNote.hidden = false;
    } catch (err) {
      if (els.fixtureNote) {
        els.fixtureNote.hidden = false;
        els.fixtureNote.textContent = `Could not load the bracket fixture. ${err}`;
      }
    }
  }

  function bind() {
    els.formatBar.addEventListener("click", (event) => {
      const button = event.target.closest("[data-format]");
      if (!button || button.dataset.format === state.formatId) return;
      state.formatId = button.dataset.format;
      closeDrawer({ keepFocus: true });
      render();
    });

    els.type.addEventListener("change", () => {
      state.type = els.type.value;
      render();
    });

    els.window.addEventListener("change", () => {
      if (els.window.value === "custom") {
        if (state.mode !== "custom") {
          const today = W.todayISO();
          const preset = W.presetRange(state.days, today);
          const range = W.clampRange(preset.from, preset.to, state.bounds);
          state.from = range.from;
          state.to = range.to;
        }
        state.mode = "custom";
      } else {
        state.mode = "preset";
        state.days = W.presetDays(els.window.value) || W.DEFAULT_DAYS;
        const preset = W.presetRange(state.days, W.todayISO());
        state.from = preset.from;
        state.to = preset.to;
        W.writeStoredDays(localStorage, state.days);
      }
      render();
    });

    els.from.addEventListener("change", () => {
      state.mode = "custom";
      state.from = W.clampDate(els.from.value, state.bounds);
      if (state.from && state.to && state.from > state.to) state.to = state.from;
      render();
    });

    els.to.addEventListener("change", () => {
      state.mode = "custom";
      state.to = W.clampDate(els.to.value, state.bounds);
      if (state.from && state.to && state.from > state.to) state.from = state.to;
      render();
    });

    els.tbody.addEventListener("click", (event) => {
      const row = event.target.closest("[data-event-id]");
      if (!row) return;
      openDrawer(row.dataset.eventId);
    });

    els.tbody.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const row = event.target.closest("[data-event-id]");
      if (!row || event.target !== row) return;
      event.preventDefault();
      openDrawer(row.dataset.eventId);
    });

    els.backdrop.addEventListener("click", () => closeDrawer());
    document.addEventListener("keydown", onKeydown);
    window.addEventListener("popstate", () => {
      readQuery();
      render();
      if (state.openId) openDrawer(state.openId, { fromQuery: true });
      else closeDrawer({ keepFocus: true, skipQuery: true });
    });
  }

  function onKeydown(event) {
    if (!state.openId) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeDrawer();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [...els.drawer.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')]
      .filter((node) => !node.hasAttribute("hidden"));
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function visibleEvents() {
    const inFormat = state.events.filter(
      (event) => String(event.format || "").toLowerCase() === state.formatId
    );
    const types = T.eventTypesIn(inFormat);
    state.type = T.normalizeType(state.type, types);
    return {
      types,
      rows: T.listEvents(state.events, {
        format: state.formatId,
        type: state.type,
        from: state.from,
        to: state.to,
      }),
    };
  }

  function render() {
    const { types, rows } = visibleEvents();
    renderFormats();
    renderTypeOptions(types);
    if (els.window) els.window.value = state.mode === "custom" ? "custom" : String(state.days);
    if (els.custom) els.custom.hidden = state.mode !== "custom";
    if (els.from && els.to) {
      if (state.bounds) {
        els.from.min = state.bounds.min;
        els.from.max = state.to || state.bounds.max;
        els.to.min = state.from || state.bounds.min;
        els.to.max = state.bounds.max;
      }
      els.from.value = state.mode === "custom" ? state.from : "";
      els.to.value = state.mode === "custom" ? state.to : "";
    }
    const format = T.FORMATS.find((entry) => entry.id === state.formatId);
    if (els.formatDesc) {
      els.formatDesc.textContent = format
        ? `Recent ${format.name} events from MTGGoldfish, newest first. Open a row for the top 8.`
        : "";
    }
    const showPlayers = rows.some((event) => T.knownPlayerCount(event) != null);
    if (els.table) els.table.classList.toggle("hide-players", !showPlayers);
    const windowState = state.mode === "custom"
      ? { mode: "custom", from: state.from, to: state.to }
      : { mode: "preset", days: state.days };
    if (els.count) {
      els.count.hidden = rows.length === 0;
      els.count.textContent = rows.length
        ? `${rows.length} event${rows.length === 1 ? "" : "s"}`
        : "";
    }
    if (els.tbody) {
      els.tbody.innerHTML = T.renderEventRows(rows, state.openId, W.emptyWindowMessage(windowState));
    }
    writeQuery();
  }

  function renderFormats() {
    els.formatBar.innerHTML = "";
    for (const fmt of T.FORMATS) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "format-btn" + (fmt.id === state.formatId ? " active" : "");
      button.dataset.format = fmt.id;
      button.textContent = fmt.name;
      button.setAttribute("aria-pressed", fmt.id === state.formatId ? "true" : "false");
      els.formatBar.appendChild(button);
    }
  }

  function renderTypeOptions(types) {
    const current = state.type;
    const options = [`<option value="">All types</option>`].concat(
      types.map((label) => `<option value="${T.escapeHtml(label)}">${T.escapeHtml(label)}</option>`)
    );
    els.type.innerHTML = options.join("");
    els.type.value = current;
  }

  function findEvent(id) {
    return state.events.find((event) => String(event.id) === String(id)) || null;
  }

  function openDrawer(id, options) {
    const event = findEvent(id);
    if (!event) {
      state.openId = null;
      return;
    }
    state.openId = String(event.id);
    els.drawer.innerHTML = T.renderDrawer(event);
    els.root.hidden = false;
    document.body.classList.add("drawer-open");
    const close = document.getElementById("drawer-close");
    if (close) close.addEventListener("click", () => closeDrawer());
    if (!options || !options.skipFocus) {
      const target = close || els.drawer;
      target.focus();
    }
    render();
  }

  function closeDrawer(options) {
    const returnId = state.openId;
    const wasOpen = Boolean(els.root && !els.root.hidden);
    state.openId = null;
    if (wasOpen) {
      els.root.hidden = true;
      els.drawer.innerHTML = "";
    }
    document.body.classList.remove("drawer-open");
    if (!options?.skipQuery) {
      if (wasOpen) render();
      else writeQuery();
    }
    if (wasOpen && !options?.keepFocus && returnId && els.tbody) {
      const row = els.tbody.querySelector(`[data-event-id="${CSS.escape(String(returnId))}"]`);
      if (row) row.focus();
    }
  }

  init();
})();
