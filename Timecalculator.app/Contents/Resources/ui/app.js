// ---------- Helpers ----------
const pad2 = (n) => String(n).padStart(2, "0");

function parseTimeString(str) {
  if (!str || typeof str !== "string") return { h: 0, m: 0, normalized: false };
  const raw = str.trim();
  let h = 0, m = 0, normalized = false;

  if (raw.includes(":")) {
    const [hh, mm = "0"] = raw.split(":");
    h = parseInt(hh, 10); m = parseInt(mm, 10);
  } else {
    m = parseInt(raw, 10);
  }
  if (!Number.isFinite(h)) h = 0;
  if (!Number.isFinite(m)) m = 0;

  if (m >= 60 || m < 0) {
    const total = h * 60 + m;
    if (total >= 0) {
      h = Math.floor(total / 60);
      m = total % 60;
      normalized = true;
    } else {
      h = 0; m = 0; normalized = true;
    }
  }
  if (h < 0) { h = 0; normalized = true; }
  return { h, m, normalized };
}

function setTimeInput(id, h, m) {
  const el = document.getElementById(id);
  if (!el) return;
  el.value = `${pad2(h)}:${pad2(m)}`;
}

function getTimeInput(id) {
  const el = document.getElementById(id);
  const { h, m, normalized } = parseTimeString(el.value);
  if (normalized) el.value = `${pad2(h)}:${pad2(m)}`;
  return { h, m, normalized };
}

function focusStart() {
  const el = document.getElementById("start_time");
  if (el) { el.focus(); el.select(); }
}

function showStatus(msg) {
  const s = document.getElementById("status_line");
  if (!s) return;
  s.textContent = msg || "";
  if (msg) {
    clearTimeout(showStatus._t);
    showStatus._t = setTimeout(() => (s.textContent = ""), 2500);
  }
}

function showDate() {
  const el = document.getElementById("current-date");
  if (!el) return;
  const opts = { day: "2-digit", month: "short", year: "numeric" };
  el.textContent = new Date().toLocaleDateString("en-GB", opts);
}

// ---------- Calculate ----------
async function calculate() {
  const start = getTimeInput("start_time");
  const work  = getTimeInput("work_time");
  const lunch = getTimeInput("lunch_time");
  const ot    = getTimeInput("ot_time");
  const ct    = getTimeInput("ct_time");

  const payload = {
    start: { h: start.h, m: start.m },
    work:  { h: work.h,  m: work.m  },
    lunch: { h: lunch.h, m: lunch.m },
    ot:    { h: ot.h,    m: ot.m    },
    ct:    { h: ct.h,    m: ct.m    },
  };

  try {
    const res = await window.pywebview.api.calculate(JSON.stringify(payload));
    const out = document.getElementById("result");
    out.textContent = res;
    out.classList.add("show");
    if (start.normalized || work.normalized || lunch.normalized || ot.normalized || ct.normalized) {
      showStatus("Some values were normalized (minutes ≥ 60).");
    } else {
      showStatus("");
    }
  } catch (e) {
    const out = document.getElementById("result");
    out.textContent = "Error";
    out.classList.add("show");
  }
}

// ---------- Defaults & Info ----------
async function loadDefaults() {
  try {
    const json = await window.pywebview.api.get_defaults();
    const d = JSON.parse(json);
    setTimeInput("start_time", d.StartTime.h, d.StartTime.m);
    setTimeInput("work_time",  d.WorkTime.h,  d.WorkTime.m);
    setTimeInput("lunch_time", d.LunchTime.h, d.LunchTime.m);
    setTimeInput("ot_time",    d.OvertimeGoal.h, d.OvertimeGoal.m);
    setTimeInput("ct_time",    d.CompTimeGoal.h, d.CompTimeGoal.m);
  } catch {}
}

async function loadUserInfo() {
  try {
    const info = await window.pywebview.api.get_userinfo();
    document.getElementById("info-author").textContent  = "Author: " + info.author;
    document.getElementById("info-version").textContent = "Version: " + info.version;
    document.getElementById("info-user").textContent    = "Logged in as: " + info.fullname;
  } catch {}
}


function applyTheme(href) {
  const link = document.getElementById("theme-css");
  const list = document.getElementById("theme-list");
  const btn  = document.getElementById("theme-trigger");

  link.setAttribute("href", href);

  // UI state im Custom-Dropdown aktualisieren
  const items = Array.from(list.querySelectorAll(".dd-option"));
  items.forEach(o => o.classList.remove("is-active"));
  const match = items.find(li => li.getAttribute("data-css") === href);
  if (match) {
    match.classList.add("is-active");
    btn.firstChild.nodeValue = match.textContent.trim() + " ";
  }
}


// ---------- Custom Dropdown ----------
function bindThemeDropdown() {
  const dd = document.getElementById("theme-dd");
  const btn = document.getElementById("theme-trigger");
  const list = document.getElementById("theme-list");

  function close() {
    dd.classList.remove("open");
    btn.setAttribute("aria-expanded", "false");
  }
  function open() {
    dd.classList.add("open");
    btn.setAttribute("aria-expanded", "true");
  }
  function toggle() { dd.classList.contains("open") ? close() : open(); }

  btn.addEventListener("click", (e) => { e.stopPropagation(); toggle(); });

  list.addEventListener("click", (e) => {
    const item = e.target.closest(".dd-option");
    if (!item) return;

    // active markieren
    list.querySelectorAll(".dd-option").forEach(o => o.classList.remove("is-active"));
    item.classList.add("is-active");

    // Button-Label updaten
    btn.firstChild.nodeValue = item.textContent.trim() + " ";

    // Theme anwenden + persistieren
    const cssFile = item.getAttribute("data-css");
    if (cssFile) {
      applyTheme(cssFile);
      // 1) persistent über Python (port-unabhängig)
      window.pywebview.api.set_theme(cssFile).catch(() => {});
      // 2) zusätzlich localStorage (Backup)
      localStorage.setItem("theme", cssFile);
    }

    close();
  });

  document.addEventListener("click", (e) => { if (!dd.contains(e.target)) close(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
}

async function initTheme() {
  let chosen = null;

  // 1) von Python (settings.json)
  try {
    const raw = await window.pywebview.api.get_settings();
    const s = JSON.parse(raw || "{}");
    if (s && s.theme) chosen = s.theme;
  } catch {}

  // 2) Fallback: localStorage
  if (!chosen) {
    const ls = localStorage.getItem("theme");
    if (ls) chosen = ls;
  }

  // 3) Default
  applyTheme(chosen || "themes/dark.css");
}


// ---------- Bindings ----------
function bindUI() {
  document.getElementById("btn-calc").addEventListener("click", calculate);

  // Enter überall = Calculate
  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
      e.preventDefault();
      calculate();
    }
  });

  // Info modal
  document.getElementById("btn-info").addEventListener("click", () => {
    document.getElementById("info-modal").style.display = "block";
    loadUserInfo();
  });
  document.getElementById("btn-close-info").addEventListener("click", () => {
    document.getElementById("info-modal").style.display = "none";
  });
}

// ---------- Init ----------
function init() {
  bindUI();
  bindThemeDropdown();
  initTheme();  
  loadDefaults().then(focusStart);
  showDate();
}

if (window.pywebview && window.pywebview.api) {
  init();
} else {
  window.addEventListener("pywebviewready", init);
}

