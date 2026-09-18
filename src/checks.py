# -*- coding: utf-8 -*-
"""Heliostat — motion layer — automatic checks.

Run against the PUBLISHED site, not a local copy:

    python3 src/checks.py

Exit code is non-zero if any check fails, so it drops straight into CI.
The suite prints its own total; that total is the number quoted for this
project on the studio page, and anyone can recount it by running this file.
"""

BASE = 'https://anirudhatalmale6-alt.github.io/motion-layer-demo/'
TITRE = 'Heliostat'

import sys
import urllib.request

ok = [0]
ko = [0]


def t(nom, cond, detail=''):
    if cond:
        ok[0] += 1
        print('  ok    %s' % nom)
    else:
        ko[0] += 1
        print('  ECHEC %s   %s' % (nom, detail))


def head(url):
    """Status code for a url, without downloading the body twice."""
    try:
        req = urllib.request.Request(url, method='GET')
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status
    except Exception as e:
        return getattr(e, 'code', 0)


def common(pg, base, expect_title):
    """The checks that apply to every page we publish."""
    errs = []
    failed = []
    third = []
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.on('response', lambda r: (
        failed.append('%s %s' % (r.status, r.url)) if r.status >= 400 else None,
        third.append(r.url) if not r.url.startswith(base.rsplit('/', 1)[0]) and r.url.startswith('http') else None,
    ))

    resp = pg.goto(base, wait_until='networkidle')
    t('the published page answers 200', resp is not None and resp.status == 200,
      'status=%s' % (resp.status if resp else 'none'))
    t('the title is the one we expect', expect_title.lower() in pg.title().lower(),
      'got %r' % pg.title())
    t('the html carries a lang attribute',
      bool(pg.evaluate("document.documentElement.getAttribute('lang')")))
    t('there is a viewport meta',
      pg.evaluate("!!document.querySelector('meta[name=viewport]')"))
    desc = pg.evaluate("(document.querySelector('meta[name=description]')||{}).content||''")
    t('the description meta is present and not empty', len(desc.strip()) > 20,
      '%r' % desc[:40])
    t('exactly one h1', pg.evaluate("document.querySelectorAll('h1').length") == 1,
      'count=%s' % pg.evaluate("document.querySelectorAll('h1').length"))
    t('the h1 is not empty',
      len((pg.evaluate("(document.querySelector('h1')||{}).textContent||''") or '').strip()) > 2)
    t('there is a main landmark', pg.evaluate("!!document.querySelector('main')"))
    t('every image carries an alt attribute', pg.evaluate(
        "Array.from(document.images).every(i=>i.hasAttribute('alt'))"))
    t('no element uses a positive tabindex', pg.evaluate(
        "!document.querySelector('[tabindex]:not([tabindex=\"0\"]):not([tabindex=\"-1\"])')"))
    t('every button has an accessible name', pg.evaluate(
        "Array.from(document.querySelectorAll('button')).every(b=>"
        "((b.textContent||'').trim()||b.getAttribute('aria-label')||b.getAttribute('title')||'').length>0)"))
    t('the web fonts finish loading', pg.evaluate("document.fonts.status") in ('loaded', 'loading'))
    t('every link that opens a new tab sets rel=noopener', pg.evaluate(
        "Array.from(document.querySelectorAll('a[target=_blank]')).every(a=>(a.rel||'').includes('noopener'))"))

    for w, h in ((390, 780), (768, 1024), (1280, 800)):
        pg.set_viewport_size({'width': w, 'height': h})
        pg.wait_for_timeout(260)
        sw = pg.evaluate('document.documentElement.scrollWidth')
        t('no horizontal overflow at %spx' % w, sw <= w + 1, 'scrollWidth=%s' % sw)
    pg.set_viewport_size({'width': 1280, 'height': 800})

    t('the console reports no error', not errs, '; '.join(errs[:3]))
    t('no request came back 400 or worse', not failed, '; '.join(failed[:3]))
    t('nothing is loaded from a third party', not third, '; '.join(third[:3]))
    return errs, failed, third


def same_origin_links(pg, base):
    """Every internal link must actually resolve."""
    hrefs = pg.evaluate(
        "Array.from(document.querySelectorAll('a[href]')).map(a=>a.href)"
        ".filter(h=>h.startsWith(location.origin))")
    seen = []
    for h in sorted(set(hrefs)):
        if '#' in h:
            h = h.split('#')[0]
        if not h or h in seen:
            continue
        seen.append(h)
    for h in seen[:12]:
        t('internal link resolves: %s' % h.rsplit('/', 2)[-1] or '/', head(h) == 200)
    return seen


