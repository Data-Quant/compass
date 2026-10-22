import assert from 'node:assert/strict'
import test from 'node:test'
import { stripHtml, stripHtmlOptional } from '../lib/sanitize'

// Test-only reference implementations, written as plain loops (no regex
// replace) so they are obviously correct and not themselves sanitizers.
// oldStripHtml: the original single-pass /<\/?[a-zA-Z][^>]*>/g removal.
// loopStripHtml: the previous repeat-until-stable /<\/?[a-zA-Z][^<>]*>/g
// version plus the leftover tag-opener drop. lib/sanitize.ts must match it.
const isLetter = (ch: string) => (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z')
const isControl = (ch: string) => {
  const c = ch.charCodeAt(0)
  return c <= 0x08 || c === 0x0b || c === 0x0c || (c >= 0x0e && c <= 0x1f) || c === 0x7f
}
const dropControlChars = (input: string) => Array.from(input).filter((ch) => !isControl(ch)).join('')

// Index just past the tag starting at `i`, or -1. `allowInnerLt` = old pattern
// ([^>]* may contain `<`); otherwise the body stops at the next `<`.
function tagEnd(input: string, i: number, allowInnerLt: boolean): number {
  if (input[i] !== '<') return -1
  let j = i + 1
  if (input[j] === '/') j++
  if (!isLetter(input[j] ?? '')) return -1
  for (j++; j < input.length; j++) {
    if (input[j] === '>') return j + 1
    if (input[j] === '<' && !allowInnerLt) return -1
  }
  return -1
}

// One left-to-right, non-overlapping removal pass (what a global regex replace does).
function removeTagsOnce(input: string, allowInnerLt: boolean): string {
  let out = ''
  for (let i = 0; i < input.length; ) {
    const end = tagEnd(input, i, allowInnerLt)
    if (end === -1) out += input[i++]
    else i = end
  }
  return out
}

const oldStripHtml = (input: string) => dropControlChars(removeTagsOnce(input, true))

function loopStripHtml(input: string): string {
  let output = input
  let previous: string
  do {
    previous = output
    output = removeTagsOnce(output, false)
  } while (output !== previous)
  let out = ''
  for (let i = 0; i < output.length; ) {
    if (output[i] !== '<') { out += output[i++]; continue }
    let j = i
    while (output[j] === '<') j++
    const next = output[j] ?? ''
    if (!(isLetter(next) || next === '/' || next === '!' || next === '?')) out += output.slice(i, j)
    i = j
  }
  return dropControlChars(out)
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
