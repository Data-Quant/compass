import Link from 'next/link'
import { ChevronLeft, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function AnalyticsHeader({ projectId, name, color }: { projectId: string; name: string; color: string | null }) {
  return (
    <header className="mb-6 flex flex-col gap-1.5">
      <nav aria-label="Breadcrumb" className="text-[13px] text-muted-foreground">
        <ol className="flex min-w-0 flex-wrap items-center gap-1.5">
          <li><Link href="/projects" className="transition-colors hover:text-foreground">Projects</Link></li>
          <li aria-hidden="true">/</li>
          <li className="min-w-0 max-w-[60vw] truncate">
            <Link href={`/projects/${projectId}`} className="transition-colors hover:text-foreground">{name}</Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="text-foreground">Analytics</li>
        </ol>
      </nav>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {color && <span aria-hidden="true" className="h-10 w-3 shrink-0 rounded-full" style={{ backgroundColor: color }} />}
          <h1 className="min-w-0 break-words text-2xl font-display font-light tracking-tight text-foreground sm:text-3xl">{name}</h1>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/projects/${projectId}`}>
            <ChevronLeft aria-hidden="true" />
            Back to board
          </Link>
        </Button>
      </div>
      <p className={`inline-flex items-center gap-1.5 text-[13px] text-muted-foreground ${color ? 'sm:ml-6' : ''}`}>
        <Lock aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
        Analytics · Only this project&apos;s leads and HR can open this page
      </p>
    </header>
  )
}
