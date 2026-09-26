# The 3D and AR lab

Four ways to see the work off the page. `index.html` is the hub.

| Page | What it is | Runs on |
| --- | --- | --- |
| `card.html` | Point a phone at the back of the printed card: the four tiles lift off into pockets and the disc rises out of a slot. Tap a project to open it. `?preview` shows it on a virtual card instead. | Any phone browser with a camera (MindAR image tracking) |
| `desk.html` | A 25 cm model of the same scene to put on a real table. | iPhone (Quick Look, `.usdz`), Android (Scene Viewer or WebXR, `.glb`), any browser in 3D |
| `world.html` | The homepage as a place you scroll through. | Any browser with WebGL |
| `tilt.html` | The card as a live object that moves as you tilt the phone, with a vCard. | Any phone |

Tapping a project anywhere opens the same panel (`js/project-panel.js`, styles at the end of `css/lab.css`): the numbers, what I did, a few screens and the links. Its words live in `js/projects.js`, taken from the homepage and the case studies. That file has no three.js, so plain pages can use it; `js/kit.js` re-exports it.

## The walk-through's lab

`world.html` has a lab for trying it different ways (`js/world-lab.js`). Everything in it is decided, so it only shows with `?lab`; `?lab=0` hides it again in that browser. With the lab off, the page is exactly what's live (the dot on each option marks it). Rows still being decided come first; the rest are folded away under "Locked in".

Names used throughout: the **eclipse** is the whole hero shape, the **disc** its face, the **corona** its ring of colour (the homepage's CSS uses the same three names).

Decided (the lab keeps the alternatives):
- **Motion**: Glide (live): one swipe, key or tap is one stop, on a gentle arc at eye height that looks first and then moves, turning evenly to how it will look at the next pane. Swoop, Sweep and Dive are the same kind of flight on bolder curves; Spring is the first live version, driven by the scroll. See Flights in `js/world.js`.
- **Pace**: Brisk (live), Steady, Slow, for every flight. Clicks in quick succession are gathered up, so the camera sets off once for where they add up to.
- **Info** (wide screens only; phones keep their caption): Close (live), Corner, Beside. On a wide screen each stop stands far enough round its pane that a slice of the next pane shows at the far edge (`peekAngle`), and the view moves with the pointer the way a head does at a window, so reaching towards that slice brings more of it in.

Locked in: Hint Next up, Cards Open, Edge Sharp, Shadows Soft, Opening Above it, Ending On the disc, Sound Deep (all made with Web Audio in `js/world-sound.js`; visitors get a switch in the bar to turn it off, kept in `localStorage 'world-sound'`, and on iPhones it follows the ringer switch except in the lab).

Choices are kept in the browser (dropped when the set of rows changes) and in the address (`?motion=swoop&pace=slow`), so a link opens the same combination. On a keyboard the letter beside each row flips through it and L opens the panel.

`/card` (in the site root) redirects to `card.html`. The printed code points to `https://sheawilson.uk/card`, so that address has to stay live.

## Running it locally

```sh
node ar/tools/serve.mjs            # http://127.0.0.1:4420/ar/
```

The camera needs HTTPS on a phone. On the Home Mac, launchd runs this server (`uk.sheawilson.portfolio-ar`) and Tailscale serves it at `https://sheas-macbook-pro-home.tail05df69.ts.net:19443/ar/`.

## Rebuilding the assets

Start the server with saving switched on, then open the tool page in Chrome:

```sh
AR_SAVE=1 PORT=4421 node ar/tools/serve.mjs
```

- **Card artwork**: `print/card.html` is the source for both sides. After changing it, render `print/card-back.png` (1003 x 650), `card-front.webp` and `card-back.webp` from `print/card.html?side=back` and `?side=front`, and the print art from `?side=front&bleed=1&layer=art` at 600 dpi (`front-art.png`, `back-art.png`). Print the page (or save as PDF) for `print/shea-wilson-card.pdf`: 91 x 61 mm pages, 3 mm bleed.
- **Tracking target**: `http://127.0.0.1:4421/ar/tools/compile.html` compiles `print/card-back.png` into `assets/card.mind`. Any change to the back of the card needs this, and the tile positions in `js/horizon.js` (`TILE`) must match `print/card.html`.
- **Desk model**: `http://127.0.0.1:4421/ar/tools/export-desk.html` builds `assets/models/desk-{light,dark}.{glb,usdz}` from `js/desk-model.js`. Check the USDZ with `usdchecker --arkit ar/assets/models/desk-light.usdz`.

## Things that bit

- MindAR 1.2.5's three.js wrapper only works with three 0.160, so `js/card.js` drives MindAR's `Controller` directly with three r186 (vendored in `vendor/`).
- Quick Look has no stencils, clipping, additive blending or double-sided materials. The desk model uses real holes, backs on every picture, one material per mesh, and emission premultiplied by alpha in linear light.
- three.js exporters write `userData` into the file. Clear it before exporting.
- model-viewer's auto-rotate turns the model (a turntable), not the camera. Before moving the camera to a project on `desk.html`, the turntable's angle is handed to the camera, or "front" can be the back.
- The colour ring's middle is cut out, so from behind you see the disc's reverse, not a solid wheel.
- Chrome's PDF output breaks CSS masks and blur filters, which is why the print file uses rendered art under vector type.
