# Pixel Pal: a Tamagotchi that runs on healthy habits

A Chrome extension with a virtual pet that you keep alive by taking care of **yourself**, not by feeding it.

| Your pet needs… | You do… |
| --- | --- |
| 💧 **Hydration** | Drink a glass of water |
| 🧍 **Movement** | Stand up and stretch |
| 👀 **Eye rest** | Look ~20 ft (6 m) away for 20 seconds (the 20-20-20 rule) |

## Your pet follows you around the web 🐾

Pixel Pal lives on every web page you visit, like a little desktop pet:

- It **wanders along the bottom of the page** when it's happy, slows down when it's needy, and naps (z z) when you step away.
- When it needs something, a **speech bubble** pops up ("I'm thirsty! 💧").
- **Click it** to open a care card with its stats and Drink / Stand up / Look away buttons. During an eye break the countdown shows above its head.
- **Drag it** anywhere. Let go and it falls back down ("Whee!").
- It never gets in your way: only the pet itself catches the mouse, it hides when a video goes fullscreen, and its styles are isolated from the page.
- Don't want it somewhere? Use **Hide on this site** or **Hide everywhere** on the card. You can bring it back from the popup's settings.

> Chrome extensions can only draw inside browser tabs. The pet can't appear over other apps or on Chrome's own pages (`chrome://…`, the Chrome Web Store).

## How it works

- **Hatching:** your pet starts as an egg. Your first healthy action hatches it.
- **Needs drop only while you're at the screen.** The extension uses Chrome's `idle` API, so stats freeze when you're away, the screen is locked or the computer is asleep. Your pet won't die overnight.
- **Stepping away counts.** If you're away for a few minutes (screen locked or no input), Pixel Pal assumes you got up and refills Movement and Eye rest. You can turn this off in settings.
- **Reminders:** you get a desktop notification when a need runs low, and another when it's urgent. Notifications have buttons, so you can log "I drank water" or start an eye break without opening the popup, or snooze for 15 minutes.
- **Health:** when a need hits zero, health drains. If health reaches zero, your pet floats away 👻 and you can hatch a new egg.
- **Growing up:** care your pet actually needed earns XP: Egg → Baby → Child → Teen (grows a sprout 🌱) → Adult (it blooms 🌼). Pressing buttons repeatedly when your pet doesn't need anything earns nothing.
- **Toolbar icon:** shows your pet's current mood, with a `!` badge when it needs something.
- **Settings:** pet name, how often each reminder fires, daily water goal, notifications, away detection, and a **pause** switch for meetings or vacations.

Default reminder intervals: water every 45 min, stand up every 45 min, eyes every 20 min. A need reaches "needs attention" (50%) after that many active minutes, and empties after twice that.

## Install (developer mode)

1. Clone this repo.
2. Open `chrome://extensions` and turn on **Developer mode** (top right).
3. Click **Load unpacked** and pick the repo folder.
4. Pin Pixel Pal to your toolbar and click it to meet your egg.

## Project layout

```
manifest.json        MV3 manifest (permissions: storage, alarms, notifications, idle, scripting; all sites for the on-page pet)
src/state.js         Game rules: decay, health, XP/stages, actions (pure, unit-tested)
src/sprite.js        Procedural 16×16 pixel-art pet (shared by popup, toolbar icon, icon generator)
src/background.js    Service worker: 1-minute tick, idle detection, notifications, toolbar icon
popup/               The handheld-style popup UI
content/             The on-page pet that roams the bottom of every page
tools/make-icons.mjs Regenerates icons/*.png from the sprite (npm run icons)
test/                Node unit tests (npm test)
```

## Development

```bash
npm test        # run game-logic tests (Node 18+)
npm run icons   # regenerate the PNG icons
```
After editing, click the reload ↻ button on the extension card in `chrome://extensions`.
