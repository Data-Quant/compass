import { redirect } from 'next/navigation'

// Quarter-end evaluations became a tab of the Evaluation round page; old links land there.
export default function QuarterEvaluationsRedirect() {
  redirect('/admin/evaluation-round?tab=forms')
}
