import * as Game from '../src/state.js';
import { drawSprite } from '../src/sprite.js';

const $ = (id) => document.getElementById(id);
const canvas = $('pet');
const ctx = canvas.getContext('2d');

let state = null;
let frame = 0;
let blinkUntil = 0;
let excitedUntil = 0;
let eyeTimer = null;

const send = (type, extra = {}) =>
  chrome.runtime.sendMessage({ type, ...extra }).then((res) => {
    if (res?.state) {
      state = res.state;
      render();
    }
    return res;
  });

// ---------- Rendering ----------

function drawPet() {
  if (!state) return;
  const stage = Game.stageOf(state).id;
  let mood = Game.moodOf(state);
  if (Date.now() < excitedUntil && state.pet.alive) mood = 'excited';
  const asleep = mood === 'sleeping';
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawSprite(ctx, {
    stage,
    mood,
    blink: !asleep && Date.now() < blinkUntil,
    bob: stage === 'egg' || asleep || mood === 'dead' ? 0 : -(frame % 2),
  }, 10);
  $('zzz').hidden = !asleep;
}

function fmtDue(min) {
  if (min <= 0) return 'now!';
  if (min < 60) return `in ${min}m`;
  return `in ${Math.floor(min / 60)}h ${min % 60}m`;
}

function renderStats() {
  const wrap = $('stats');
  if (!wrap.children.length) {
    for (const key of Game.STAT_KEYS) {
      const def = Game.STATS[key];
      const row = document.createElement('div');
      row.className = 'stat';
      row.dataset.key = key;
      row.innerHTML = `<span>${def.icon}</span><span class="label">${def.label}</span><div class="bar"><i></i></div><span class="due"></span>`;
      wrap.append(row);
    }
  }
  const active = state.pet.alive && state.pet.hatchedAt && !state.settings.paused;
  for (const row of wrap.children) {
    const key = row.dataset.key;
    const v = state.stats[key];
    row.querySelector('i').style.width = `${v}%`;
    row.classList.toggle('low', v < Game.LOW && v >= Game.URGENT);
    row.classList.toggle('urgent', v < Game.URGENT);
    row.querySelector('.due').textContent = !active
      ? '—'
      : v < Game.LOW ? 'now!' : fmtDue(Game.minutesUntilLow(state, key));
  }
  const need = active ? Game.topNeed(state) : null;
  const actionFor = { hydration: 'drink', movement: 'stand', eyes: 'look' };
  for (const btn of document.querySelectorAll('.act')) {
    btn.classList.toggle('needed', need && actionFor[need] === btn.dataset.action);
    btn.disabled = !state.pet.alive;
  }
}

function render() {
  if (!state) return;
  const stage = Game.stageOf(state);
  const next = Game.nextStage(state);
  const days = Game.ageDays(state);
  $('petName').textContent = state.pet.name;
  $('stage').textContent = stage.id === 'egg'
    ? `Egg · generation ${state.pet.generation}`
    : `${stage.label} · ${days === 0 ? 'born today' : `${days} day${days === 1 ? '' : 's'} old`}`;
  $('healthBar').style.width = `${state.health}%`;
  $('xpLine').textContent = stage.id === 'egg' ? '' : next ? `${state.pet.xp}/${next.xp} xp → ${next.label}` : `${state.pet.xp} xp · fully grown`;

  const bubble = $('bubble');
  const text = state.message || Game.statusLine(state);
  if (bubble.textContent !== text) {
    bubble.textContent = text;
    bubble.classList.remove('flash');
    void bubble.offsetWidth;
    bubble.classList.add('flash');
  }

  renderStats();
  const t = state.today;
  $('today').innerHTML =
    `<span>💧 <b>${t.water}</b>/${state.settings.waterGoal} glasses</span>` +
    `<span>🧍 <b>${t.stand}</b> stand-ups</span>` +
    `<span>👀 <b>${t.look}</b> breaks</span>`;

  const dead = $('dead');
  dead.hidden = state.pet.alive;
  if (!state.pet.alive) {
    $('deadTitle').textContent = `${state.pet.name} floated away 👻`;
    $('deadText').textContent =
      `${state.pet.name} lived ${Game.ageDays(state)} day(s). Your longest-lived pal made it ${state.best.days} day(s). ` +
      'Remember: water, movement and eye breaks keep you going too.';
  }

  if (state.eyeBreak && !eyeTimer) showEyeBreak();
  drawPet();
}

