import type { RoundSchedule } from '@/lib/weekly/round-schedule'

const DAY = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Karachi', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
/** "Wed 21 Oct 2026". */
const day = (instant: Date) => DAY.format(instant).replace(',', '')

interface Step { title: string; when: string; detail: string }

function steps(schedule: RoundSchedule): Step[] {
  const { weekOne, lastQuestionWeek, closingWeeks, concludesOn, questionWeeks } = schedule
  const later = questionWeeks > 1
    ? ` After that, new questions go out every Monday and are due that Friday. The last ones go out ${day(lastQuestionWeek.startsOn)}, due ${day(lastQuestionWeek.dueOn)}.`
    : ''
  return [
    {
      title: `Questions · ${questionWeeks} ${questionWeeks === 1 ? 'week' : 'weeks'}`,
      when: `${day(weekOne.startsOn)} to ${day(lastQuestionWeek.dueOn)}`,
      detail: `The first questions go out ${day(weekOne.startsOn)}, due ${day(weekOne.dueOn)}.${later}`,
    },
    {
      title: 'Closing · 2 weeks',
      when: `${day(closingWeeks.startsOn)} to ${day(closingWeeks.endsOn)}`,
      detail: 'No new questions. People catch up on anything they missed. The C-suite, Department and HR quarter-end forms are filled in, and HR reviews and confirms the scores.',
    },
    {
      title: 'Round concludes',
      when: day(concludesOn),
      detail: 'Answering and the quarter-end forms end. HR then closes the round and releases the reports.',
    },
  ]
}

/** A round's exact dates, in order: the question weeks, the two closing weeks, and the day it concludes. */
export function RoundScheduleSummary({ schedule }: { schedule: RoundSchedule }) {
  return (
    <ol className="space-y-4">
      {steps(schedule).map((step, i) => (
        <li key={step.title} className="relative flex gap-3">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold tabular-nums text-primary" aria-hidden>{i + 1}</span>
          <div className="min-w-0 space-y-0.5">
            <p className="text-sm">
              <span className="font-semibold text-foreground">{step.title}</span>
              <span className="text-muted-foreground"> · {step.when}</span>
            </p>
            <p className="text-sm text-muted-foreground">{step.detail}</p>
          </div>
        </li>
      ))}
    </ol>
  )
}
