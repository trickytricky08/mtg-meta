/**
 * Tournaments page controller. Reads data/tournaments.json on each load.
 * ?format=standard|pioneer|modern selects the tab. ?fixture=bracket mixes in
 * tests/fixtures/bracket-event.json so the bracket drawer can be checked.
 * That fixture is not part of the weekly data file.
 */
(() => {
  "use strict";

  const T = globalThis.MTGTournaments;
  if (!T) return;

  const els = {
    stamp: document.getElementById("meta-stamp"),
    formatBar: document.getElementById("format-bar"),
    formatDesc: document.getElementById("format-desc"),
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
    from: "",
    to: "",
    openId: null,
    fixture: false,
  };

  function readQuery() {
    const params = new URLSearchParams(location.search);
    state.formatId = T.normalizeFormat(params.get("format"));
    state.type = params.get("type") || "";
    state.from = T.validDate(params.get("from"));
    state.to = T.validDate(params.get("to"));
    state.openId = params.get("event") || null;
    state.fixture = params.get("fixture") === "bracket";
  }

  function writeQuery() {
    const params = new URLSearchParams();
    params.set("format", state.formatId);
    if (state.type) params.set("type", state.type);
    if (state.from) params.set("from", state.from);
    if (state.to) params.set("to", state.to);
    if (state.openId) params.set("event", state.openId);
    if (state.fixture) params.set("fixture", "bracket");
    const next = `${location.pathname}?${params.toString()}`;
    if (`${location.pathname}${location.search}` !== next) {
      history.replaceState(null, "", next);
    }
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

    els.from.addEventListener("change", () => {
      state.from = T.validDate(els.from.value);
      render();
    });

    els.to.addEventListener("change", () => {
      state.to = T.validDate(els.to.value);
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
    if (els.from) els.from.value = state.from;
    if (els.to) els.to.value = state.to;
    const format = T.FORMATS.find((entry) => entry.id === state.formatId);
    if (els.formatDesc) {
      els.formatDesc.textContent = format
        ? `Recent ${format.name} events from MTGGoldfish, newest first. Open a row for the top 8.`
        : "";
    }
    const showPlayers = rows.some((event) => T.knownPlayerCount(event) != null);
    if (els.table) els.table.classList.toggle("hide-players", !showPlayers);
    if (els.count) {
      if (state.from && state.to && state.from > state.to) {
        els.count.textContent = "The start date is after the end date.";
      } else {
        els.count.textContent = `${rows.length} event${rows.length === 1 ? "" : "s"}`;
      }
    }
    if (els.tbody) els.tbody.innerHTML = T.renderEventRows(rows, state.openId);
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
