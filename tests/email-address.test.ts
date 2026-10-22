import assert from 'node:assert/strict'
import test from 'node:test'
import { EMAIL_PATTERN, isValidEmailAddress, MAX_EMAIL_LENGTH } from '../lib/email-address'

const OLD_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

test('isValidEmailAddress accepts normal addresses', () => {
  for (const value of ['hr@example.com', 'first.last+tag@sub.example.co.uk', '  hr@example.com  ']) {
    assert.equal(isValidEmailAddress(value), true, value)
  }
})

test('isValidEmailAddress rejects malformed addresses', () => {
  for (const value of ['', 'hr', 'hr@', '@example.com', 'hr@example', 'hr @example.com', 'a@b@c.com', 'hr@example.', 'hr@.com']) {
    assert.equal(isValidEmailAddress(value), false, value)
  }
})

test('new pattern accepts exactly the same set as the old regex', () => {
  // Exhaustive over every string up to length 7 from a small alphabet that
  // covers each character class the patterns distinguish.
  const alphabet = ['a', '.', '@', ' ']
  let checked = 0
  const walk = (prefix: string) => {
    assert.equal(EMAIL_PATTERN.test(prefix), OLD_EMAIL_REGEX.test(prefix), JSON.stringify(prefix))
    checked++
    if (prefix.length < 7) for (const ch of alphabet) walk(prefix + ch)
  }
  walk('')
  assert.ok(checked > 20000)
  for (const value of ['hr@ex..com', 'hr@..com', 'hr@a.b.', 'x@-.-', 'hr@example.com']) {
    assert.equal(EMAIL_PATTERN.test(value), OLD_EMAIL_REGEX.test(value), value)
  }
})

test('isValidEmailAddress rejects addresses longer than 254 characters', () => {
  assert.equal(MAX_EMAIL_LENGTH, 254)
  const local = 'a'.repeat(64)
  const ok = `${local}@${'b'.repeat(254 - 64 - 1 - 4)}.com`
  assert.equal(ok.length, 254)
  assert.equal(isValidEmailAddress(ok), true)
  assert.equal(isValidEmailAddress(`a${ok}`), false)
})

test('email pattern stays linear on adversarial input, even past the length cap', () => {
  const start = performance.now()
  EMAIL_PATTERN.test('a@' + 'a.'.repeat(50_000) + '@')
  EMAIL_PATTERN.test('a@a' + 'a'.repeat(100_000) + ' ')
  assert.ok(performance.now() - start < 200)
})
