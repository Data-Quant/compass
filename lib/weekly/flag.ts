type Env = Record<string, string | undefined>

export function isWeeklyEnabled(env: Env = process.env): boolean {
  return env.WEEKLY_EVALUATIONS_ENABLED === 'true'
}

/** Preview-only HR tools (release weeks early, synthetic answers, act as someone). */
export function areWeeklyTestToolsEnabled(env: Env = process.env): boolean {
  return isWeeklyEnabled(env) && env.WEEKLY_TEST_TOOLS === 'true'
}

/** The preview holds real people's data; email is sent only where this is set (production). */
export function areWeeklyEmailsEnabled(env: Env = process.env): boolean {
  return env.WEEKLY_SEND_EMAILS === 'true'
}
