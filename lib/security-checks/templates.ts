// §11 v1 campaigns as built-in templates. An admin picks one to prefill a new
// Draft, then sets the audience and first open date before activating.
import type { CampaignFields } from './schemas'
import type { Frequency, SubtaskMode } from './types'

export interface CampaignTemplate {
  key: string
  name: string
  control: string
  instructions: string
  questions: CampaignFields['questions']
  subtaskMode: SubtaskMode
  subtasks: string[]
  evidenceRequired: boolean
  fileLimit: number
  frequency: Frequency
}

const yes = (prompt: string) => ({ type: 'YES_NO' as const, prompt, compliantAnswer: true })
const BLUR = 'Blur or crop out anything personal. Never include codes, QR codes, secrets or passwords.'

function evidence(key: string, name: string, control: string, instructions: string, question: string, extra: Partial<CampaignTemplate> = {}): CampaignTemplate {
  return {
    key,
    name,
    control,
    instructions: `${instructions}\n\n${BLUR}`,
    questions: [yes(question)],
    subtaskMode: 'NONE',
    subtasks: [],
    evidenceRequired: true,
    fileLimit: 3,
    frequency: 'EVERY_4_MONTHS',
    ...extra,
  }
}

function confirmation(key: string, name: string, control: string, statement: string): CampaignTemplate {
  return {
    key,
    name,
    control,
    instructions: 'Read the linked material, then confirm below.',
    questions: [yes(statement)],
    subtaskMode: 'NONE',
    subtasks: [],
    evidenceRequired: false,
    fileLimit: 1,
    frequency: 'ANNUALLY',
  }
}

