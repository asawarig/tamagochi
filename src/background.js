import * as Game from './state.js';
import { drawSprite, GRID } from './sprite.js';

const STORAGE_KEY = 'pixelPal';
const IDLE_SECONDS = 120;
const SNOOZE_MINUTES = 15;

// ---------- State access (serialised so ticks and clicks never race) ----------

let queue = Promise.resolve();

async function load() {
  const { [STORAGE_KEY]: saved } = await chrome.storage.local.get(STORAGE_KEY);
  return Game.migrate(saved);
}

function withState(fn) {
  const run = queue.then(async () => {
    const state = await load();
    const result = await fn(state);
    await chrome.storage.local.set({ [STORAGE_KEY]: state });
    await refreshAction(state);
    return result;
  });
  queue = run.catch((err) => console.error(err));
  return run;
}

async function presence() {
  try {
    return await chrome.idle.queryState(IDLE_SECONDS);
  } catch {
    return 'active';
  }
}

// ---------- Toolbar icon + badge ----------

function iconData(state, size) {
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const scale = Math.floor(size / GRID);
  drawSprite(ctx, { stage: Game.stageOf(state).id, mood: Game.moodOf(state) }, scale);
  return ctx.getImageData(0, 0, size, size);
}

async function refreshAction(state) {
  try {
    await chrome.action.setIcon({ imageData: { 16: iconData(state, 16), 32: iconData(state, 32) } });
  } catch (err) {
    console.warn('setIcon failed', err);
  }
  const need = Game.topNeed(state);
  const urgent = need && state.stats[need] < Game.URGENT;
  const show = state.pet.alive && state.pet.hatchedAt && !state.settings.paused && need;
  await chrome.action.setBadgeText({ text: !state.pet.alive ? '✝' : show ? '!' : '' });
  await chrome.action.setBadgeBackgroundColor({ color: urgent || !state.pet.alive ? '#e63946' : '#f4a261' });
  await chrome.action.setTitle({ title: `${state.pet.name}: ${Game.statusLine(state)}` });
}

// ---------- Notifications ----------

async function notify(state, event) {
  if (!state.settings.notifications) return;
  const name = state.pet.name;
  if (event.level === 'died') {
    await chrome.notifications.create(`died:${Date.now()}`, {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: `${name} floated away 👻`,
      message: 'Open the extension to hatch a new egg. Take care of yourself!',
      priority: 2,
    });
    return;
  }
  const stat = Game.STATS[event.stat];
  const done = event.stat === 'hydration' ? 'I drank water' : event.stat === 'movement' ? 'I stood up' : 'Start 20s eye break';
  await chrome.notifications.create(`need:${event.stat}:${Date.now()}`, {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: `${stat.icon} ${name} needs you`,
    message: `${name} ${stat[event.level]}`,
    buttons: [{ title: done }, { title: `Snooze ${SNOOZE_MINUTES} min` }],
    priority: event.level === 'urgent' ? 2 : 1,
    requireInteraction: event.level === 'urgent',
  });
}

async function runEyeBreakFromNotification() {
  await withState((s) => Game.startEyeBreak(s));
  await chrome.notifications.create(`eyebreak:${Date.now()}`, {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: '👀 Eye break started',
    message: 'Look at something about 20 feet (6 m) away for 20 seconds…',
  });
  setTimeout(async () => {
    const credited = await withState((s) => Game.finishEyeBreak(s));
    if (credited && (await load()).settings.notifications) {
      await chrome.notifications.create(`eyebreak-done:${Date.now()}`, {
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: '✨ Eyes rested!',
        message: 'Nice work. You can look back at your screen now.',
      });
    }
  }, Game.EYE_BREAK_SECONDS * 1000);
}

// ---------- Tick ----------

async function tick() {
  const p = await presence();
  const events = await withState((s) => {
    // Finish any eye break the popup started but was closed before completing.
    if (s.eyeBreak) {
      if (Date.now() - s.eyeBreak.startedAt > 5 * 60000) Game.cancelEyeBreak(s);
      else Game.finishEyeBreak(s);
    }
    return Game.tick(s, Date.now(), p);
  });
  const state = await load();
  for (const e of events) await notify(state, e);
}

function ensureAlarm() {
  chrome.alarms.get('tick', (alarm) => {
    if (!alarm) chrome.alarms.create('tick', { periodInMinutes: 1 });
  });
  chrome.idle.setDetectionInterval(IDLE_SECONDS);
}

// ---------- Listeners (registered synchronously at top level) ----------

// Content scripts only run on pages loaded after install, so add the pet to
// tabs that are already open.
async function injectIntoOpenTabs() {
  const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
  for (const tab of tabs) {
    chrome.scripting
      .executeScript({ target: { tabId: tab.id }, files: ['content/loader.js'] })
      .catch(() => {}); // e.g. the Chrome Web Store, which extensions can't touch
  }
}

chrome.runtime.onInstalled.addListener(() => {
  ensureAlarm();
  withState(() => {});
  injectIntoOpenTabs();
});
chrome.runtime.onStartup.addListener(() => {
  ensureAlarm();
  withState(() => {});
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'tick') tick();
});

chrome.idle.onStateChanged.addListener((newState) => {
  withState((s) => Game.tick(s, Date.now(), newState));
});

chrome.notifications.onButtonClicked.addListener(async (id, index) => {
  chrome.notifications.clear(id);
  const [kind, stat] = id.split(':');
  if (kind !== 'need') return;
  if (index === 1) {
    await withState((s) => Game.snooze(s, stat, SNOOZE_MINUTES));
  } else if (stat === 'hydration') {
    await withState((s) => Game.drink(s));
  } else if (stat === 'movement') {
    await withState((s) => Game.stand(s));
  } else if (stat === 'eyes') {
    await runEyeBreakFromNotification();
  }
});

chrome.notifications.onClicked.addListener((id) => {
  chrome.notifications.clear(id);
  chrome.action.openPopup?.().catch(() => {});
});

const ACTIONS = {
  drink: (s) => Game.drink(s),
  stand: (s) => Game.stand(s),
  startEyeBreak: (s) => Game.startEyeBreak(s),
  finishEyeBreak: (s) => Game.finishEyeBreak(s),
  cancelEyeBreak: (s) => Game.cancelEyeBreak(s),
  clearMessage: (s) => { s.message = null; },
  rebirth: (s) => Game.rebirth(s),
  updateSettings: (s, msg) => Game.updateSettings(s, msg.settings),
  hideSite: (s, msg) => Game.hideOnSite(s, msg.host),
  showAllSites: (s) => Game.updateSettings(s, { hiddenSites: [], showOnPages: true }),
  resetEverything: (s) => {
    const fresh = Game.createState(Date.now(), s.settings);
    for (const k of Object.keys(s)) delete s[k];
    Object.assign(s, fresh);
  },
};

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const action = ACTIONS[msg?.type];
  if (!action && msg?.type !== 'getState') return false;
  (async () => {
    if (action) await withState((s) => action(s, msg));
    else await tick();
    sendResponse({ state: await load() });
  })().catch((err) => sendResponse({ error: String(err) }));
  return true; // async response
});

ensureAlarm();
