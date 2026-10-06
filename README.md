# Local Web Game Player

Local Web Game Player runs compatible local HTML game exports directly in your
browser. It supports RPG Maker MV and MZ, WOLF RPG, and TyranoScript games. You
can open a local game folder or import a ZIP, then play without uploading game
files to a server.

## Demo

https://github.com/user-attachments/assets/56beacfb-855d-4bdf-87a2-8c388e0cc9b1

## Use Case

Many RPG Maker, WOLF RPG, and TyranoScript games are distributed as desktop
applications. This app is useful when playing web exports on Linux or macOS
through a browser.

It can also help with language study. The text overlay makes game text easier to
select with browser tools such as the Yomitan extension. Yomitan is a separate
project and is not included with this app.

## App Flow

1. Open the app in your browser.
2. Open a folder for a large game, or import a ZIP for a smaller portable game.
3. Make sure the folder or ZIP contains game `index.html`.
4. Wait while the app scans the folder or imports the ZIP.
5. Select the game from the library.
6. If a session folder says `not bound`, select it and choose the
   same folder again.
7. Play the game in the player area.
8. Use Focus if the game does not receive keyboard input.
9. Use Fullscreen when you want a larger play view.
10. Use Overlay to collect game text in a readable text log.
11. Use Show to make overlay text visible on top of the game.
12. Use Guard to stop chosen keys from going into the game.
13. Download saves from the library when you want to export save data.

## Web Export Examples

A compatible web export has an `index.html` entry point and all of the assets
needed by the game. RPG Maker MV/MZ exports usually contain folders such as
`js`, `img`, `audio`, and `data`.

Some games keep these files inside a `www` folder:

```text
GameFolder/
  www/
    index.html
    js/
    img/
    audio/
    data/
```

Other games use a flatter layout, often next to files such as `game.exe`:

```text
GameFolder/
  game.exe
  index.html
  js/
  img/
  audio/
  data/
```

TyranoScript exports commonly use this layout:

```text
GameFolder/
  index.html
  tyrano/
  data/
```

WOLF RPG games need a web export produced by Wolf Tools. Open the exported
folder that contains `index.html`, `asset_manifest.json`, and the extracted game
assets. The player loads those assets individually as the game requests them.

Desktop wrapper files such as Electron's `main.js`, `package.json`, and
`node_modules` are not needed for browser playback. The player automatically
uses browser storage for TyranoScript exports that were configured for desktop
file saves.

## Extracting Packaged Desktop Games

Extraction does not guarantee browser compatibility. Games that depend on
unsupported Electron or Node.js APIs may still fail. Encrypted or DRM-protected
packages are also not supported.

### Electron games packaged as `app.asar`

Electron can bundle an application's source files into `app.asar`. The archive
is usually inside `Game.app/Contents/Resources` on macOS or the game's
`resources` folder on Windows. Packaged Linux applications commonly use the
same `resources` folder layout.

Extract the archive into a new folder without modifying the installed game:

```sh
pnpm dlx @electron/asar extract "/path/to/resources/app.asar" "./electron_extract"
```

The current [official `@electron/asar` CLI](https://github.com/electron/asar)
requires Node.js 22.12 or newer.

If `app.asar.unpacked` exists, copy its contents into the extracted folder while
preserving its subdirectories. Then find the folder containing a compatible web
entry point. For TyranoScript, look for `index.html`, `tyrano`, and `data`. For
RPG Maker MV or MZ, look for `index.html`, `js`, and `data`, sometimes inside a
`www` folder. Open that folder in Local Web Game Player.

### Games distributed as a packaged executable

Enigma Virtual Box can bundle a game's files into its Windows executable. The
[official `evbunpack` project](https://github.com/mos9527/evbunpack) provides a
command-line tool and prebuilt Windows releases for extracting these files.

Extract the executable into a new folder without modifying the original game:

```sh
evbunpack "/path/to/Game.exe" "./evb_extract"
```

In the extracted folder, look for the same web entry point and supporting
folders described above. The game files may be nested inside one or more
subdirectories; open the folder that directly contains `index.html`.

## Local Setup

Install dependencies:

```sh
pnpm install
```

Start the development server:

```sh
pnpm run dev
```

Build the app:

```sh
pnpm run build
```

Run tests:

```sh
pnpm run test
```

Preview the production build:

```sh
pnpm run preview
```

## Privacy

The app is built for your own local game files. This project does not provide
game files. Nothing is uploaded by this app or stored on a server.

This is a backendless static web app. It does not need a server database or user
accounts.

Your browser may still limit or clear storage based on its own settings. Export
your saves when you want to keep a backup outside the browser.

ZIP imports are stored in browser storage. Folder opens may be persistent when
the browser supports folder handles, or session-only when it only supports the
older folder picker.

## Notes

This is an unofficial player for user provided web game exports. It is not
affiliated with or endorsed by Gotcha Gotcha Games, KADOKAWA, Degica, SmokingWOLF,
or the TyranoScript project.
