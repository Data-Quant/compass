import { redirect } from 'next/navigation'

/** Evaluations happen weekly; the old address opens the weekly questions. */
export default function EvaluationsPage(): never {
  redirect('/evaluations/weekly')
}
