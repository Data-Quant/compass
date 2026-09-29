// A deliberate belt-and-braces check alongside the model's own SENSITIVE_CONTENT flag.
const PATTERNS: readonly RegExp[] = [
  /\bhealth\b/i, /\bhospital/i, /\bmedical\b/i, /\bdiagnos/i, /\billness\b/i, /\bsurgery\b/i, /\bsick\b/i, /\bpregnan/i,
  /\bmental\b/i, /\btherap/i, /\bharass/i, /\bbully(ing)?\b/i, /\bbullied\b/i, /\bdiscriminat/i, /\bassault/i,
  /\blawsuit\b/i, /\blegal action\b/i, /\blawyer\b/i, /\bpolice\b/i, /\bgrievance\b/i,
]

export function looksSensitive(text: string): boolean {
  return PATTERNS.some((pattern) => pattern.test(text))
}