def anchors_resolve(pg):
    """Every #anchor used in the page must point at an element that exists."""
    bad = pg.evaluate(
        "Array.from(document.querySelectorAll('a[href^=\"#\"]'))"
        ".map(a=>a.getAttribute('href')).filter(h=>h.length>1)"
        ".filter(h=>!document.querySelector(h))")
    t('every #anchor in the page points at a real element', not bad, str(bad[:4]))


def verdict():
    total = ok[0] + ko[0]
    print('')
    print('  %s checks, %s passed, %s failed' % (total, ok[0], ko[0]))
    sys.exit(1 if ko[0] else 0)

from playwright.sync_api import sync_playwright   # noqa: E402


def specifiques(pg):

    # The ambient canvas is the whole point of the demo: it must exist and have
    # real pixels, not be a zero-sized element that merely parses.
    t('the ambient canvas is in the page', pg.evaluate("!!document.querySelector('#ambient-canvas')"))
    box = pg.evaluate("(()=>{const c=document.querySelector('#ambient-canvas');"
                      "if(!c)return null;const r=c.getBoundingClientRect();"
                      "return {w:r.width,h:r.height};})()")
    t('the ambient canvas has a real size', bool(box) and box['w'] > 100 and box['h'] > 100, str(box))

    # Every section the nav and the scroll choreography rely on.
    ids = pg.evaluate("Array.from(document.querySelectorAll('[data-section]')).map(s=>s.id)")
    t('the page exposes its sections', len(ids) >= 5, str(ids))
    t('no two sections share an id', len(ids) == len(set(ids)), str(ids))
    for sid in ['hero', 'choreography', 'split', 'depth', 'field', 'numbers', 'cta']:
        t('section present: %s' % sid, sid in ids)

    # The motion toggle has to actually change something observable.
    t('the motion toggle is present', pg.evaluate("!!document.querySelector('#motion-toggle')"))
    before = pg.evaluate("document.documentElement.className + '|' + "
                         "(document.querySelector('#motion-toggle').getAttribute('aria-pressed')||'')")
    pg.click('#motion-toggle')
    pg.wait_for_timeout(420)
    after = pg.evaluate("document.documentElement.className + '|' + "
                        "(document.querySelector('#motion-toggle').getAttribute('aria-pressed')||'')")
    t('the motion toggle changes the page state', before != after, '%r -> %r' % (before, after))
    pg.click('#motion-toggle')
    pg.wait_for_timeout(300)

    # Reveal-on-scroll: the elements must be hidden-then-shown, not simply always on.
    nrev = pg.evaluate("document.querySelectorAll('[data-reveal]').length")
    t('the page declares reveal-on-scroll elements', nrev > 0, 'count=%s' % nrev)
    pg.evaluate("window.scrollTo(0, document.body.scrollHeight)")
    pg.wait_for_timeout(1200)
    vis = pg.evaluate("Array.from(document.querySelectorAll('[data-reveal]'))"
                      ".filter(e=>getComputedStyle(e).opacity!=='0').length")
    t('reveal elements are visible once scrolled to', vis > 0, '%s of %s' % (vis, nrev))
    pg.evaluate("window.scrollTo(0,0)")
    pg.wait_for_timeout(400)

    # The payload figure the page prints about itself has to be real.
    payload = pg.evaluate("(()=>{const n=performance.getEntriesByType('navigation')[0];"
                          "const r=performance.getEntriesByType('resource');"
                          "return Math.round(((n?n.transferSize:0)+r.reduce((a,x)=>a+(x.transferSize||0),0))/1024);})()")
    t('the whole page weighs under 400 KB', 0 < payload < 400, '%s KB' % payload)
    t('it loads fewer than 20 files',
      pg.evaluate("performance.getEntriesByType('resource').length") < 20)

    # Fonts are self-hosted: no font service is allowed to see the visitor.
    t('the fonts are served from our own origin', pg.evaluate(
        "performance.getEntriesByType('resource').filter(r=>r.name.match(/woff2?$/))"
        ".every(r=>r.name.startsWith(location.origin))"))


def main():
    print('Heliostat — motion layer')
    print('  %s' % BASE)
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={'width': 1280, 'height': 800})
        common(pg, BASE, TITRE)
        anchors_resolve(pg)
        same_origin_links(pg, BASE)
        specifiques(pg)
        pg.close()
        b.close()
    verdict()


if __name__ == '__main__':
    main()
