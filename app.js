const THEMES_URL = "themes.txt";
const CONTENTS_URL = "contents.txt";
const STORAGE_KEY = "programme_tracker_status_v1";

const Status = {
  todo: "todo",
  doing: "doing",
  done: "done",
};

function safeId(str) {
  return str.trim().toLowerCase().replace(/\s+/g, " ").replace(/[^\p{L}\p{N}\s>-]/gu, "");
}

function loadStatuses() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveStatuses(obj) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
}

async function fetchText(url) {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`Impossible de charger ${url} (HTTP ${r.status})`);
  return await r.text();
}

// themes.txt parser: indentation => hierarchy
function parseThemes(text) {
  const lines = text.split(/\r?\n/).map(l => l.replace(/\t/g, "  "));
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
      if (!currentTheme) {
        // if file starts with indented items, ignore
        continue;
      }
      currentTheme.items.push({ name });
    }
  }
  return themes;
}

// contents.txt parser: blocks like [Theme] or [Theme > Item]
// blocks separated by lines with ---
function parseContents(text) {
  const blocks = text.split(/\n---\n|\r\n---\r\n|\r\n---\n|\n---\r\n/);
  const map = {};

  for (const block of blocks) {
    const lines = block.split(/\r?\n/);
    let key = null;
    let body = [];
    for (const l of lines) {
      const m = l.match(/^\s*\[(.+?)\]\s*$/);
      if (m) {
        key = m[1].trim();
        continue;
      }
      if (key) body.push(l);
    }
    if (key) map[key] = body.join("\n").trim();
  }
  return map;
}

function getContent(contentsMap, themeName, itemName = null) {
  if (!itemName) {
    return contentsMap[themeName] || "";
  }
  const k = `${themeName} > ${itemName}`;
  return contentsMap[k] || "";
}

function computeStats(themes, statuses) {
  let total = 0, done = 0, doing = 0, todo = 0;

  for (const t of themes) {
    // theme itself counts as 1 “unit”
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

function pct(n, d) {
  if (!d) return 0;
  return Math.round((n / d) * 100);
}

function renderStats(stats) {
  const el = document.getElementById("stats");
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
    b.dataset.status = s;
    b.textContent = label;
    b.addEventListener("click", () => onSet(s));
    wrap.appendChild(b);
  }
  return wrap;
}

function render(themes, contentsMap, statuses, filterText) {
  const list = document.getElementById("list");
  list.innerHTML = "";

  const q = (filterText || "").trim().toLowerCase();

  for (const theme of themes) {
    const themeContent = getContent(contentsMap, theme.name);
    const themeId = safeId(theme.name);
    const themeStatus = statuses[themeId] || Status.todo;

    // theme match logic
    let themeMatches = !q || theme.name.toLowerCase().includes(q) || themeContent.toLowerCase().includes(q);

    const itemsRendered = [];
    for (const it of theme.items) {
      const itemId = safeId(`${theme.name} > ${it.name}`);
      const itemStatus = statuses[itemId] || Status.todo;
      const itemContent = getContent(contentsMap, theme.name, it.name);

      const itemMatches = !q ||
        it.name.toLowerCase().includes(q) ||
        itemContent.toLowerCase().includes(q) ||
        theme.name.toLowerCase().includes(q);

      if (itemMatches) {
        themeMatches = true;
        itemsRendered.push({ it, itemId, itemStatus, itemContent });
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
    badge.textContent = `${itemsRendered.length || theme.items.length} item(s)`;

    const chev = document.createElement("span");
    chev.className = "chev";
    chev.textContent = "▾";

    header.appendChild(title);
    header.appendChild(badge);
    header.appendChild(chev);

    const items = document.createElement("div");
    items.className = "items";

    // Theme “card” itself (so you can mark theme done independently)
    const themeCard = document.createElement("div");
    themeCard.className = "item";

    const themeTop = document.createElement("div");
    themeTop.className = "item-top";

    const themeName = document.createElement("div");
    themeName.innerHTML = `<div class="item-name">Contenu du thème</div>`;

    const themeControls = makeStatusControls(themeStatus, (s) => {
      statuses[themeId] = s;
      saveStatuses(statuses);
      updateUI();
    });

    themeTop.appendChild(themeName);
    themeTop.appendChild(themeControls);

    themeCard.appendChild(themeTop);

    if (themeContent) {
      const cb = document.createElement("div");
      cb.className = "content-block";
      cb.textContent = themeContent;
      themeCard.appendChild(cb);
    } else {
      const cb = document.createElement("div");
      cb.className = "content-block";
      cb.textContent = "— (Pas de contenu pour ce thème dans contents.txt)";
      themeCard.appendChild(cb);
    }

    items.appendChild(themeCard);

    // Items
    const displayItems = itemsRendered.length ? itemsRendered : theme.items.map(it => {
      const itemId = safeId(`${theme.name} > ${it.name}`);
      return {
        it,
        itemId,
        itemStatus: statuses[itemId] || Status.todo,
        itemContent: getContent(contentsMap, theme.name, it.name),
      };
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
      cb.textContent = r.itemContent ? r.itemContent : "— (Pas de contenu pour cet item dans contents.txt)";
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

  function updateUI() {
    const stats = computeStats(themes, statuses);
    renderStats(stats);
    render(themes, contentsMap, statuses, document.getElementById("search").value);
  }
}

function download(filename, text) {
  const el = document.createElement("a");
  el.setAttribute("href", "data:text/plain;charset=utf-8," + encodeURIComponent(text));
  el.setAttribute("download", filename);
  document.body.appendChild(el);
  el.click();
  el.remove();
}

async function main() {
  const errorEl = document.getElementById("error");
  try {
    const [themesTxt, contentsTxt] = await Promise.all([
      fetchText(THEMES_URL),
      fetchText(CONTENTS_URL),
    ]);

    const themes = parseThemes(themesTxt);
    const contentsMap = parseContents(contentsTxt);
    const statuses = loadStatuses();

    const stats = computeStats(themes, statuses);
    renderStats(stats);
    render(themes, contentsMap, statuses, "");

	const searchEl = document.getElementById("search");
	if (searchEl) {
	  searchEl.addEventListener("input", (e) => {
		render(themes, contentsMap, statuses, e.target.value);
		renderStats(computeStats(themes, statuses));
	  });
	}


    document.getElementById("resetBtn").addEventListener("click", () => {
      localStorage.removeItem(STORAGE_KEY);
      location.reload();
    });

    document.getElementById("exportBtn").addEventListener("click", () => {
      const payload = {
        exported_at: new Date().toISOString(),
        statuses,
      };
      download("programme_status_export.json", JSON.stringify(payload, null, 2));
    });

  } catch (err) {
    errorEl.classList.remove("hidden");
    errorEl.textContent = String(err?.message || err);
  }
}

main();
