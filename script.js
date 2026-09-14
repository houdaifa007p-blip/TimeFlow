/* ============================================================
   TimeFlow Timer — script.js
   ============================================================ */

"use strict";

/* ------------------------------------------------------------
   DOM Elements
   ------------------------------------------------------------ */
const htmlEl = document.documentElement;

const hoursInput = document.getElementById("hoursInput");
const minutesInput = document.getElementById("minutesInput");
const secondsInput = document.getElementById("secondsInput");
const presetsBox = document.getElementById("presets");

const timerWrap = document.getElementById("timerWrap");
const timeDisplay = document.getElementById("timeDisplay");
const statusText = document.getElementById("statusText");
const ringProgress = document.getElementById("ringProgress");

const primaryBtn = document.getElementById("primaryBtn");
const resetBtn = document.getElementById("resetBtn");

const themeToggle = document.getElementById("themeToggle");
const fullscreenBtn = document.getElementById("fullscreenBtn");
const soundToggle = document.getElementById("soundToggle");
const darkToggle = document.getElementById("darkToggle");
const saveBtn = document.getElementById("saveBtn");

const toast = document.getElementById("toast");
const liveRegion = document.getElementById("liveRegion");

/* ------------------------------------------------------------
   Constants
   ------------------------------------------------------------ */
const STATE = {
  IDLE: "IDLE",
  RUNNING: "RUNNING",
  PAUSED: "PAUSED",
  FINISHED: "FINISHED",
};

const STORAGE_KEY = "timeflow-timer-settings-v1";

const RING_CIRCUMFERENCE = 2 * Math.PI * 110;

const ICONS = {
  moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',

  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',

  expand:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M16 21h3a2 2 0 0 0 2-2v-3M8 21H5a2 2 0 0 1-2-2v-3"/></svg>',

  compress:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3M16 3v3a2 2 0 0 0 2 2h3M16 21v-3a2 2 0 0 1 2-2h3M8 21v-3a2 2 0 0 1-2-2H3"/></svg>',
};

/* ------------------------------------------------------------
   State
   ------------------------------------------------------------ */
let timerState = STATE.IDLE;

let totalMs = 3 * 60 * 1000;
let remainingMs = totalMs;

let endTime = 0;

let rafId = null;

let lastShownSec = -1;

let audioCtx = null;

let toastTimer = null;

