import { COMPASS_URL } from '@/lib/compass-url'
import { escapeHtml } from '@/lib/sanitize'

type DeepLinkTarget = 'approval' | 'own' | 'unavailable'

export function normalizeCompassBaseUrl(value: string | null | undefined) {
  const trimmed = value?.trim().replace(/\/+$/, '')
  if (!trimmed) return null

  if (/^[a-z][a-z\d+.-]*:/i.test(trimmed) && !/^https?:\/\//i.test(trimmed)) {
    return null
  }

  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.toString().replace(/\/+$/, '')
  } catch {
    return null
  }
}

/** Compass's address, unless a caller names another explicitly; never the deployment a request happened to hit. */
export function getCompassBaseUrl(explicitBaseUrl?: string | null) {
  return normalizeCompassBaseUrl(explicitBaseUrl) || COMPASS_URL
}

export function getLeaveRequestPath(requestId: string) {
  const normalizedId = requestId.trim()
  if (!normalizedId) return '/leave'
  return `/leave?requestId=${encodeURIComponent(normalizedId)}`
}

export function getLeaveRequestUrl(requestId: string, explicitBaseUrl?: string | null) {
  return new URL(getLeaveRequestPath(requestId), `${getCompassBaseUrl(explicitBaseUrl)}/`).toString()
}

export function renderLeaveRequestEmailAction(requestId: string, explicitBaseUrl?: string | null) {
  const leaveRequestUrl = escapeHtml(getLeaveRequestUrl(requestId, explicitBaseUrl))

  return `
    <p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 20px 0 12px;">
      Review this request and take the appropriate action in Compass.
    </p>

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 0 0 12px;">
      <tr>
        <td bgcolor="#4F46E5" style="border-radius: 8px;">
          <a
            href="${leaveRequestUrl}"
            style="display: inline-block; padding: 12px 18px; color: #FFFFFF; font-size: 14px; font-weight: 700; line-height: 1.2; text-decoration: none; border-radius: 8px;"
          >Review leave request in Compass</a>
        </td>
      </tr>
    </table>

    <p style="color: #64748B; font-size: 12px; line-height: 1.5; margin: 0;">
      If you need to sign in, Compass will return you to this leave request afterward.
    </p>
  `
}

export function resolveLeaveRequestDeepLinkTarget(
  requestId: string,
  approvalRequestIds: string[],
  ownRequestIds: string[],
): DeepLinkTarget {
  if (approvalRequestIds.includes(requestId)) return 'approval'
  if (ownRequestIds.includes(requestId)) return 'own'
  return 'unavailable'
}
