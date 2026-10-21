// A round's exact dates, from week 1 and the number of question weeks (UX spec, HR step 1). Pure, so the set-up form
// can show them live as HR types and the round page shows the same thing.
import { CATCH_UP_WEEKS, weekDueAt, weekStartsAt } from './calendar'

export interface RoundSchedule {
  /** Week 1 starts on the weekday HR chose; its questions are due that Friday. */
  weekOne: { startsOn: Date; dueOn: Date }
  /** The last week that brings new questions. */
  lastQuestionWeek: { startsOn: Date; dueOn: Date }
  questionWeeks: number
  /** The two weeks after the questions: catch-up, the quarter-end forms and HR's score review. */
  closingWeeks: { startsOn: Date; endsOn: Date }
  /** The last moment of the round: the end of the second closing week. */
  concludesOn: Date
}

export function roundSchedule(weekOneStartsOn: Date, questionWeeks: number): RoundSchedule {
  const weeks = Math.max(1, questionWeeks)
  const endOfWeek = (week: number) => new Date(weekStartsAt(weekOneStartsOn, week + 1).getTime() - 1)
  const concludesOn = endOfWeek(weeks + CATCH_UP_WEEKS)
  return {
    weekOne: { startsOn: weekOneStartsOn, dueOn: weekDueAt(weekOneStartsOn, 1) },
    lastQuestionWeek: { startsOn: weekStartsAt(weekOneStartsOn, weeks), dueOn: weekDueAt(weekOneStartsOn, weeks) },
    questionWeeks: weeks,
    closingWeeks: { startsOn: weekStartsAt(weekOneStartsOn, weeks + 1), endsOn: concludesOn },
    concludesOn,
  }
}
