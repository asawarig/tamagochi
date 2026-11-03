// The "window pet": a small Pixel Pal that roams along the bottom of every web
// page. It lives in a closed shadow root so page styles can't touch it, and
// only the pet itself captures the mouse, so the page stays fully usable.
import * as Game from '../src/state.js';
import { drawSprite } from '../src/sprite.js';

const SCALE = 4;
const SIZE = 16 * SCALE;
const GROUND_GAP = 6;
const WALK_SPEED = 45; // px per second
const GRAVITY = 2400;
const STORAGE_KEY = 'pixelPal';
const HOST = location.hostname;

const CSS = `
  * { box-sizing: border-box; }
  .pal, .card { font: 600 12px/1.3 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #2b2d42; letter-spacing: normal; text-transform: none; }
  .pal {
    position: fixed; left: 0; top: 0; width: ${SIZE}px; height: ${SIZE}px;
    pointer-events: auto; cursor: grab; touch-action: none; user-select: none;
    filter: drop-shadow(0 3px 2px rgba(0,0,0,.22));
  }
  .pal.dragging { cursor: grabbing; }
  .pal[hidden], .card[hidden], .bubble[hidden], .z[hidden] { display: none; }
  canvas { display: block; width: ${SIZE}px; height: ${SIZE}px; image-rendering: pixelated; }
  canvas.flip { transform: scaleX(-1); }
  .bubble {
    position: absolute; bottom: ${SIZE + 6}px; left: 50%; transform: translateX(-50%);
    white-space: nowrap; padding: 5px 9px; cursor: pointer;
    background: #fff; border: 2px solid #2b2d42; border-radius: 10px;
    box-shadow: 0 2px 6px rgba(0,0,0,.15); animation: pop .25s ease-out;
  }
  .bubble.start { left: 0; transform: none; }
  .bubble.end { left: auto; right: 0; transform: none; }
  .bubble.need { animation: pop .25s ease-out, nudge 2.4s ease-in-out .3s infinite; }
  @keyframes pop { from { opacity: 0; translate: 0 4px; } }
  @keyframes nudge { 0%, 85%, 100% { rotate: 0deg; } 90% { rotate: -4deg; } 95% { rotate: 4deg; } }
  .z { position: absolute; right: -4px; top: -6px; font-weight: 800; color: #6d6875; animation: float 2s ease-in-out infinite; }
  @keyframes float { 50% { translate: 0 -5px; } }

  .card {
    position: fixed; width: 230px; padding: 10px 12px 8px; pointer-events: auto;
    background: #fff8f0; border: 2px solid #2b2d42; border-radius: 14px;
    box-shadow: 0 10px 28px rgba(0,0,0,.22); font-weight: 400;
  }
  .head { display: flex; align-items: baseline; gap: 6px; margin-bottom: 7px; }
  .head b { font-size: 14px; }
  .head .stage { color: #6d6875; font-size: 11px; flex: 1; }
  button { font: inherit; color: inherit; cursor: pointer; margin: 0; }
  .x { border: 0; background: none; font-size: 16px; line-height: 1; padding: 0 2px; color: #6d6875; }
  .row { display: grid; grid-template-columns: 18px 1fr; align-items: center; gap: 6px; margin: 4px 0; }
  .bar { height: 7px; border-radius: 4px; background: rgba(43,45,66,.12); overflow: hidden; }
  .bar i { display: block; height: 100%; border-radius: 4px; transition: width .4s; }
  .row[data-k=hydration] i { background: #4895ef; }
  .row[data-k=movement] i { background: #f4a261; }
  .row[data-k=eyes] i { background: #9b5de5; }
  .row[data-k=health] i { background: #e63946; }
  .btns { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin: 9px 0 6px; }
  .btns button {
    padding: 6px 2px; border: 0; border-radius: 10px; background: #ffe5d9;
    font-weight: 700; font-size: 11px; display: flex; flex-direction: column; align-items: center; gap: 1px;
    box-shadow: 0 3px 0 #e5989b;
  }
  .btns button span { font-size: 17px; line-height: 1.1; }
  .btns button:hover { background: #ffd6c6; }
  .btns button:active { translate: 0 2px; box-shadow: 0 1px 0 #e5989b; }
  .btns button.needed { outline: 2px solid #2b2d42; }
  .btns button:disabled { opacity: .45; cursor: default; }
  .foot { display: flex; justify-content: space-between; border-top: 1px solid #f0dcd4; padding-top: 6px; }
  .foot button { border: 0; background: none; padding: 0; font-size: 11px; color: #6d6875; text-decoration: underline; }
`;

