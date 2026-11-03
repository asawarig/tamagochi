// Game rules. Pure functions that mutate a plain state object, so they can be
// unit-tested in Node and used by the background service worker.

export const STAT_KEYS = ['hydration', 'movement', 'eyes'];

export const STATS = {
  hydration: {
    label: 'Hydration',
    icon: '💧',
    setting: 'hydrationMinutes',
    low: 'is getting thirsty. Time for a glass of water!',
    urgent: 'is parched! Please drink some water.',
    short: "I'm thirsty! 💧",
  },
  movement: {
    label: 'Movement',
    icon: '🧍',
    setting: 'movementMinutes',
    low: 'is getting stiff. Stand up and stretch for a minute!',
    urgent: "hasn't moved in ages! Stand up and walk around.",
    short: "Let's stretch! 🧍",
  },
  eyes: {
    label: 'Eye rest',
    icon: '👀',
    setting: 'eyesMinutes',
    low: 'has tired eyes. Look at something far away for 20 seconds.',
    urgent: 'can barely see straight! Give your eyes a 20 second break.',
    short: 'My eyes are tired 👀',
  },
};

export const DEFAULT_SETTINGS = {
  petName: 'Pip',
  hydrationMinutes: 45,
  movementMinutes: 45,
  eyesMinutes: 20,
  waterGoal: 8,
  notifications: true,
  autoDetect: true,
  paused: false,
  showOnPages: true, // the pet roams on top of web pages
  hiddenSites: [], // hostnames where the on-page pet is hidden
};

export const EYE_BREAK_SECONDS = 20;
export const LOW = 50;
export const URGENT = 20;
const XP_PER_ACTION = 10;
const URGENT_REPEAT_MIN = 20;
const MAX_TICK_MIN = 2; // never decay more than this per tick
const SLEEP_GAP_MIN = 5; // a gap longer than this means the computer was asleep
const AWAY_CREDIT_MIN = 3; // away this long (after the idle threshold) counts as a stand-up

export const STAGES = [
  { id: 'egg', label: 'Egg', xp: -1 },
  { id: 'baby', label: 'Baby', xp: 0 },
  { id: 'child', label: 'Child', xp: 80 },
  { id: 'teen', label: 'Teen', xp: 250 },
  { id: 'adult', label: 'Adult', xp: 600 },
];

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const dayKey = (t) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const emptyToday = (now) => ({ date: dayKey(now), water: 0, stand: 0, look: 0 });

export function newPet(now, name, generation = 1) {
  return { name, bornAt: now, hatchedAt: null, xp: 0, alive: true, diedAt: null, generation };
}

const withDefaults = (settings = {}) => {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  s.hiddenSites = Array.isArray(s.hiddenSites) ? [...s.hiddenSites] : [];
  return s;
};

export function createState(now = Date.now(), settings = {}) {
  const s = withDefaults(settings);
  return {
    version: 1,
    settings: s,
    pet: newPet(now, s.petName),
    stats: { hydration: 100, movement: 100, eyes: 100 },
    health: 100,
    lastTick: now,
    presence: 'active',
    awaySince: null,
    eyeBreak: null,
    notified: { hydration: 0, movement: 0, eyes: 0 },
    lastUrgentAt: { hydration: 0, movement: 0, eyes: 0 },
    snoozedUntil: { hydration: 0, movement: 0, eyes: 0 },
    today: emptyToday(now),
    totals: { water: 0, stand: 0, look: 0 },
    best: { generation: 0, days: 0 },
    message: null,
  };
}

/** Fill in any fields missing from older saved states. */
export function migrate(saved, now = Date.now()) {
  if (!saved || saved.version !== 1) return createState(now);
  const fresh = createState(now, saved.settings);
  return { ...fresh, ...saved, settings: withDefaults(saved.settings) };
}

// ---------- Derived values ----------

export const decayPerMinute = (state, key) => LOW / state.settings[STATS[key].setting];

/** Active minutes until a stat falls below the "needs attention" line. */
export function minutesUntilLow(state, key) {
  const v = state.stats[key];
  if (v < LOW) return 0;
  return Math.ceil((v - LOW) / decayPerMinute(state, key));
}

export function stageOf(state) {
  if (!state.pet.hatchedAt) return STAGES[0];
  let stage = STAGES[1];
  for (const s of STAGES) if (s.xp >= 0 && state.pet.xp >= s.xp) stage = s;
  return stage;
}

export function nextStage(state) {
  const i = STAGES.indexOf(stageOf(state));
  return STAGES[i + 1] || null;
}

export function ageDays(state, now = Date.now()) {
  const end = state.pet.alive ? now : state.pet.diedAt;
  const start = state.pet.hatchedAt || state.pet.bornAt;
  return Math.max(0, Math.floor((end - start) / 86400000));
}

