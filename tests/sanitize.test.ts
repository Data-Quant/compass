import assert from 'node:assert/strict'
import test from 'node:test'
import { stripHtml, stripHtmlOptional } from '../lib/sanitize'

const OLD_TAG_PATTERN = /<\/?[a-zA-Z][^>]*>/g
const OLD_CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g
const oldStripHtml = (input: string) => input.replace(OLD_TAG_PATTERN, '').replace(OLD_CONTROL_CHARS, '')

// Reference: the previous (quadratic) loop implementation, kept here only to
// prove the single-pass version in lib/sanitize.ts gives identical output.
function loopStripHtml(input: string): string {
  const tag = /<\/?[a-zA-Z][^<>]*>/g
  let output = input
  let previous: string
  do {
    previous = output
    output = output.replace(tag, '')
  } while (output !== previous)
  return output
    .replace(/<+/g, (run, offset: number, str: string) => (/[a-zA-Z/!?]/.test(str.charAt(offset + run.length)) ? '' : run))
    .replace(OLD_CONTROL_CHARS, '')
}

// mulberry32: small seeded PRNG so the property test is reproducible.
function seededRandom(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const EXPLICIT_CASES = [
  '<b>hello</b> world',
  '<scr<script>ipt>alert(1)</script>',
  '<<script>script>alert(1)<</script>/script>',
  '<<b>i>x</i>',
  'hi <img src=x onerror=alert(1)',
  '</script',
  '<!-- x',
  '<<script',
  '<<img src=x onerror=alert(1)//',
  '<</script',
  'a < b',
  '3<5',
  '<50k',
  'Off sick, back Monday (doctor note attached).',
  'a < b and c > d',
  'Handover -> Ali, then <-- back',
  'I <3 this team',
  'Score 3<5, 10 > 9',
  '5 << 2 >> 1',
  'Line one\nLine two\ttabbed',
  'Ünïcödé — ✓ 日本語',
  '<b>bold</b> and <i>italic</i>',
  '<a href="x">y</a>',
  '<br/>line',
  '<a title="1 > 0">y</a>',
  '<a<b>x',
  'a\u0000b\u0007c\nd\te',
  '<b\u0000>x</b>',
  '',
]

test('single-pass stripHtml equals the loop reference on explicit cases', () => {
  for (const input of EXPLICIT_CASES) {
    assert.equal(stripHtml(input), loopStripHtml(input), JSON.stringify(input))
  }
})

test('single-pass stripHtml equals the loop reference on 5000 random strings', () => {
  // Weighted toward the characters the tag grammar cares about.
  const alphabet = '<<<<<>>>>>///abbsZ  "\'1!?-\u0000\n'
  const random = seededRandom(20261023)
  for (let i = 0; i < 5000; i++) {
    const length = Math.floor(random() * 41)
    let input = ''
    for (let j = 0; j < length; j++) input += alphabet[Math.floor(random() * alphabet.length)]
    assert.equal(stripHtml(input), loopStripHtml(input), JSON.stringify(input))
  }
})

test('stripHtml stays linear on deeply nested tags', () => {
  const n = 50_000
  const start = performance.now()
  assert.equal(stripHtml('<'.repeat(n) + 'b>'.repeat(n)), '')
  assert.ok(performance.now() - start < 500)
})

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

test('stripHtml stays linear on many unclosed tags', () => {
  const start = performance.now()
  assert.equal(stripHtml('<a'.repeat(50_000)), 'a'.repeat(50_000))
  assert.ok(performance.now() - start < 500)
})

test('stripHtml matches the old output for ordinary HTML-ish input', () => {
  for (const input of [
    '<b>x</b>',
    '<a href="x">y</a>',
    '<br/>line',
    '<br />line',
    '<p class="a b" data-x=1>text</p>',
    '<a title="1 > 0">y</a>',
    '<img src="https://x/y.png" alt="">',
  ]) {
    assert.equal(stripHtml(input), oldStripHtml(input), input)
  }
  // Attribute with `>` inside quotes: both versions end the tag at the first `>`.
  assert.equal(stripHtml('<a title="1 > 0">y</a>'), ' 0">y')
})

test('stripHtml tag ends at the next < (documented edge vs old)', () => {
  // Old: `<a<b>` was one tag -> 'x'. New: `<b>` is the tag, then the leftover
  // `<` before a letter is dropped -> 'ax'. Only malformed input differs.
  assert.equal(stripHtml('<a<b>x'), 'ax')
  assert.equal(oldStripHtml('<a<b>x'), 'x')
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
