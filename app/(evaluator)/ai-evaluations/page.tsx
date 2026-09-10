import { notFound } from 'next/navigation'
import { enabled } from '@/lib/ai-evaluations/service'
import { EmployeePilot } from '@/components/ai-evaluations/EmployeePilot'
export const dynamic = 'force-dynamic'
export default function Page() { if (!enabled()) notFound(); return <EmployeePilot /> }