export function moodOf(state) {
  if (!state.pet.alive) return 'dead';
  if (state.presence !== 'active' && state.pet.hatchedAt) return 'sleeping';
  const min = Math.min(...STAT_KEYS.map((k) => state.stats[k]));
  if (state.health < 40 || min <= 0) return 'sick';
  if (min < URGENT) return 'sad';
  if (min < LOW) return 'meh';
  if (min >= 75 && state.health >= 80) return 'happy';
  return 'content';
}

/** The most pressing need, or null. */
export function topNeed(state) {
  let worst = null;
  for (const k of STAT_KEYS) {
    if (state.stats[k] < LOW && (!worst || state.stats[k] < state.stats[worst])) worst = k;
  }
  return worst;
}

export function statusLine(state) {
  const name = state.pet.name;
  if (!state.pet.alive) return `${name} has floated away. Hatch a new egg?`;
  if (!state.pet.hatchedAt) return 'Take care of yourself to hatch me! Try drinking some water.';
  if (state.settings.paused) return `${name} is napping while care is paused.`;
  if (state.presence !== 'active') return `${name} is resting while you're away.`;
  const need = topNeed(state);
  if (need) {
    const level = state.stats[need] < URGENT ? 'urgent' : 'low';
    return `${name} ${STATS[need][level]}`;
  }
  if (state.health < 60) return `${name} is recovering. Keep it up!`;
  return `${name} is feeling great!`;
}

// ---------- Mutations ----------

function rollover(state, now) {
  if (state.today.date !== dayKey(now)) state.today = emptyToday(now);
}

function addXp(state, before) {
  // Only reward care that was actually needed, so spamming buttons does nothing.
  if (before < 85) state.pet.xp += XP_PER_ACTION;
}

function hatch(state, now) {
  if (!state.pet.hatchedAt) {
    state.pet.hatchedAt = now;
    state.message = `${state.pet.name} hatched! 🎉`;
    return true;
  }
  return false;
}

function refill(state, key, amount) {
  const before = state.stats[key];
  state.stats[key] = clamp(before + amount, 0, 100);
  if (state.stats[key] >= LOW) {
    state.notified[key] = 0;
    state.snoozedUntil[key] = 0;
  }
  return before;
}

/**
 * Advance time. Returns a list of notification events: {stat, level}.
 * Decay only happens while the user is actively at the screen.
 */
export function tick(state, now = Date.now(), presence = state.presence) {
  const events = [];
  rollover(state, now);
  const gap = Math.max(0, (now - state.lastTick) / 60000);
  state.lastTick = now;

  // A long gap between ticks means the computer was asleep: treat it as time away.
  if (gap > SLEEP_GAP_MIN && state.presence === 'active') updatePresence(state, now, 'locked', gap);
  updatePresence(state, now, presence);

  if (!state.pet.alive || !state.pet.hatchedAt || state.settings.paused) return events;

  if (state.presence === 'active' && gap <= SLEEP_GAP_MIN) {
    const minutes = Math.min(gap, MAX_TICK_MIN);
    for (const k of STAT_KEYS) {
      state.stats[k] = clamp(state.stats[k] - decayPerMinute(state, k) * minutes, 0, 100);
    }
    const empty = STAT_KEYS.filter((k) => state.stats[k] <= 0).length;
    const allOk = STAT_KEYS.every((k) => state.stats[k] >= 40);
    if (empty) state.health = clamp(state.health - 1.5 * empty * minutes, 0, 100);
    else if (allOk) state.health = clamp(state.health + 1 * minutes, 0, 100);

    if (state.health <= 0) {
      state.pet.alive = false;
      state.pet.diedAt = now;
      const days = ageDays(state, now);
      if (days >= state.best.days) state.best = { generation: state.pet.generation, days };
      events.push({ stat: null, level: 'died' });
      return events;
    }
  } else if (state.presence !== 'active' && state.settings.autoDetect) {
    // Not looking at the screen: eyes recover on their own.
    refill(state, 'eyes', 15 * Math.min(gap, 60));
  }

  for (const k of STAT_KEYS) {
    const v = state.stats[k];
    const level = v < URGENT ? 2 : v < LOW ? 1 : 0;
    if (level < state.notified[k]) state.notified[k] = level;
    if (level === 0 || state.presence !== 'active') continue;
    const snoozed = now < state.snoozedUntil[k];
    const escalated = level > state.notified[k];
    const repeat = level === 2 && now - state.lastUrgentAt[k] >= URGENT_REPEAT_MIN * 60000;
    if ((escalated || repeat) && !snoozed) {
      events.push({ stat: k, level: level === 2 ? 'urgent' : 'low' });
      state.notified[k] = level;
      if (level === 2) state.lastUrgentAt[k] = now;
    }
  }
  return events;
}

