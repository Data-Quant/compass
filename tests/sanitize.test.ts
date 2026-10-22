import assert from 'node:assert/strict'
import test from 'node:test'
import { stripHtml, stripHtmlOptional } from '../lib/sanitize'

const OLD_TAG_PATTERN = /<\/?[a-zA-Z][^>]*>/g
const OLD_CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g
const oldStripHtml = (input: string) => input.replace(OLD_TAG_PATTERN, '').replace(OLD_CONTROL_CHARS, '')

test('stripHtml removes simple tags', () => {
  assert.equal(stripHtml('<b>hello</b> world'), 'hello world')
})

test('stripHtml removes nested tags that would reassemble after one pass', () => {
  for (const input of ['<scr<script>ipt>alert(1)</script>', '<<script>script>alert(1)<</script>/script>', '<<b>i>x</i>']) {
    const out = stripHtml(input)
    assert.doesNotMatch(out, /<[a-zA-Z/!?]/, input)
  }
  assert.equal(stripHtml('<<b>i>x</i>'), 'x')
})

test('stripHtml leaves no tag opener from an unclosed tag', () => {
  assert.equal(stripHtml('hi <img src=x onerror=alert(1)'), 'hi img src=x onerror=alert(1)')
  assert.equal(stripHtml('</script'), '/script')
  assert.equal(stripHtml('<!-- x'), '!-- x')
})

test('stripHtml drops repeated tag openers', () => {
  for (const input of ['<<script', '<<img src=x onerror=alert(1)//', '<</script']) {
    assert.doesNotMatch(stripHtml(input), /<[a-zA-Z/!?]/, input)
  }
  assert.equal(stripHtml('<<script'), 'script')
})

test('stripHtml stays linear on long runs of <', () => {
  const start = performance.now()
  assert.equal(stripHtml('<'.repeat(100_000) + ' x'), '<'.repeat(100_000) + ' x')
  assert.equal(stripHtml('<'.repeat(100_000) + 'x'), 'x')
  assert.ok(performance.now() - start < 500)
})

test('stripHtml keeps non-tag angle brackets', () => {
  assert.equal(stripHtml('a < b'), 'a < b')
  assert.equal(stripHtml('3<5'), '3<5')
  assert.equal(stripHtml('<50k'), '<50k')
})

test('stripHtml output is unchanged from the old version for ordinary text', () => {
  for (const input of [
    'Off sick, back Monday (doctor note attached).',
    'a < b and c > d',
    'Handover -> Ali, then <-- back',
    'I <3 this team',
    'Score 3<5, 10 > 9',
    '5 << 2 >> 1',
    'Line one\nLine two\ttabbed',
    'Ünïcödé — ✓ 日本語',
    '<b>bold</b> and <i>italic</i>',
    '',
  ]) {
    assert.equal(stripHtml(input), oldStripHtml(input), JSON.stringify(input))
  }
})

test('stripHtml still removes control characters', () => {
  assert.equal(stripHtml('a\u0000b\u0007c\nd\te'), 'abc\nd\te')
})

test('stripHtmlOptional passes null and undefined through', () => {
  assert.equal(stripHtmlOptional(null), null)
  assert.equal(stripHtmlOptional(undefined), undefined)
  assert.equal(stripHtmlOptional('<i>x</i>'), 'x')
})
