import assert from 'node:assert/strict'
import test from 'node:test'
import { escapeHtml, render } from '../src/template.mjs'

test('escapes all HTML-significant characters exactly once', () => {
  assert.equal(escapeHtml(`<a href="x" title='y'>&amp;</a>`), '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;amp;&lt;/a&gt;')
  assert.equal(escapeHtml(5), '5')
})

test('render escapes values in text and attribute contexts', () => {
  const html = render('<p title="{{ title }}">{{body}}</p>', { title: '" onmouseover="alert(1)', body: '<script>alert(1)</script>' })
  assert.equal(html, '<p title="&quot; onmouseover=&quot;alert(1)">&lt;script&gt;alert(1)&lt;/script&gt;</p>')
})

test('missing values throw and values are not re-expanded', () => {
  assert.throws(() => render('Hi {{name}}', {}), ReferenceError)
  assert.throws(() => render('Hi {{name}}', { name: null }), ReferenceError)
  assert.equal(render('{{a}} {{b}}', { a: '{{b}}', b: 'x' }), '{{b}} x')
  assert.equal(render('n={{n}}', { n: 0 }), 'n=0')
})