export const CAMPAIGN_TEMPLATES: readonly CampaignTemplate[] = [
  evidence('browser-extensions', 'Browser extensions audit', 'Browser hygiene',
    'Open your installed-extensions page (for example chrome://extensions) and take a screenshot showing every extension. The approved list is below.',
    'Are all installed extensions on the approved list?'),
  {
    ...evidence('mfa-saas', 'MFA across SaaS apps', 'Multi-factor authentication',
      'For each app, screenshot the security settings page showing MFA / 2-step verification is on. If you do not have an account for an app, request N/A and say so.',
      'Is MFA enabled on this account?'),
    subtaskMode: 'ADMIN_DEFINED',
    subtasks: ['Email', 'GitHub', 'Slack'],
  },
  evidence('mfa-discord', 'MFA on Discord', 'Multi-factor authentication',
    'In Discord, open User Settings → My Account and screenshot the section showing two-factor authentication is enabled.',
    'Is two-factor authentication enabled on your Discord account?'),
  {
    ...evidence('saas-inventory', 'SaaS application inventory', 'Asset inventory',
      'Add one item per tool you use for work, with a screenshot of your account in it. If you use none beyond the standard set, confirm the declaration only.',
      'I use this tool for work and the screenshot shows my account'),
    subtaskMode: 'EMPLOYEE_DEFINED',
  },
  {
    ...evidence('disk-encryption', 'Disk encryption + screen lock', 'Device security',
      'Screenshot BitLocker showing “On” (Windows) or FileVault “turned on” (macOS) — active, not just available — and your screen-lock timeout setting.',
      'Is full-disk encryption turned on?'),
    questions: [
      yes('Is full-disk encryption turned on (active)?'),
      yes('Is your screen-lock timeout within policy?'),
      { type: 'ACCOUNT_IDENTIFIER', prompt: 'Laptop asset tag (from Compass Assets)', compliantAnswer: null },
    ],
  },
  {
    ...evidence('updates', 'Updates current + auto-update on', 'Patch management',
      'Screenshot your OS update screen and your browser’s About page, each showing “up to date” and automatic updates enabled.',
      'Are your OS and browser up to date?'),
    questions: [yes('Are your OS and browser up to date?'), yes('Is auto-update enabled for both?')],
  },
  evidence('password-manager', 'Password manager in use', 'Credential management',
    'Screenshot the approved password manager installed and logged in, with vault entries blurred or collapsed.',
    'Do you use the approved password manager?'),
  evidence('vault-mfa', 'Master password / vault MFA', 'Credential management',
    'Screenshot your password manager’s security settings showing 2FA is enabled on the vault.',
    'Is 2FA enabled on your password vault?'),
  evidence('mail-forwarding', 'Account alias / forwarding review', 'Email security',
    'Screenshot your mail forwarding settings.',
    'Is there no unauthorised external auto-forwarding?'),
  evidence('inbox-rules', 'Inbox rules audit', 'Email security',
    'Screenshot all of your mail rules / filters.',
    'Are all your mail rules ones you created intentionally (none hide or delete mail unexpectedly)?'),
  evidence('cloud-root-mfa', 'Cloud console root/owner MFA', 'Privileged access',
    'For people with access only: screenshot MFA enabled on the AWS root (or equivalent owner) account.',
    'Is MFA enabled on the root / owner account?'),
  {
    ...evidence('vendor-portal-mfa', 'Vendor portal MFA', 'Multi-factor authentication',
      'Screenshot MFA enabled on each key third-party portal you use for your role. Request N/A for portals you do not use.',
      'Is MFA enabled on this portal?'),
    subtaskMode: 'ADMIN_DEFINED',
    subtasks: ['Payroll', 'CRM', 'Billing'],
  },
  evidence('authenticator-sync', 'Authenticator app cloud sync', 'Multi-factor authentication',
    'Screenshot Google Authenticator’s sync status showing it syncs to your corporate account. Show the sync status only — never the codes or QR codes.',
    'Does your authenticator sync to your corporate account?'),
  evidence('default-browser', 'Approved browser as default', 'Browser hygiene',
    'Screenshot your default-browser setting.',
    'Is an approved browser set as your default?'),
  evidence('clock-sync', 'Time zone / clock auto-sync', 'Device security',
    'Screenshot your date & time settings showing automatic time synchronisation is on.',
    'Is automatic time synchronisation enabled?'),
  evidence('mobile-os', 'Mobile OS up to date', 'Mobile security',
    'Screenshot your phone’s software-update screen showing the current version.',
    'Is your phone’s OS up to date?'),
  evidence('mobile-auto-update', 'Mobile apps auto-update on', 'Mobile security',
    'Screenshot the App Store / Play Store auto-update setting.',
    'Is app auto-update enabled?'),
  evidence('mobile-inventory', 'Mobile app inventory (corporate phones)', 'Mobile security',
    'Corporate phones only (BYOD is out of scope): screenshot the full installed-apps list or the MDM inventory view. Use as many screenshots as you need.',
    'Do the screenshots show every installed app?', { fileLimit: 15 }),
  evidence('mobile-mail-client', 'Approved email client on mobile', 'Mobile security',
    'Screenshot your phone’s mail setup showing corporate mail is configured only in the sanctioned app.',
    'Is corporate mail configured only in the approved app?'),
  evidence('drive-backup', 'Google Drive backup active', 'Data backup',
    'Screenshot Drive for desktop signed in with your corporate account, with Desktop and Documents syncing.',
    'Are your work folders syncing to Google Drive?'),
  evidence('firewall', 'OS firewall enabled', 'Device security',
    'Screenshot Windows Defender Firewall (active profile) or the macOS firewall setting showing it is on.',
    'Is your OS firewall turned on?'),
  confirmation('policy-ack', 'Annual security policy acknowledgment', 'Security policy', 'I have read and agree to follow the security policy'),
  confirmation('training', 'Security training completion', 'Security awareness', 'I have completed this year’s security training'),
  confirmation('incident-reporting', 'Incident reporting awareness', 'Incident response', 'I know how and where to report a security incident'),
  confirmation('remote-work', 'Remote-work security guidelines', 'Remote work', 'I have read and follow the remote-work security guidelines'),
]

export function templateFields(template: CampaignTemplate): Omit<CampaignFields, 'audience' | 'firstOpenDate'> {
  return {
    name: template.name,
    control: template.control,
    instructions: template.instructions,
    instructionImages: [],
    videoUrl: null,
    questions: template.questions,
    subtaskMode: template.subtaskMode,
    subtasks: template.subtasks,
    evidenceRequired: template.evidenceRequired,
    fileLimit: template.fileLimit,
    deadlineDays: 14,
    reminderOffsets: [14, 7, 1],
    frequency: template.frequency,
    recurrenceAnchor: 'FIXED_CALENDAR',
  }
}
