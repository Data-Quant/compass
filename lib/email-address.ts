// RFC 5321 caps a forward path at 254 characters; checking length first
// bounds the regex work on hostile input.
export const MAX_EMAIL_LENGTH = 254

// Accepts exactly what the old /^[^\s@]+@[^\s@]+\.[^\s@]+$/ accepted (a domain
// with a dot that is neither its first nor last character) but in linear time:
// the domain's first character is matched alone, then `[^\s@.]*` and `\.` are
// disjoint, so the engine never backtracks between quantifiers.
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@][^\s@.]*\.[^\s@]+$/

export function isValidEmailAddress(value: string): boolean {
  const email = value.trim()
  return email.length <= MAX_EMAIL_LENGTH && EMAIL_PATTERN.test(email)
}
