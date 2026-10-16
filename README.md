<p align="center">
  <img src="assets/hero.png" alt="Zephyr: a better UI for Hermes Agent, lit by the real sky" width="100%">
</p>

# Zephyr

A better UI for Hermes Agent, lit by the real sky.

Zephyr is a plugin for the Hermes Agent desktop app. It puts a live, realistic sky behind the app and changes the app's colours as the day goes by. It also adds a few small things that make chatting with your agent calmer: snippet cards you can save, a tidier status bar and roomier margins.

It's one JavaScript file. There's no build step, and it doesn't modify Hermes itself, so updating the app won't undo it.

<p align="center">
  <img src="assets/sky-day.png" alt="The Zephyr sky at dawn, midday, dusk and night" width="100%">
</p>

## Features

**A sky that follows the real sun.** The background shows the sky where you are, right now. The sun rises and sets on time, twilight brings its own colours, and night goes dark.

**Live weather.** Clouds follow your local weather. If you prefer one look, you can hold the sky on a fixed type: clear, cumulus, cirrus, overcast, rain, storm, fog and more.

<p align="center">
  <img src="assets/sky-weather.png" alt="The same sky under clear, cloudy, stormy and foggy weather" width="100%">
</p>

**Time-of-day themes.** Hermes switches between dawn, day, dusk and night themes as the sun moves. The accent colour (links, buttons, selection) can shift too.

**Glass panels.** The panels pick up a soft tint from the sky behind them, and they go darker at night so text stays easy to read.

**Snippet cards.** Your agent can show short facts as clean cards in the chat, for example a build size, a command or a time. You can copy a card, pin it to your library, or drag it onto the Shelf on the new-chat screen.

**Calmer chat.**
- Spacious margins: a narrower reading column that lines up with the message box.
- Fold finished work: when a reply is done, its thinking and tool steps fold into one line that shows how long it took.
- Status panel: in Simple mode, the status bar (model, context, agents, radio) becomes a card in the sessions sidebar. Drag a status row onto the panel title to pin it.

## Install

1. Download `plugin.js` from this repository.
2. Create a folder named `zephyr` inside your Hermes plugins folder:
   ```
   <HERMES_HOME>/desktop-plugins/zephyr/
   ```
3. Put `plugin.js` in that folder.
4. Restart Hermes Agent. Zephyr appears in Settings with its own icon.

To remove Zephyr, delete the `zephyr` folder and restart Hermes.

## Settings

Open **Settings > Zephyr**.

| Setting | What it does |
| --- | --- |
| Sky | Shows the sky behind the app. Off gives a plain dark background. |
| Realistic sky | Uses the full WebGL sky. Off, or on a device without WebGL, you get a lighter painted gradient. |
| Weather | Live weather, or one fixed sky type. |
| Smoothness | Low, Balanced or High (4, 8 or 16 frames a second). Clouds drift slowly, so Balanced looks the same as High and uses half the power. |
| Preview a day | Plays the next 24 hours of sky in one minute, then goes back to now. |
| Time-of-day themes | Switches Hermes between the dawn, day, dusk and night themes. Off keeps the theme you picked in Appearance. |
| Tint the accent | Shifts the accent colour to match the time of day. |
| Spacious margins | A narrower reading column with wide margins. |
| Fold finished work | Folds finished replies' steps into one line. |
| Status panel in Simple mode | Moves the status bar into the sessions sidebar. |
| Snippet library | Shows the Snippets card in the sidebar with everything you've pinned. |

## Snippet cards

<p align="center">
  <img src="assets/snippets.png" alt="Three snippet cards over the dusk sky" width="100%">
</p>

An agent shows a snippet card by writing a line like this in its reply:

```
::snippet{title="Build size" value="412 KB" note="gzip, down 9% from last release"}
```

| Field | Required | Meaning |
| --- | --- | --- |
| `value` | Yes | The main text, shown large. |
| `title` | No | A small label above the value. |
| `note` | No | A short line of extra context. |
| `source` | No | Where the value came from, shown small. |
| `tone` | No | Set to `accent` to colour the title with the accent colour. |

Click a card to preview it. From the preview you can copy it or attach it to the chat.

## Performance

The sky is built to stay light:

- It draws at 8 frames a second by default.
- It drops to 1 frame a second when the window isn't focused, and stops when the window is hidden.
- It respects your system's reduced-motion setting.

If your machine still runs warm, set **Smoothness** to Low or turn off **Realistic sky**.

## Privacy

Zephyr doesn't ask for your location. It works out a nearby city from your system time zone, then gets sunrise, sunset and current weather from [Open-Meteo](https://open-meteo.com), a free weather service that needs no account or key. Nothing else leaves your computer.

## For developers

- Everything lives in `plugin.js`, a plain ES module. The Hermes loader reads only that file and allows imports from `@hermes/plugin-sdk` and `react` only.
- The file is split into numbered sections (`§1` to `§9`). The contents list at the top says what each one covers. Search for `══ §6` to jump to a section.
- §6 is generated: the sky engine's sources live in `sky/`, and `node scripts/build-sky.mjs` writes them into `plugin.js` between the engine banner and its closing line. Edit `sky/`, run the build, commit both. `node scripts/check.mjs` fails when the two have drifted apart.
- Before you open a pull request, run `npm test` (the engine's 29 CPU checks), `npm run check`, and `node tests/sky-rig.mjs` (the engine wired inside the plugin, against a mock driver), then test the change in the app.

## The sky engine

The sky is an independent implementation of an observed dynamic sky, written from
[docs/rebuild-specification.md](docs/rebuild-specification.md) rather than from anyone else's
source. The atmospheric colours come from an independent Rayleigh/Mie bake in `scripts/`, not from a
shared asset. `docs/sky-engine.md` covers the modules, the frame API and the bake,
`docs/compatibility.md` lists the deliberate differences, and
[docs/verification.md](docs/verification.md) records what was checked and what was not.

## Credits

Weather and sunrise data come from [Open-Meteo](https://open-meteo.com).

## License

No license has been chosen yet. Add a `LICENSE` file before you share this repository publicly.
