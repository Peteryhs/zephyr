// Emits Zephyr's generated CSS into a standalone page that mimics the sidebar
// strip's markup, so a real engine (not a regex) can be asked what the switch
// actually computes to. Mirrors the document stub in run.mjs.
import fs from 'node:fs'

const makeElement = tag => ({
  tagName: tag,
  id: '',
  className: '',
  textContent: '',
  attrs: {},
  children: [],
  style: { cssText: '' },
  setAttribute(key, value) { this.attrs[key] = value },
  appendChild(child) { this.children.push(child); return child },
  remove() {}
})

const styleEls = new Map()
const bodyEls = new Map()

globalThis.document = {
  documentElement: { style: { setProperty() {}, removeProperty() {} } },
  createElement: tag => makeElement(tag),
  getElementById: id => styleEls.get(id) || bodyEls.get(id) || null,
  head: { appendChild: element => { styleEls.set(element.id, element) } },
  body: { appendChild: element => { if (element.id) bodyEls.set(element.id, element) } }
}

const plugin = (await import('./plugin.mjs')).default
plugin.register({
  storage: { get: () => undefined, set() {} },
  register() {},
  registerSettingsPage() {},
  onDispose() {}
})

const css = styleEls.get('zephyr-sky-style')?.textContent
if (!css) throw new Error('no sky style element was written')

const page = `<!doctype html>
<html><head><meta charset="utf-8">
<style>
  * { box-sizing: border-box; }
  /* Measurement aid only: the slide's 220ms is the thing being verified, so the
     probe reads the TARGET halt, not an interpolated frame of it. */
  #track::after { transition: none !important; }
  :root {
    --dt-card: rgba(22, 22, 24, 0.92);
    --ui-base: #101014;
    --ui-accent: #9dc4e8;
    --sidebar-edge-border: rgba(255, 255, 255, 0.18);
    --ui-text-primary: #e6eefa;
    --ui-text-tertiary: #a9bccf;
  }
  /* The app's own strip geometry, reduced to what the switch keys on. */
  #strip { display: flex; width: 400px; }
  #track { display: flex; }
</style>
<style id="zephyr">
${css}
</style>
</head>
<body>
<p style="color:#a9bccf;font:12px system-ui">SESSIONS active (near halt)</p>
<div id="strip" class="bg-(--ui-sidebar-surface-background) group/pane-header">
  <div id="track" role="tablist">
    <div id="t1" data-slot="pane-tab" data-active="true"><span class="pane-tab-content">SESSIONS</span></div>
    <div id="t2" data-slot="pane-tab" data-active="false"><span class="pane-tab-content">BOTS</span></div>
  </div>
</div>
<p style="color:#a9bccf;font:12px system-ui;margin-top:18px">BOTS active (far halt)</p>
<div id="stripB" class="bg-(--ui-sidebar-surface-background) group/pane-header" style="display:flex;width:400px">
  <div role="tablist" style="display:flex">
    <div data-slot="pane-tab" data-active="false"><span class="pane-tab-content">SESSIONS</span></div>
    <div data-slot="pane-tab" data-active="true"><span class="pane-tab-content">BOTS</span></div>
  </div>
</div>
<pre id="out"></pre>
<script>
  const out = []
  const ok = (cond, label) => out.push((cond ? 'PASS  ' : 'FAIL  ') + label)

  const strip = document.getElementById('strip')
  const track = document.getElementById('track')
  const t1 = document.getElementById('t1')
  const t2 = document.getElementById('t2')
  const cs = el => getComputedStyle(el)
  const pill = () => getComputedStyle(track, '::after')

  const s = cs(strip)
  ok(s.paddingBottom === '8px' && s.paddingTop === '14px', 'strip pads 14px above the switch, 8px below (' + s.paddingTop + ' / ' + s.paddingBottom + ')')
  ok(parseFloat(s.height) < 60 && parseFloat(s.height) > 40, 'the switch is compact: strip is ' + s.height + ' tall, not the old 52px')

  const t = cs(track)
  ok(t.borderTopLeftRadius === '999px', 'the tablist is a pill-shaped track (' + t.borderTopLeftRadius + ')')
  ok(t.backgroundColor !== 'rgba(0, 0, 0, 0)', 'the track is filled with the recessed card material (' + t.backgroundColor + ')')
  ok(t.width === s.width, 'the track is exactly as wide as the strip it sits in (' + t.width + ' vs ' + s.width + ')')
  ok(t.marginLeft === t.marginRight, 'the track is centred on the strip (' + t.marginLeft + ' / ' + t.marginRight + ')')
  ok(t.overflow === 'hidden', 'the track clips, so the pill cannot bleed out')
  ok(cs(track).paddingTop === '0px' && cs(track).paddingBottom === '0px', 'no vertical inset: the pill is the track\'s height')

  const p = pill()
  ok(p.content !== 'none' && p.content !== '', 'the pill exists as the track\\'s own ::after (' + p.content + ')')
  ok(Math.abs(parseFloat(p.width) - parseFloat(cs(t1).width)) <= 2, 'the pill is exactly one halt of the track (' + p.width + ' vs a label\'s ' + cs(t1).width + ')')
  ok(p.backgroundColor !== 'rgba(0, 0, 0, 0)', 'the pill wears the raised card material (' + p.backgroundColor + ')')
  ok(parseFloat(p.height) >= parseFloat(t.height) - 3, 'the pill is the track\'s height (' + p.height + ' vs ' + t.height + ')')
  ok(p.transitionProperty.includes('transform'), 'the pill animates transform, so it slides')

  const near = pill().transform
  ok(near === 'none' || near === 'matrix(1, 0, 0, 1, 0, 0)', 'SESSIONS active: the pill rests in the near halt (' + near + ')')

  t1.setAttribute('data-active', 'false')
  t2.setAttribute('data-active', 'true')
  const far = pill().transform
  ok(/matrix\\(1, 0, 0, 1, 172, 0\\)/.test(far), 'BOTS active: the same pill slides to the far halt (' + far + ')')

  const w1 = cs(t1).width
  const w2 = cs(t2).width
  ok(w1 === w2 && parseFloat(w1) > parseFloat(t.width) / 2 - 4, 'each label owns exactly one halt of the track (' + w1 + ' / ' + w2 + ')')
  ok(cs(t1).zIndex === '1', 'the labels paint above the pill (z-index ' + cs(t1).zIndex + ')')
  ok(cs(t1).backgroundColor === 'rgba(0, 0, 0, 0)' && cs(t1).boxShadow === 'none', 'the labels are bare: no box, no underline')
  ok(cs(t1.querySelector('.pane-tab-content')).justifyContent === 'center', 'each label is centred inside its half')

  document.getElementById('out').textContent = out.join('\\n') + '\\n'
</script>
</body></html>`

fs.writeFileSync('/tmp/zv/strip-check.html', page)
console.log('wrote strip-check.html,', css.length, 'chars of generated CSS inlined')
