import { notFound } from 'next/navigation'
import { enabled } from '@/lib/ai-evaluations/service'
import { AdminPilot } from '@/components/ai-evaluations/AdminPilot'
export const dynamic = 'force-dynamic'
export default function Page() { if (!enabled()) notFound(); return <AdminPilot /> }
