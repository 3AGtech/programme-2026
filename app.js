// ============================
// CONFIG
// ============================
const THEMES_URL = "themes.txt";

// Google Apps Script Web App
const API_BASE_URL =
  "https://script.google.com/macros/s/AKfycbxOmBCp514-IuS0euWRbiQ3oOWWeHgdpe5denBgSTfpSjYnU0mLpNTwFCl-vfiY-qZz/exec";
const API_KEY = "fontenay2026_collab";

// Local persistence (simple & robust)
const STORAGE_KEY = "programme_2026_statuses_v1";

// Status values
const Status = { todo: "todo", doing: "doing", done: "done" };

// ============================
// UTILS
// ============================
function safeId(str) {
  return String(str || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}\s>-]/gu, "")
    .replace(/\s*>\s*/g, " > ");
}

function setError(msg) {
  const el = document.getElementById("error");
  if (!el) return;
  if (!msg) {
    el.classList?.add("hidden");
    el.textContent = "";
  } else {
    el.classList?.remove("hidden");
    el.textContent = String(msg);
  }
}

async function fetchText(url) {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`Impossible de charger ${url} (HTTP ${r.status})`);
  return await r.text();
}

function parseThemes(text) {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\t/g, "  "));
  const themes = [];
  let currentTheme = null;

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;

    const indent = raw.match(/^\s*/)?.[0].length || 0;
    const name = line.trim();

    if (indent < 2) {
      currentTheme = { name, items: [] };
      themes.push(currentTheme);
    } else {
      if (!currentTheme) continue;
      currentTheme.items.push({ name });
    }
  }
  return themes;
}

function loadStatuses() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    return obj && typeof obj === "object" ? obj : {};
  } catch {
    return {};
  }
}

function saveStatuses(statuses) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(statuses));
}

function pct(n, d) {
  if (!d) return 0;
  return Math.round((n / d) * 100);
}

function computeStats(themes, statuses) {
  let total = 0,
    done = 0,
    doing = 0,
    todo = 0;

  for (const t of themes) {
    const tid = safeId(t.name);
    const tStatus = statuses[tid] || Status.todo;
    total += 1;
    if (tStatus === Status.done) done++;
    else if (tStatus === Status.doing) doing++;
    else todo++;

    for (const it of t.items) {
      const iid = safeId(`${t.name} > ${it.name}`);
      const s = statuses[iid] || Status.todo;
      total += 1;
      if (s === Status.done) done++;
      else if (s === Status.doing) doing++;
      else todo++;
    }
  }

  return { total, done, doing, todo };
}

function renderStats(stats) {
  const el = document.getElementById("stats");
  if (!el) return;

  el.innerHTML = "";

  const rows = [
    ["Total", String(stats.total)],
    ["Fait", String(stats.done)],
    ["En cours", String(stats.doing)],
    ["À faire", String(stats.todo)],
    ["% Fait", `${pct(stats.done, stats.total)}%`],
  ];

  for (const [k, v] of rows) {
    const row = document.createElement("div");
    row.className = "stat-row";
    row.innerHTML = `<span>${k}</span><span>${v}</span>`;
    el.appendChild(row);
  }

  const prog = document.createElement("div");
  prog.className = "progress";
  const bar = document.createElement("div");
  bar.style.width = `${pct(stats.done, stats.total)}%`;
  prog.appendChild(bar);
  el.appendChild(prog);
}

function statusLabel(s) {
  if (s === Status.done) return "🟩 Fait";
  if (s === Status.doing) return "🟨 En cours";
  return "⬜ À faire";
}

function makeStatusControls(current, onSet) {
  const wrap = document.createElement("div");
  wrap.className = "controls";

  const options = [
    [Status.todo, "À faire"],
    [Status.doing, "En cours"],
    [Status.done, "Fait"],
  ];

  for (const [s, label] of options) {
    const b = document.createElement("button");
    b.className = "pill" + (current === s ? " active" : "");
    b.textContent = label;

    b.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      wrap.querySelectorAll(".pill").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      onSet(s);
    });

    wrap.appendChild(b);
  }

  return wrap;
}

// ============================
// VIEW MANAGEMENT
// ============================
function setView(view) {
  document.getElementById("view-programme")?.classList.toggle("hidden", view !== "programme");
  document.getElementById("view-football")?.classList.toggle("hidden", view !== "football");

  document.querySelectorAll(".tab").forEach((b) => {
    b.classList.toggle("active", b.dataset.view === view);
  });
}

// ============================
// API (Google Apps Script)
// ============================
async function apiGet(route, params = {}) {
  const url = new URL(API_BASE_URL);
  url.searchParams.set("route", route);
  url.searchParams.set("key", API_KEY);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const r = await fetch(url.toString(), { cache: "no-store" });
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || "API error");
  return j;
}