/**
 * Track whether the user is at the screen. Coming back from a long enough
 * absence (screen locked or no input) counts as having stood up.
 */
export function updatePresence(state, now, presence, gapMin = 0) {
  if (presence === state.presence) return null;
  if (presence !== 'active') {
    state.presence = presence;
    // If the computer slept, the absence started at the last tick, not now.
    state.awaySince = now - gapMin * 60000;
    return null;
  }
  const awayMin = state.awaySince ? (now - state.awaySince) / 60000 : 0;
  state.presence = 'active';
  state.awaySince = null;
  if (!state.settings.autoDetect || !state.pet.alive || !state.pet.hatchedAt || state.settings.paused) return null;
  if (awayMin >= AWAY_CREDIT_MIN) {
    const before = refill(state, 'movement', 100);
    refill(state, 'eyes', 100);
    if (before < 85) {
      state.pet.xp += XP_PER_ACTION / 2;
      state.today.stand += 1;
      state.totals.stand += 1;
    }
    state.message = `Welcome back! ${state.pet.name} noticed you took a break.`;
    return 'welcome';
  }
  return null;
}

export function drink(state, now = Date.now()) {
  rollover(state, now);
  if (!state.pet.alive) return state;
  const hatched = hatch(state, now);
  const before = refill(state, 'hydration', 40);
  addXp(state, before);
  state.today.water += 1;
  state.totals.water += 1;
  if (!hatched) {
    state.message = before >= 95
      ? `${state.pet.name} is full, but water is always good for you!`
      : `Glug glug! ${state.pet.name} feels refreshed.`;
  }
  return state;
}

export function stand(state, now = Date.now()) {
  rollover(state, now);
  if (!state.pet.alive) return state;
  const hatched = hatch(state, now);
  const before = refill(state, 'movement', 100);
  addXp(state, before);
  state.today.stand += 1;
  state.totals.stand += 1;
  if (!hatched) state.message = `${state.pet.name} does a little stretch with you!`;
  return state;
}

export function startEyeBreak(state, now = Date.now()) {
  if (!state.pet.alive) return state;
  state.eyeBreak = { startedAt: now };
  return state;
}

export function cancelEyeBreak(state) {
  state.eyeBreak = null;
  return state;
}

/** Credits the eye break if at least 20s have passed. Returns true if credited. */
export function finishEyeBreak(state, now = Date.now()) {
  if (!state.eyeBreak) return false;
  if (now - state.eyeBreak.startedAt < EYE_BREAK_SECONDS * 1000 - 500) return false;
  state.eyeBreak = null;
  rollover(state, now);
  if (!state.pet.alive) return false;
  const hatched = hatch(state, now);
  const before = refill(state, 'eyes', 100);
  addXp(state, before);
  state.today.look += 1;
  state.totals.look += 1;
  if (!hatched) state.message = `Ahh, much better. ${state.pet.name}'s eyes feel rested.`;
  return true;
}

export function snooze(state, key, minutes, now = Date.now()) {
  state.snoozedUntil[key] = now + minutes * 60000;
  return state;
}

export function rebirth(state, now = Date.now()) {
  const generation = state.pet.generation + 1;
  const keep = { settings: state.settings, totals: state.totals, best: state.best, today: state.today };
  Object.assign(state, createState(now, state.settings), keep);
  state.pet = newPet(now, state.settings.petName, generation);
  return state;
}

export function updateSettings(state, patch) {
  const next = { ...state.settings, ...patch };
  for (const k of ['hydrationMinutes', 'movementMinutes', 'eyesMinutes']) {
    next[k] = clamp(Math.round(Number(next[k]) || DEFAULT_SETTINGS[k]), 5, 240);
  }
  next.waterGoal = clamp(Math.round(Number(next.waterGoal) || DEFAULT_SETTINGS.waterGoal), 1, 20);
  next.showOnPages = next.showOnPages !== false;
  next.hiddenSites = Array.isArray(next.hiddenSites) ? [...new Set(next.hiddenSites.map(String))].slice(0, 200) : [];
  next.petName = String(next.petName || '').trim().slice(0, 16) || DEFAULT_SETTINGS.petName;
  state.settings = next;
  state.pet.name = next.petName;
  return state;
}

export function hideOnSite(state, host) {
  if (host && !state.settings.hiddenSites.includes(host)) {
    state.settings.hiddenSites = [...state.settings.hiddenSites, host];
  }
  return state;
}

/** Whether the on-page pet should be shown on a given hostname. */
export function showsOn(state, host) {
  return state.settings.showOnPages !== false && !state.settings.hiddenSites.includes(host);
}
