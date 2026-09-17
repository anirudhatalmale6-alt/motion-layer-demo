# How the numbers in the README were measured

Everything here was run against the page served over HTTP (not `file://`), in
Playwright, on a headless Linux box with **no GPU — software rasterisation**.
That matters: it is a pessimistic environment. A real laptop or phone with GPU
compositing will do better, not worse.

## Payload — 130 KB / 8 requests / 0 third-party

Read from the page itself, at runtime, via the Resource Timing API
(`performance.getEntriesByType('resource')` plus the navigation entry's
`transferSize`). This is why the hero and the stats show the figure live rather
than a number typed into the HTML — if a file is added, the number moves.

The third-party count is the number of resource entries whose URL does not start
with `location.origin`. It is 0. No CDN, no font service, no analytics.

## Frame timing

Sampled inside the page by chaining `requestAnimationFrame` and recording the
delta between callbacks — the same clock the browser paints on.

| | median | p95 | worst | mean fps | frames > 33 ms |
|---|---|---|---|---|---|
| Idle on the hero (ambient canvas running) | 16.7 ms | 16.8 ms | 16.8 ms | 60.0 | 0 of 179 |
| Scrolling the full page, motion ON | 16.7 ms | 33.3 ms | 50 ms | 56.2 | 13 of 209 |
| Same scroll, motion OFF (control) | 16.7 ms | 16.7 ms | 16.8 ms | 60.0 | 0 of 164 |

The motion-off row is the control. It is what the static page costs, and it is
the honest way to read the other row: on a GPU-less machine, under continuous
wheel scrolling, the animation layer costs about 6% of frames. The median frame
is on budget in all three cases.

An earlier build of this page measured **15 fps** on the hero. The cause was a
`filter: blur(90px)` on two half-viewport elements that were also animating —
the browser re-rasterised the blur every frame. Replacing the blur with a soft
radial gradient (visually the same) took it from 15 fps to 60. That fix is why
the README is emphatic about not animating filtered elements.

## Layout — 0 px horizontal overflow

Measured at 1440, 1280, 768, 390 and 320 px wide.

The naive check is `documentElement.scrollWidth - clientWidth`. On this page
that check **lied**: `body { overflow-x: clip }` (needed to contain the
decorative background layers) was hiding a genuine 102 px overflow, and the
check read 0 while a phone was quietly shrinking the whole layout to fit. The
tell was `window.innerWidth` (492) disagreeing with
`documentElement.clientWidth` (390) under mobile emulation.

So the real check lifts the clip first, then measures, then puts it back. The
cause turned out to be the reveal pre-states themselves: an element waiting to
slide in from the right sits 64 px off-screen, invisible but still counted. The
offset is now capped to the page gutter, and the sections that hold horizontal
reveals use `overflow-x: clip`. After the fix, `innerWidth`, `clientWidth` and
`scrollWidth` agree at every width tested.

## Cross-browser

The full page was driven — load, scroll through all seven sections, hover, tilt,
magnet, motion toggle — in **Chromium, Firefox and WebKit**. Zero page errors and
zero console errors in all three. Reveal coverage was asserted programmatically:
after walking the page, the count of `[data-reveal]` elements still below 0.5
opacity is **0**.

That assertion caught a real bug. `IntersectionObserver` samples once per frame,
so a jump — clicking a nav anchor, pressing End, a restored scroll position —
can carry an element from below the fold to above it between two samples, and
the observer never sees it intersect. Two elements stayed invisible permanently.
There is now a cheap sweep that catches anything the page has already scrolled
past; it only runs while elements are still waiting, and empties itself as it goes.

## Degraded modes

| Mode | Result |
|---|---|
| `prefers-reduced-motion: reduce` | `data-motion` never turns on, canvases draw one still frame, 0 elements hidden, counters show final values |
| JavaScript disabled entirely | Page renders complete and correct — verified by screenshot with `java_script_enabled=False` |
| Motion toggled off by the user | 0 elements hidden, 0 inline transforms left behind on parallax layers |
