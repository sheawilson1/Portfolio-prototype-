# The 3D and AR lab

Four ways to see the work off the page. `index.html` is the hub.

| Page | What it is | Runs on |
| --- | --- | --- |
| `card.html` | Point a phone at the back of the printed card: the four tiles lift off into pockets and the disc rises out of a slot. Tap a project to open it. `?preview` shows it on a virtual card instead. | Any phone browser with a camera (MindAR image tracking) |
| `desk.html` | A 25 cm model of the same scene to put on a real table. | iPhone (Quick Look, `.usdz`), Android (Scene Viewer or WebXR, `.glb`), any browser in 3D |
| `world.html` | The homepage as a place you scroll through. | Any browser with WebGL |
| `tilt.html` | The card as a live object that moves as you tilt the phone, with a vCard. | Any phone |

Tapping a project anywhere opens the same panel (`js/project-panel.js`, styles at the end of `css/lab.css`): the numbers, what I did, a few screens and the links. Its words live in `js/projects.js`, taken from the homepage and the case studies. That file has no three.js, so plain pages can use it; `js/kit.js` re-exports it.

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
