# Giant Tour de Sip

A bike-factory party drinking board game. The board is shown on a TV (any web browser), and
2 to 8 players join by scanning a QR code with their phones. Phones are the
controllers: roll the dice, vote in secret, hold hidden cards, and play them to
save yourself.

For adults of legal drinking age. A "sip" can be any drink, water included.

## What you need

| Thing | Why |
| --- | --- |
| A computer or a free hosting account | Runs the small game server (`server.js`) |
| [Node.js](https://nodejs.org) 18 or newer | The only requirement. No packages to install |
| A TV with a web browser | Shows the board. A laptop on HDMI or a Chromecast tab works too |
| Phones with a camera | Each player scans the QR code. No app needed |

## Run it at home (same Wi-Fi)

```
node server.js
```

The terminal prints two addresses. Open the one with numbers (for example
`http://192.168.1.20:3000`) in the TV browser. Phones on the same Wi-Fi scan the
QR code on the TV. If phones cannot connect, allow Node.js through the computer's
firewall.

## Put it on the internet

The project has no dependencies and no build step, so any Node host works. The
start command is `node server.js` and it listens on the `PORT` the host provides.

- **Render**: push this folder to a GitHub repo, then New > Web Service, pick the
  repo, build command empty, start command `node server.js`. (`render.yaml` is included.)
- **Railway / Fly.io / a VPS**: same start command. A `Dockerfile` is included.

Then open your site address on the TV. The QR code automatically points phones at
the same address.

Notes:
- Run a single instance. Rooms live in memory, so they reset if the server restarts.
- Free hosting tiers go to sleep when idle; the first load can take a minute.

## How to play

Full rules are in the game at `/rules` and in `RULES.md`.

1. TV shows a QR code. Everyone scans, enters a name, picks a rider.
2. The first player to join is the host and presses Start.
3. On your turn, press Roll on your phone and do what the house says. Everyone takes one sip before their first roll.
4. The road has 50 houses with Emergency Meeting and Oh No card decks. First to the Finish house wins, makes a toast, and everybody drinks.

## Project layout

```
server.js            web server, rooms, live updates (Server-Sent Events)
lib/game.js          all game rules (turns, mini games, cards)
lib/content.js       the board, both card decks, the rules, every question  <- edit me
lib/qr.js            QR code generator
public/tv.*          the TV screen
public/phone.*       the phone controller
public/rules.html    rules page
public/assets/       all images (SVG)
public/assets/deck/  artwork cut from the printed Emergency Meeting and Oh No cards
tools/make-assets.js regenerates every image
test/sim.js          bots play full games to check nothing gets stuck
```

## Updating the live game

Upload the changed files to the same GitHub repository (Add file > Upload files, drag everything in, Commit).
Render redeploys by itself a minute or two later.

## Make it yours

- **Questions, board layout, sip amounts, card decks, rules**: edit `lib/content.js` and restart. Each Emergency Meeting / Oh No card is one line: its text, its picture and what it does.
- **Art and colours**: edit `tools/make-assets.js`, then run `node tools/make-assets.js`.
- **Check your changes**: `node test/sim.js` plays 60 full games with bots (takes about two minutes).

This is a fan-made party game. It is not an official Giant Bicycles product.
