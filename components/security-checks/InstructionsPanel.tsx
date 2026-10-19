import { ExternalLink, ShieldAlert } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PROHIBITED_EVIDENCE } from '@/lib/security-checks/evidence'
import type { TaskDetailView } from '@/lib/security-checks/service/task-views'

export function ProhibitedList() {
  return (
    <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
      <p className="flex items-center gap-2 font-medium text-destructive">
        <ShieldAlert className="h-4 w-4" aria-hidden /> Never upload or share
      </p>
      <ul className="mt-1 list-inside list-disc text-muted-foreground">
        {PROHIBITED_EVIDENCE.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <p className="mt-1 text-muted-foreground">Blur or crop them out of screenshots. If one is uploaded, it is deleted and you will be asked to rotate it.</p>
    </div>
  )
}

export function InstructionsPanel({ campaign }: { campaign: TaskDetailView['campaign'] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">What to do</CardTitle>
        <p className="text-sm text-muted-foreground">Control: {campaign.control}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {campaign.instructions ? (
          <p className="whitespace-pre-wrap text-sm text-foreground">{campaign.instructions}</p>
        ) : (
          <p className="text-sm text-muted-foreground">No extra instructions.</p>
        )}
        {campaign.instructionImages.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {campaign.instructionImages.map((image) => (
              <figure key={image.path} className="overflow-hidden rounded-md border border-border">
                {/* eslint-disable-next-line @next/next/no-img-element -- private, auth-gated image route */}
                <img src={`/api/security-checks/campaign-images?path=${encodeURIComponent(image.path)}`} alt={image.name} className="w-full" />
                <figcaption className="px-2 py-1 text-xs text-muted-foreground">{image.name}</figcaption>
              </figure>
            ))}
          </div>
        )}
        {campaign.videoUrl && (
          <a href={campaign.videoUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm underline underline-offset-2">
            Watch the how-to video (Security team Google Drive) <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        )}
        {campaign.evidenceRequired && <ProhibitedList />}
      </CardContent>
    </Card>
  )
}