// ---------- Eye break ----------

function showEyeBreak() {
  $('eyeBreak').hidden = false;
  const total = Game.EYE_BREAK_SECONDS * 1000;
  const update = async () => {
    if (!state?.eyeBreak) return hideEyeBreak();
    const left = Math.max(0, total - (Date.now() - state.eyeBreak.startedAt));
    $('countdown').textContent = Math.ceil(left / 1000);
    document.querySelector('.ring').style.setProperty('--p', ((total - left) / total) * 100);
    if (left <= 0) {
      hideEyeBreak();
      await send('finishEyeBreak');
      celebrate();
    }
  };
  update();
  eyeTimer = setInterval(update, 200);
}

function hideEyeBreak() {
  clearInterval(eyeTimer);
  eyeTimer = null;
  $('eyeBreak').hidden = true;
}

function celebrate() {
  excitedUntil = Date.now() + 1800;
  const screen = $('screen');
  screen.classList.remove('wiggle');
  void screen.offsetWidth;
  screen.classList.add('wiggle');
  drawPet();
}

// ---------- Settings ----------

function openSettings() {
  const form = $('settingsForm');
  for (const [k, v] of Object.entries(state.settings)) {
    const input = form.elements[k];
    if (!input) continue;
    if (input.type === 'checkbox') input.checked = !!v;
    else input.value = v;
  }
  const hidden = state.settings.hiddenSites.length;
  $('showAllSites').hidden = !hidden;
  $('showAllSites').textContent = `Show my pet again on ${hidden} hidden site${hidden === 1 ? '' : 's'}`;
  $('settings').hidden = false;
}

$('showAllSites').addEventListener('click', async () => {
  await send('showAllSites');
  $('showAllSites').hidden = true;
  $('settingsForm').elements.showOnPages.checked = true;
});

$('settingsForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const settings = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    settings[el.name] = el.type === 'checkbox' ? el.checked : el.value;
  }
  await send('updateSettings', { settings });
  $('settings').hidden = true;
});

$('settingsBtn').addEventListener('click', openSettings);
$('closeSettings').addEventListener('click', () => { $('settings').hidden = true; });
$('resetBtn').addEventListener('click', async () => {
  if (confirm(`Say goodbye to ${state.pet.name} and start over with a new egg?`)) {
    await send('rebirth');
    $('settings').hidden = true;
  }
});

// ---------- Actions ----------

for (const btn of document.querySelectorAll('.act')) {
  btn.addEventListener('click', async () => {
    const action = btn.dataset.action;
    if (action === 'look') {
      await send('startEyeBreak');
      return;
    }
    await send(action);
    celebrate();
  });
}
$('cancelEye').addEventListener('click', async () => {
  hideEyeBreak();
  await send('cancelEyeBreak');
});
$('rebirthBtn').addEventListener('click', () => send('rebirth'));

chrome.storage.onChanged.addListener((changes) => {
  if (changes.pixelPal?.newValue) {
    state = changes.pixelPal.newValue;
    render();
  }
});

// Clear one-off messages when the popup closes, so the bubble shows status next time.
window.addEventListener('pagehide', () => {
  if (state?.message) chrome.runtime.sendMessage({ type: 'clearMessage' });
});

// ---------- Animation loop ----------

setInterval(() => {
  frame++;
  if (Math.random() < 0.12) blinkUntil = Date.now() + 160;
  drawPet();
}, 550);

send('getState');