export function start() {
  // Remove a pet left behind by a previous version of the extension.
  for (const old of document.querySelectorAll('pixel-pal')) old.remove();

  const host = document.createElement('pixel-pal');
  host.setAttribute('style', 'all: initial !important; position: fixed !important; inset: 0 !important; pointer-events: none !important; z-index: 2147483647 !important; display: block !important;');
  const root = host.attachShadow({ mode: 'closed' });
  root.innerHTML = `
    <style>${CSS}</style>
    <div class="pal" hidden>
      <div class="bubble" hidden></div>
      <canvas width="${SIZE}" height="${SIZE}"></canvas>
      <div class="z" hidden>z<small>z</small></div>
    </div>
    <div class="card" hidden role="dialog" aria-label="Pixel Pal">
      <div class="head"><b class="name"></b><span class="stage"></span><button class="x" title="Close" aria-label="Close">×</button></div>
      ${['hydration', 'movement', 'eyes'].map((k) => `<div class="row" data-k="${k}" title="${Game.STATS[k].label}"><span>${Game.STATS[k].icon}</span><div class="bar"><i></i></div></div>`).join('')}
      <div class="row" data-k="health" title="Health"><span>❤️</span><div class="bar"><i></i></div></div>
      <div class="btns">
        <button data-a="drink"><span>💧</span>Drink</button>
        <button data-a="stand"><span>🧍</span>Stand up</button>
        <button data-a="look"><span>👀</span>Look away</button>
      </div>
      <div class="foot"><button data-a="hideSite">Hide on this site</button><button data-a="hideAll">Hide everywhere</button></div>
    </div>`;
  document.documentElement.append(host);

  const $ = (sel) => root.querySelector(sel);
  const pal = $('.pal');
  const canvas = $('canvas');
  const ctx = canvas.getContext('2d');
  const bubble = $('.bubble');
  const card = $('.card');

  let state = null;
  let lastMessage;
  let flash = null; // { text, until }
  let excitedUntil = 0;
  let blinkUntil = 0;
  let frame = 0;
  let finishingBreak = null;
  const ground = () => window.innerHeight - SIZE - GROUND_GAP;
  const pos = { x: Math.max(8, window.innerWidth - SIZE - 120), y: ground() };
  let vy = 0;
  let target = null;
  let facing = -1;
  let drag = null;
  let alive = true;

  const contextOk = () => {
    try { return !!chrome.runtime?.id; } catch { return false; }
  };

  const send = async (type, extra = {}) => {
    if (!contextOk()) return teardown();
    try {
      const res = await chrome.runtime.sendMessage({ type, ...extra });
      if (res?.state) setState(res.state);
      return res;
    } catch {
      return null;
    }
  };

  // ---------- State ----------

  function visible() {
    return !!state && Game.showsOn(state, HOST) && !document.fullscreenElement;
  }

  function setState(next) {
    const first = !state;
    state = next;
    if (first) lastMessage = state.message;
    if (state.message && state.message !== lastMessage) {
      flash = { text: state.message, until: Date.now() + 5000 };
    }
    lastMessage = state.message;
    pal.hidden = !visible();
    if (pal.hidden) card.hidden = true;
    renderCard();
    draw();
  }

  function mood() {
    let m = Game.moodOf(state);
    if (Date.now() < excitedUntil && state.pet.alive) m = 'excited';
    return m;
  }

  // ---------- Drawing ----------

  function draw() {
    if (!state || pal.hidden) return;
    const stage = Game.stageOf(state).id;
    const m = mood();
    const still = stage === 'egg' || m === 'sleeping' || m === 'dead';
    const walking = target !== null;
    ctx.clearRect(0, 0, SIZE, SIZE);
    drawSprite(ctx, {
      stage,
      mood: m,
      blink: !still && Date.now() < blinkUntil,
      bob: still ? 0 : walking ? -(frame % 2) : -((frame >> 1) % 2),
    }, SCALE);
    canvas.classList.toggle('flip', facing > 0);
    $('.z').hidden = m !== 'sleeping';
    renderBubble();
  }

  function renderBubble() {
    let text = '';
    let need = false;
    let title = '';
    if (state.eyeBreak) {
      const left = Math.ceil((Game.EYE_BREAK_SECONDS * 1000 - (Date.now() - state.eyeBreak.startedAt)) / 1000);
      if (left > 0) {
        text = `👀 Look far away… ${left}`;
        title = 'Click to cancel the eye break';
      } else if (finishingBreak !== state.eyeBreak.startedAt) {
        finishingBreak = state.eyeBreak.startedAt;
        send('finishEyeBreak').then(celebrate);
      }
    } else if (flash && Date.now() < flash.until) {
      text = flash.text;
    } else if (state.pet.alive && state.pet.hatchedAt && !state.settings.paused && state.presence === 'active') {
      const k = Game.topNeed(state);
      if (k) {
        text = Game.STATS[k].short;
        need = true;
        title = 'Click to take care of me';
      }
    } else if (!state.pet.hatchedAt) {
      text = 'Click me to hatch! 🥚';
      need = true;
    } else if (!state.pet.alive) {
      text = '👻 Click to hatch a new egg';
    }
    if (bubble.textContent !== text) bubble.textContent = text;
    bubble.hidden = !text || !card.hidden;
    bubble.title = title;
    bubble.classList.toggle('need', need);
    bubble.classList.toggle('start', pos.x < 90);
    bubble.classList.toggle('end', pos.x > window.innerWidth - SIZE - 90);
  }

  function renderCard() {
    if (!state || card.hidden) return;
    const stage = Game.stageOf(state);
    $('.name').textContent = state.pet.name;
    $('.stage').textContent = state.pet.alive ? stage.label : 'Floated away';
    for (const k of Game.STAT_KEYS) root.querySelector(`.row[data-k=${k}] i`).style.width = `${state.stats[k]}%`;
    root.querySelector('.row[data-k=health] i').style.width = `${state.health}%`;
    const need = Game.topNeed(state);
    const actionFor = { hydration: 'drink', movement: 'stand', eyes: 'look' };
    for (const b of root.querySelectorAll('.btns button')) {
      b.classList.toggle('needed', !!need && actionFor[need] === b.dataset.a);
      b.disabled = !state.pet.alive;
    }
    placeCard();
  }

  function placeCard() {
    const w = 230;
    const left = Math.min(Math.max(8, pos.x + SIZE / 2 - w / 2), window.innerWidth - w - 8);
    card.style.left = `${left}px`;
    card.style.bottom = `${Math.max(8, window.innerHeight - pos.y + 8)}px`;
    card.style.top = 'auto';
  }

  function celebrate() {
    excitedUntil = Date.now() + 1800;
    vy = -420; // happy hop
    pos.y = Math.min(pos.y, ground()) - 1;
    draw();
  }

  // ---------- Movement ----------

  let last = performance.now();
  function loop(now) {
    if (!alive) return;
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    const g = ground();
    if (!drag) {
      if (pos.y < g || vy < 0) {
        vy += GRAVITY * dt;
        pos.y += vy * dt;
        if (pos.y >= g) {
          pos.y = g;
          if (vy > 900) flash = { text: 'Whee! 💫', until: Date.now() + 1500 };
          vy = 0;
        }
      } else {
        pos.y = g;
        if (target !== null) {
          const d = target - pos.x;
          const step = WALK_SPEED * dt;
          if (Math.abs(d) <= step) {
            pos.x = target;
            target = null;
          } else {
            pos.x += Math.sign(d) * step;
            facing = Math.sign(d);
          }
        }
      }
    }
    pos.x = Math.min(Math.max(0, pos.x), window.innerWidth - SIZE);
    pal.style.transform = `translate(${Math.round(pos.x)}px, ${Math.round(pos.y)}px)`;
    if (!card.hidden) placeCard();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  function decide() {
    if (!state || pal.hidden || drag || !card.hidden || state.eyeBreak || target !== null) return;
    const m = mood();
    const chance = { happy: 0.6, excited: 0.6, content: 0.45, meh: 0.2 }[m] || 0;
    if (Game.stageOf(state).id === 'egg' || Math.random() > chance) return;
    const span = Math.min(320, window.innerWidth / 2);
    target = Math.min(Math.max(8, pos.x + (Math.random() * 2 - 1) * span), window.innerWidth - SIZE - 8);
  }

  // ---------- Input ----------

  pal.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target === bubble) return;
    e.preventDefault();
    drag = { sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y, moved: false };
    pal.setPointerCapture(e.pointerId);
  });
  pal.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.sx;
    const dy = e.clientY - drag.sy;
    if (!drag.moved && Math.hypot(dx, dy) < 5) return;
    if (!drag.moved) {
      drag.moved = true;
      target = null;
      card.hidden = true;
      pal.classList.add('dragging');
    }
    pos.x = drag.ox + dx;
    pos.y = Math.min(Math.max(0, drag.oy + dy), ground());
  });
  const endDrag = (e) => {
    if (!drag) return;
    const wasClick = !drag.moved;
    drag = null;
    vy = 0;
    pal.classList.remove('dragging');
    if (wasClick && e.type === 'pointerup') onPetClick();
  };
  pal.addEventListener('pointerup', endDrag);
  pal.addEventListener('pointercancel', endDrag);

  bubble.addEventListener('click', (e) => {
    e.stopPropagation();
    if (state?.eyeBreak) {
      send('cancelEyeBreak');
      return;
    }
    onPetClick();
  });

  function onPetClick() {
    if (!state) return;
    if (!state.pet.alive) return void send('rebirth');
    if (!state.pet.hatchedAt) return void send('drink').then(celebrate);
    card.hidden = !card.hidden;
    target = null;
    renderCard();
    draw();
  }

  card.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.classList.contains('x')) {
      card.hidden = true;
      return draw();
    }
    const a = btn.dataset.a;
    card.hidden = true;
    if (a === 'look') {
      await send('startEyeBreak');
    } else if (a === 'drink' || a === 'stand') {
      await send(a);
      celebrate();
    } else if (a === 'hideSite') {
      await send('hideSite', { host: HOST });
    } else if (a === 'hideAll') {
      await send('updateSettings', { settings: { showOnPages: false } });
    }
    draw();
  });

  // Close the card when clicking elsewhere on the page.
  document.addEventListener('pointerdown', (e) => {
    if (!card.hidden && !e.composedPath().includes(host)) {
      card.hidden = true;
      draw();
    }
  }, true);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !card.hidden) {
      card.hidden = true;
      draw();
    }
  });
  document.addEventListener('fullscreenchange', () => state && setState(state));
  window.addEventListener('resize', () => {
    pos.y = Math.min(pos.y, ground());
  });

  // ---------- Timers & sync ----------

  const animTimer = setInterval(() => {
    frame++;
    if (Math.random() < 0.1) blinkUntil = Date.now() + 160;
    draw();
  }, 260);
  const brainTimer = setInterval(() => {
    if (!contextOk()) return teardown();
    if (!host.isConnected) document.documentElement.append(host); // some SPAs rebuild the DOM
    decide();
  }, 3000);

  const onStorage = (changes) => {
    if (changes[STORAGE_KEY]?.newValue) setState(changes[STORAGE_KEY].newValue);
  };
  chrome.storage.onChanged.addListener(onStorage);
  chrome.storage.local.get(STORAGE_KEY).then((r) => r[STORAGE_KEY] && setState(r[STORAGE_KEY]));

  function teardown() {
    alive = false;
    clearInterval(animTimer);
    clearInterval(brainTimer);
    try { chrome.storage.onChanged.removeListener(onStorage); } catch {}
    host.remove();
  }
}