/* ------------------------------------------------------------
   Utils
   ------------------------------------------------------------ */
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function formatTime(ms) {
  const safe = Math.max(0, Math.floor(ms / 1000));

  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;

  if (hours > 0) {
    return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`;
  }

  return `${pad2(minutes)}:${pad2(seconds)}`;
}

function showToast(message) {
  toast.textContent = message;

  toast.classList.add("is-visible");

  clearTimeout(toastTimer);

  toastTimer = setTimeout(() => {
    toast.classList.remove("is-visible");
  }, 2200);
}

function announce(message) {
  liveRegion.textContent = "";

  setTimeout(() => {
    liveRegion.textContent = message;
  }, 60);
}

/* ------------------------------------------------------------
   LocalStorage
   ------------------------------------------------------------ */
function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) return null;

    const data = JSON.parse(raw);

    return data && typeof data === "object" ? data : null;
  } catch (err) {
    return null;
  }
}

function saveSettings(options = {}) {
  const silent = options.silent === true;

  const payload = {
    durationMs: readSetupMs(),
    theme: htmlEl.getAttribute("data-theme") || "light",
    soundEnabled: soundToggle.checked,
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));

    if (!silent) {
      showToast("تم حفظ الإعدادات ✓");
    }
  } catch (err) {
    if (!silent) {
      showToast("تعذّر الحفظ في المتصفح");
    }
  }
}

function applyStoredSettings() {
  const saved = loadSettings();

  if (!saved) {
    applyTheme("light", false);

    updateThemeToggleIcon();

    return;
  }

  const theme = saved.theme === "dark" ? "dark" : "light";

  applyTheme(theme, false);

  darkToggle.checked = theme === "dark";

  updateThemeToggleIcon();

  soundToggle.checked = saved.soundEnabled !== false;

  const dur = Number(saved.durationMs);

  if (Number.isFinite(dur) && dur > 0) {
    setFromMilliseconds(dur);
  }
}

/* ------------------------------------------------------------
   Setup Inputs
   ------------------------------------------------------------ */
function readSetupMs() {
  const h = clamp(parseInt(hoursInput.value, 10) || 0, 0, 99);

  const m = Math.max(0, parseInt(minutesInput.value, 10) || 0);

  const s = Math.max(0, parseInt(secondsInput.value, 10) || 0);

  return (h * 3600 + m * 60 + s) * 1000;
}

function normalizeSetupInputs() {
  let h = clamp(parseInt(hoursInput.value, 10) || 0, 0, 99);

  let m = Math.max(0, parseInt(minutesInput.value, 10) || 0);

  let s = Math.max(0, parseInt(secondsInput.value, 10) || 0);

  if (s > 59) {
    m += Math.floor(s / 60);
    s %= 60;
  }

  if (m > 59) {
    h += Math.floor(m / 60);
    m %= 60;
  }

  if (h > 99) {
    h = 99;
    m = 59;
    s = 59;
  }

  hoursInput.value = String(h);
  minutesInput.value = String(m);
  secondsInput.value = String(s);

  return (h * 3600 + m * 60 + s) * 1000;
}

function fillInputsFromMs(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));

  const h = Math.floor(totalSec / 3600);

  const m = Math.floor((totalSec % 3600) / 60);

  const s = totalSec % 60;

  hoursInput.value = String(h);
  minutesInput.value = String(m);
  secondsInput.value = String(s);
}

function setFromMilliseconds(ms) {
  const safeMs = Math.max(0, Math.floor(ms));

  fillInputsFromMs(safeMs);

  totalMs = safeMs;

  remainingMs = safeMs;

  resetTimer(true);
}

/* ------------------------------------------------------------
   Timer Logic
   ------------------------------------------------------------ */
function startTimer() {
  if (timerState === STATE.RUNNING) {
    return;
  }

  if (remainingMs <= 0) {
    remainingMs = readSetupMs();

    totalMs = remainingMs;
  }

  if (remainingMs <= 0) {
    showToast("حدّد مدة أكبر من صفر");

    return;
  }

  /*
    تشغيل AudioContext بعد تفاعل المستخدم
  */
  getAudioContext();

  timerState = STATE.RUNNING;

  endTime = performance.now() + remainingMs;

  /*
    منع إصدار صوت لحظة الضغط على Start
  */
  lastShownSec = Math.ceil(remainingMs / 1000);

  cancelAnimationFrame(rafId);

  rafId = requestAnimationFrame(tick);

  updateUI();

  announce("بدأ العد التنازلي");
}

function pauseTimer() {
  if (timerState !== STATE.RUNNING) {
    return;
  }

  remainingMs = Math.max(0, endTime - performance.now());

  timerState = STATE.PAUSED;

  cancelAnimationFrame(rafId);

  rafId = null;

  updateUI();

  announce("تم الإيقاف المؤقت");
}

function resumeTimer() {
  if (timerState !== STATE.PAUSED) {
    return;
  }

  if (remainingMs <= 0) {
    startTimer();

    return;
  }

  getAudioContext();

  timerState = STATE.RUNNING;

  endTime = performance.now() + remainingMs;

  lastShownSec = Math.ceil(remainingMs / 1000);

  cancelAnimationFrame(rafId);

  rafId = requestAnimationFrame(tick);

  updateUI();

  announce("تم الاستئناف");
}

function resetTimer(silent) {
  cancelAnimationFrame(rafId);

  rafId = null;

  timerState = STATE.IDLE;

  const ms = readSetupMs();

  totalMs = ms;

  remainingMs = ms;

  lastShownSec = -1;

  timerWrap.classList.remove("is-finished");

  updateUI();

  if (!silent) {
    announce("تمت إعادة الضبط");
  }
}

function finishTimer() {
  cancelAnimationFrame(rafId);

  rafId = null;

  remainingMs = 0;

  timerState = STATE.FINISHED;

  timerWrap.classList.add("is-finished");

  updateUI();

  /*
    صوت النهاية القوي
  */
  playAlertSound();

  showToast("انتهى الوقت! ⏰");

  announce("انتهى الوقت");
}

function tick() {
  if (timerState !== STATE.RUNNING) {
    return;
  }

  const now = performance.now();

  const left = endTime - now;

  if (left <= 0) {
    remainingMs = 0;

    updateTimerVisuals(0);

    finishTimer();

    return;
  }

  remainingMs = left;

  updateTimerVisuals(left);

  rafId = requestAnimationFrame(tick);
}

/* ------------------------------------------------------------
   UI Update
   ------------------------------------------------------------ */
function updateTimerVisuals(msLeft) {
  const shownSec = Math.ceil(msLeft / 1000);

  /*
    كلما انتقل المؤقت إلى ثانية جديدة،
    يتم تشغيل صوت قصير.
  */
  if (shownSec !== lastShownSec) {
    const previousSec = lastShownSec;

    lastShownSec = shownSec;

    timeDisplay.textContent = formatTime(msLeft);

    /*
      تشغيل الصوت فقط أثناء النزول
    */
    if (
      previousSec !== -1 &&
      shownSec < previousSec &&
      shownSec > 0 &&
      soundToggle.checked
    ) {
      playTickSound();
    }
  }

  const ratio = totalMs > 0 ? clamp(msLeft / totalMs, 0, 1) : 0;

  const offset = RING_CIRCUMFERENCE * (1 - ratio);

  ringProgress.style.strokeDashoffset = String(offset);
}

function updateUI() {
  timeDisplay.textContent = formatTime(remainingMs);

  const ratio = totalMs > 0 ? clamp(remainingMs / totalMs, 0, 1) : 0;

  ringProgress.style.strokeDashoffset = String(
    RING_CIRCUMFERENCE * (1 - ratio),
  );

  timerWrap.classList.toggle("is-running", timerState === STATE.RUNNING);

  switch (timerState) {
    case STATE.RUNNING:
      statusText.textContent = "جارٍ العد...";

      setPrimaryButton("pause", "إيقاف مؤقت");

      break;

    case STATE.PAUSED:
      statusText.textContent = "متوقف مؤقتًا";

      setPrimaryButton("resume", "استئناف");

      break;

    case STATE.FINISHED:
      statusText.textContent = "انتهى الوقت!";

      setPrimaryButton("start", "بدء من جديد");

      break;

    default:
      statusText.textContent = "جاهز للبدء";

      setPrimaryButton("start", "بدء");

      timerWrap.classList.remove("is-finished");
  }
}

function setPrimaryButton(action, label) {
  primaryBtn.dataset.action = action;

  primaryBtn.textContent = label;
}

/* ------------------------------------------------------------
   Controls
   ------------------------------------------------------------ */
function handlePrimaryAction() {
  const action = primaryBtn.dataset.action;

  if (action === "pause") {
    pauseTimer();
  } else if (action === "resume") {
    resumeTimer();
  } else {
    if (timerState === STATE.FINISHED) {
      timerWrap.classList.remove("is-finished");

      const ms = readSetupMs();

      totalMs = ms;

      remainingMs = ms;
    }

    startTimer();
  }
}

primaryBtn.addEventListener("click", handlePrimaryAction);

resetBtn.addEventListener("click", () => {
  timerWrap.classList.remove("is-finished");

  resetTimer(false);
});

/* ------------------------------------------------------------
   Presets
   ------------------------------------------------------------ */
presetsBox.addEventListener("click", (event) => {
  const btn = event.target.closest(".preset");

  if (!btn) return;

  const minutes = parseInt(btn.dataset.minutes, 10) || 0;

  const ms = minutes * 60 * 1000;

  cancelAnimationFrame(rafId);

  rafId = null;

  timerState = STATE.IDLE;

  timerWrap.classList.remove("is-finished");

  totalMs = ms;

  remainingMs = ms;

  fillInputsFromMs(ms);

  updateUI();

  presetsBox
    .querySelectorAll(".preset")
    .forEach((el) => el.classList.remove("is-active"));

  btn.classList.add("is-active");

  showToast(`تم ضبط المؤقت على ${minutes} دقيقة`);
});

/* ------------------------------------------------------------
   Inputs Events
   ------------------------------------------------------------ */
[hoursInput, minutesInput, secondsInput].forEach((input) => {
  input.addEventListener("change", () => {
    normalizeSetupInputs();

    presetsBox
      .querySelectorAll(".preset")
      .forEach((el) => el.classList.remove("is-active"));

    if (timerState === STATE.IDLE || timerState === STATE.FINISHED) {
      const ms = readSetupMs();

      totalMs = ms;

      remainingMs = ms;

      timerWrap.classList.remove("is-finished");

      updateUI();
    }
  });

  input.addEventListener("focus", () => input.select());

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();

      input.blur();
    }
  });
});

/* ------------------------------------------------------------
   Theme
   ------------------------------------------------------------ */
function applyTheme(theme, persist) {
  const value = theme === "dark" ? "dark" : "light";

  htmlEl.setAttribute("data-theme", value);

  darkToggle.checked = value === "dark";

  updateThemeToggleIcon();

  const meta = document.querySelector('meta[name="theme-color"]');

  if (meta) {
    meta.setAttribute("content", value === "dark" ? "#0b0d18" : "#4f46e5");
  }

  if (persist) {
    saveSettings({
      silent: true,
    });
  }
}

function updateThemeToggleIcon() {
  const isDark = htmlEl.getAttribute("data-theme") === "dark";

  themeToggle.innerHTML = isDark ? ICONS.sun : ICONS.moon;

  themeToggle.setAttribute(
    "aria-label",
    isDark ? "التبديل إلى الوضع النهاري" : "التبديل إلى الوضع الليلي",
  );
}

function toggleTheme() {
  const isDark = htmlEl.getAttribute("data-theme") === "dark";

  applyTheme(isDark ? "light" : "dark", true);
}

themeToggle.addEventListener("click", toggleTheme);

darkToggle.addEventListener("change", () => {
  applyTheme(darkToggle.checked ? "dark" : "light", true);
});

/* ------------------------------------------------------------
   SOUND
   ------------------------------------------------------------ */

/*
  إنشاء AudioContext
*/
function getAudioContext() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;

    if (!Ctx) {
      return null;
    }

    audioCtx = new Ctx();
  }

  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }

  return audioCtx;
}

/* ------------------------------------------------------------
   صوت العد التنازلي
   ------------------------------------------------------------ */

function playTickSound() {
  if (!soundToggle.checked) {
    return;
  }

  const ctx = getAudioContext();

  if (!ctx) return;

  const now = ctx.currentTime;

  /*
    Master Gain للتحكم في مستوى الصوت
  */
  const masterGain = ctx.createGain();

  masterGain.gain.setValueAtTime(0.0001, now);

  /*
    قوة صوت العد التنازلي
  */
  masterGain.gain.exponentialRampToValueAtTime(0.55, now + 0.008);

  masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.17);

  masterGain.connect(ctx.destination);

  /*
    الصوت الأساسي
  */
  const osc1 = ctx.createOscillator();

  osc1.type = "square";

  osc1.frequency.setValueAtTime(1050, now);

  /*
    طبقة ثانية تزيد وضوح وقوة الصوت
  */
  const osc2 = ctx.createOscillator();

  osc2.type = "sine";

  osc2.frequency.setValueAtTime(1575, now);

  osc1.connect(masterGain);
  osc2.connect(masterGain);

  osc1.start(now);
  osc2.start(now);

  osc1.stop(now + 0.18);

  osc2.stop(now + 0.13);
}

/* ------------------------------------------------------------
   صوت النهاية — قوي جدًا
   ------------------------------------------------------------ */

function playAlertSound() {
  if (!soundToggle.checked) {
    return;
  }

  const ctx = getAudioContext();

  if (!ctx) return;

  const now = ctx.currentTime;

  /*
    نغمات النهاية
  */
  const notes = [
    {
      freq: 700,
      start: 0,
      dur: 0.3,
    },
    {
      freq: 900,
      start: 0.32,
      dur: 0.3,
    },
    {
      freq: 1200,
      start: 0.64,
      dur: 0.34,
    },
    {
      freq: 1500,
      start: 1.02,
      dur: 0.6,
    },
  ];

  notes.forEach((note) => {
    /*
        طبقة أساسية
      */
    const osc1 = ctx.createOscillator();

    /*
        طبقة إضافية
      */
    const osc2 = ctx.createOscillator();

    /*
        التحكم بالصوت
      */
    const gain = ctx.createGain();

    osc1.type = "square";

    osc1.frequency.setValueAtTime(note.freq, now + note.start);

    osc2.type = "sine";

    osc2.frequency.setValueAtTime(note.freq * 1.5, now + note.start);

    gain.gain.setValueAtTime(0.0001, now + note.start);

    /*
        صوت قوي جدًا
      */
    gain.gain.exponentialRampToValueAtTime(0.85, now + note.start + 0.02);

    gain.gain.exponentialRampToValueAtTime(0.0001, now + note.start + note.dur);

    osc1.connect(gain);
    osc2.connect(gain);

    gain.connect(ctx.destination);

    osc1.start(now + note.start);

    osc2.start(now + note.start);

    osc1.stop(now + note.start + note.dur + 0.03);

    osc2.stop(now + note.start + note.dur + 0.03);
  });
}

/* ------------------------------------------------------------
   Sound Toggle
   ------------------------------------------------------------ */
soundToggle.addEventListener("change", () => {
  saveSettings({
    silent: true,
  });

  showToast(
    soundToggle.checked ? "تم تفعيل صوت المؤقت" : "تم تعطيل صوت المؤقت",
  );
});

/* ------------------------------------------------------------
   Fullscreen
   ------------------------------------------------------------ */
function isFullscreen() {
  return Boolean(
    document.fullscreenElement || document.webkitFullscreenElement,
  );
}

function toggleFullscreen() {
  if (!isFullscreen()) {
    const el = document.documentElement;

    const request = el.requestFullscreen || el.webkitRequestFullscreen;

    if (request) {
      request.call(el).catch(() => showToast("ملء الشاشة غير مدعوم"));
    } else {
      showToast("ملء الشاشة غير مدعوم");
    }
  } else {
    const exit = document.exitFullscreen || document.webkitExitFullscreen;

    if (exit) {
      exit.call(document);
    }
  }
}

function updateFullscreenIcon() {
  const active = isFullscreen();

  fullscreenBtn.innerHTML = active ? ICONS.compress : ICONS.expand;

  fullscreenBtn.setAttribute(
    "aria-label",
    active ? "الخروج من ملء الشاشة" : "ملء الشاشة",
  );
}

fullscreenBtn.addEventListener("click", toggleFullscreen);

document.addEventListener("fullscreenchange", updateFullscreenIcon);

document.addEventListener("webkitfullscreenchange", updateFullscreenIcon);

/* ------------------------------------------------------------
   Keyboard Shortcuts
   ------------------------------------------------------------ */
document.addEventListener("keydown", (event) => {
  const target = event.target;

  const isTyping =
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target.isContentEditable;

  if (isTyping) {
    return;
  }

  const key = event.key;

  if (key === " " || key === "Spacebar") {
    event.preventDefault();

    handlePrimaryAction();

    return;
  }

  if (key === "r" || key === "R" || key === "ر") {
    event.preventDefault();

    timerWrap.classList.remove("is-finished");

    resetTimer(false);

    return;
  }

  if (key === "f" || key === "F" || key === "ب") {
    event.preventDefault();

    toggleFullscreen();
  }
});

/* ------------------------------------------------------------
   Save Button
   ------------------------------------------------------------ */
saveBtn.addEventListener("click", () => {
  normalizeSetupInputs();

  saveSettings({
    silent: false,
  });
});

/* ------------------------------------------------------------
   Page Visibility
   ------------------------------------------------------------ */
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && timerState === STATE.RUNNING) {
    const left = endTime - performance.now();

    if (left <= 0) {
      remainingMs = 0;

      updateTimerVisuals(0);

      finishTimer();
    } else {
      remainingMs = left;

      updateTimerVisuals(left);
    }
  }
});

/* ------------------------------------------------------------
   Initialization
   ------------------------------------------------------------ */
function init() {
  ringProgress.style.strokeDasharray = String(RING_CIRCUMFERENCE);

  ringProgress.style.strokeDashoffset = "0";

  fullscreenBtn.innerHTML = ICONS.expand;

  updateFullscreenIcon();

  applyStoredSettings();

  const saved = loadSettings();

  if (!saved) {
    setFromMilliseconds(3 * 60 * 1000);
  }

  timerState = STATE.IDLE;

  timerWrap.classList.remove("is-finished");

  updateUI();
}

init();
