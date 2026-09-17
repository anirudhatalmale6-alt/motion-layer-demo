# Heliostat — motion layer demo

A working sample of the animation layer described in the brief, built as a
single static page. **Heliostat is a made-up brand** — the page exists to show
the motion, not to sell anything.

Live: open `index.html`, or serve the folder (`python3 -m http.server`).

---

## What is in here

```
index.html          the page. Animation is declared with data-* attributes only
css/base.css        layout, type, colour. Contains NO animation.
css/motion.css      every pre-state, transition and keyframe. All of it.
js/motion.js        the engine: reveals, parallax, tilt, magnets, counters, fps
js/ambient.js       the two canvases (background drift + interactive field)
assets/fonts/       3 self-hosted woff2 files, 60 KB total
```

No build step, no package.json, no dependencies. Open the folder in any editor,
change a file, refresh.

---

## The rule that keeps it maintainable

**`base.css` always describes the page at rest — the finished, static site.
`motion.css` only ever adds (a) a starting state and (b) a transition, and every
one of those rules is gated behind `:root[data-motion="on"]`.**

Three things fall out of that one rule for free:

1. **The Motion on/off switch in the header is a real A/B.** Off is not "a
   faster animation", it is the static page with the animation layer removed.
   Flip it back and forth to see exactly what the layer is contributing.
2. **No JavaScript, no problem.** The document ships as
   `<html data-motion="off">`. If the script never runs — blocked, 404, an old
   browser — every element renders at its final state. Nothing is ever hidden by
   CSS that JavaScript is responsible for un-hiding.
3. **Deleting the layer is one line.** Remove the `motion.css` link and the two
   scripts and you have the original site back, byte for byte.

There is also a fuse: the inline script in `<head>` sets a 3 second timer that
forces `data-motion="off"`, and `motion.js` cancels it on boot. If the engine
ever throws before it initialises, content appears anyway.

---

## The whole API

Animation is declared in the markup. There is nothing else to learn.

| Attribute | Goes on | Does |
|---|---|---|
| `data-reveal="rise"` | any element | rises 48px with a 6° X-rotation and slight scale |
| `data-reveal="left"` / `"right"` | any element | slides in from that side |
| `data-reveal="scale"` | any element | scales up from 0.9 |
| `data-reveal="mask"` | headings | blur-wipe, for large type |
| `data-delay="0.15"` | a reveal | extra delay in seconds |
| `data-stagger="90"` | a **parent** | ms between each child's reveal |
| `data-parallax="0.25"` | decorative layers | scroll speed multiplier; negative reverses |
| `data-tilt` | cards | leans toward the pointer (`data-tilt-max="8"`) |
| `data-magnet` | buttons | pulls toward the pointer (`data-magnet-strength="0.4"`) |
| `data-count="60"` | a number | counts up on reveal (`data-prefix`, `data-suffix`) |

Adding a fifth card to a `data-stagger` group means adding a fifth card. The
delay is handed out by index at runtime, so nothing needs retiming.

Timings live in one place — the `--dur-*` and `--ease-*` custom properties at
the top of `base.css`. Change `--dur-reveal` there and every reveal on the site
changes with it.

---

## How it holds its frame rate

- **One `requestAnimationFrame` loop** drives parallax, tilt, magnets, counters
  and the fps badge. Not one loop per effect.
- **Event listeners only record numbers.** `scroll` stores a number,
  `pointermove` stores two. Nothing reads layout inside a listener, so there is
  no read/write thrash.
- **Positions are measured on resize, not on scroll** — `getBoundingClientRect`
  is called when the layout can actually have changed, and cached in between.
- **Only `transform` and `opacity` are written.** No `top`, no `left`, no
  `width`. That keeps every frame on the compositor: no layout, no repaint.
- **Off-screen work is skipped**, `IntersectionObserver` releases each element
  the moment it has revealed, and the loop idles when the tab is hidden.
- **The canvases cap device pixel ratio at 2** and scale particle count to the
  viewport — a phone draws roughly a third of what a desktop does.
- **Pointer effects are switched off entirely on `pointer: coarse`.** Tilt and
  magnets cost battery and do nothing useful on a touch screen.

Deliberately avoided: `filter: blur()` on anything that animates (it re-rasterises
every frame — it was the single most expensive thing here before it was removed),
scroll-linked layout reads, and `will-change` left on permanently.

---

## Accessibility

`prefers-reduced-motion: reduce` is honoured properly, not cosmetically: the
ambient canvas is never started, the interactive field draws one still frame,
every reveal resolves instantly, and the counters print their final value. The
page is fully usable by keyboard, focus rings are visible, and all motion
elements are `aria-hidden` where they carry no meaning.

---

## Fonts

Bricolage Grotesque, Instrument Sans and Martian Mono (all SIL Open Font
License). They are subset to Latin and instanced to the weights actually used,
which took them from 117 KB to 60 KB. To regenerate after changing them:

```sh
pyftsubset font.woff2 --unicodes="U+0020-007E,U+00A0-00FF,U+2010-2015,U+2018-201D,U+2022,U+2026,U+00B7,U+00D7,U+25C6,U+2192,U+2713,U+00B0" \
  --layout-features='kern,liga,calt,tnum' --flavor=woff2 --output-file=font.sub.woff2
python3 -m fontTools.varLib.instancer font.sub.woff2 wght=700:800 opsz=36 -o font.woff2
```

---

## Measured on this build

All figures below were measured, not estimated — see `VERIFICATION.md`.

| | |
|---|---|
| Total payload | **83 KB** over the wire across 8 requests (130 KB uncompressed) |
| Third-party requests | 0 |
| Frame time, idle | 16.7 ms median (60fps), 0 frames over 33 ms |
| Frame time, scrolling | 16.7 ms median, 56 fps mean, 13 dropped frames in 209 |
| Horizontal overflow | 0 px at 1440 / 1280 / 768 / 390 / 320 |
| Console errors | 0, in Chromium, Firefox and WebKit |