// ============================
// FOOTBALL PAGE (private content)
// ============================
async function loadFootballPage() {
  const resp = await apiGet("page", { slug: "football" });
  const page = resp.page || {};

  const titleEl = document.getElementById("footballTitle");
  const bodyEl = document.getElementById("footballBody");

  if (titleEl) titleEl.textContent = page.title || "Compte rendu – Terrain de football";
  if (bodyEl) bodyEl.textContent = page.body || "— (Aucun contenu pour le moment)";
}

// ============================
// RENDER PROGRAMME (structure + statuses only)
// ============================
function renderProgramme(themes, statuses, filterText, updateUI) {
  const list = document.getElementById("list");
  if (!list) return;

  list.innerHTML = "";
  const q = String(filterText || "").trim().toLowerCase();

  for (const theme of themes) {
    const themeId = safeId(theme.name);
    const themeStatus = statuses[themeId] || Status.todo;

    let themeMatches = !q || theme.name.toLowerCase().includes(q);

    const itemRows = [];
    for (const it of theme.items) {
      const itemId = safeId(`${theme.name} > ${it.name}`);
      const itemStatus = statuses[itemId] || Status.todo;

      const itemMatches = !q || it.name.toLowerCase().includes(q) || theme.name.toLowerCase().includes(q);
      if (itemMatches) {
        themeMatches = true;
        itemRows.push({ it, itemId, itemStatus });
      }
    }

    if (!themeMatches) continue;

    const container = document.createElement("div");
    container.className = "theme";

    const header = document.createElement("div");
    header.className = "theme-header";

    const title = document.createElement("div");
    title.className = "theme-title";
    title.innerHTML = `
      <div style="min-width:0">
        <div style="font-weight:700">${theme.name}</div>
        <div class="small">${statusLabel(themeStatus)}</div>
      </div>
    `;

    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = `${itemRows.length || theme.items.length} item(s)`;

    const chev = document.createElement("span");
    chev.className = "chev";
    chev.textContent = "▾";

    header.appendChild(title);
    header.appendChild(badge);
    header.appendChild(chev);

    const items = document.createElement("div");
    items.className = "items";

    // Theme card (status only)
    const themeCard = document.createElement("div");
    themeCard.className = "item";

    const themeTop = document.createElement("div");
    themeTop.className = "item-top";

    const themeName = document.createElement("div");
    themeName.innerHTML = `<div class="item-name">Statut du thème</div>`;

    const themeControls = makeStatusControls(themeStatus, (s) => {
      statuses[themeId] = s;
      saveStatuses(statuses);
      updateUI();
    });

    themeTop.appendChild(themeName);
    themeTop.appendChild(themeControls);
    themeCard.appendChild(themeTop);

    const themePlaceholder = document.createElement("div");
    themePlaceholder.className = "content-block";
    themePlaceholder.textContent = "— (Contenu chargé depuis Google Sheets)";
    themeCard.appendChild(themePlaceholder);

    items.appendChild(themeCard);

    const displayItems = itemRows.length
      ? itemRows
      : theme.items.map((it) => {
          const itemId = safeId(`${theme.name} > ${it.name}`);
          return { it, itemId, itemStatus: statuses[itemId] || Status.todo };
        });

    for (const r of displayItems) {
      const card = document.createElement("div");
      card.className = "item";

      const top = document.createElement("div");
      top.className = "item-top";

      const left = document.createElement("div");
      left.innerHTML = `<div class="item-name">${r.it.name}</div>`;

      const controls = makeStatusControls(r.itemStatus, (s) => {
        statuses[r.itemId] = s;
        saveStatuses(statuses);
        updateUI();
      });

      top.appendChild(left);
      top.appendChild(controls);
      card.appendChild(top);

      const cb = document.createElement("div");
      cb.className = "content-block";
      cb.textContent = "— (Contenu chargé depuis Google Sheets)";
      card.appendChild(cb);

      items.appendChild(card);
    }

    let open = true;
    header.addEventListener("click", () => {
      open = !open;
      items.style.display = open ? "flex" : "none";
      chev.textContent = open ? "▾" : "▸";
    });

    container.appendChild(header);
    container.appendChild(items);
    list.appendChild(container);
  }
}

// ============================
// MAIN
// ============================
async function main() {
  try {
    setError("");

    const themesTxt = await fetchText(THEMES_URL);
    const themes = parseThemes(themesTxt);

    const statuses = loadStatuses();

    const updateUI = (filter = "") => {
      renderStats(computeStats(themes, statuses));
      renderProgramme(themes, statuses, filter, () => updateUI(document.getElementById("search")?.value || ""));
    };

    // Initial render
    updateUI("");

    // Search binding (safe)
    const searchEl = document.getElementById("search");
    if (searchEl) {
      searchEl.addEventListener("input", (e) => {
        updateUI(e.target.value || "");
      });
    }

    // Tabs
    document.querySelectorAll(".tab").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const view = btn.dataset.view;
        setView(view);

        if (view === "football") {
          try {
            await loadFootballPage();
          } catch (err) {
            setError(err?.message || String(err));
          }
        } else {
          setError("");
        }
      });
    });

    // Default view
    setView("programme");
  } catch (err) {
    setError(err?.message || String(err));
  }
}

main();
