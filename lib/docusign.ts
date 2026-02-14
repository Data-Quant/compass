import crypto from 'crypto'
import { getDocuSignRuntimeConfig } from '@/lib/payroll/config'

interface EnvelopeSendPayload {
  templateId: string
  templateRoleName: string
  recipientName: string
  recipientEmail: string
}

interface DocuSignTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function createSignedJwtAssertion() {
  const cfg = getDocuSignRuntimeConfig()
  if (!cfg.ready) {
    throw new Error(`DocuSign is not configured. Missing: ${cfg.missing.join(', ')}`)
  }

  const now = Math.floor(Date.now() / 1000)
  const header = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = base64UrlEncode(
    JSON.stringify({
      iss: cfg.integrationKey,
      sub: cfg.userId,
      aud: cfg.oauthBasePath,
      iat: now,
      exp: now + 3600,
      scope: 'signature impersonation',
    })
  )

  const signingInput = `${header}.${payload}`
  const signer = crypto.createSign('RSA-SHA256')
  signer.update(signingInput)
  signer.end()
  const privateKey = cfg.privateKey.includes('\\n') ? cfg.privateKey.replace(/\\n/g, '\n') : cfg.privateKey
  const signature = signer
    .sign(privateKey)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')

  return `${signingInput}.${signature}`
}

async function getDocuSignAccessToken(): Promise<string> {
  const cfg = getDocuSignRuntimeConfig()
  const assertion = createSignedJwtAssertion()

  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  })

  const response = await fetch(`https://${cfg.oauthBasePath}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`DocuSign OAuth failed: ${response.status} ${text}`)
  }

  const tokenJson = (await response.json()) as DocuSignTokenResponse
  return tokenJson.access_token
}

export async function createDocuSignEnvelope(payload: EnvelopeSendPayload) {
  const cfg = getDocuSignRuntimeConfig()
  const accessToken = await getDocuSignAccessToken()
  const basePath = cfg.basePath.replace(/\/+$/, '')

  const response = await fetch(
    `${basePath}/restapi/v2.1/accounts/${cfg.accountId}/envelopes`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        templateId: payload.templateId,
        templateRoles: [
          {
            name: payload.recipientName,
            email: payload.recipientEmail,
            roleName: payload.templateRoleName,
          },
        ],
        status: 'sent',
      }),
    }
  )

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`DocuSign envelope creation failed: ${response.status} ${text}`)
  }

  const json = (await response.json()) as { envelopeId?: string; status?: string }
  return {
    envelopeId: json.envelopeId || '',
    status: json.status || 'sent',
  }
}

export async function getDocuSignEnvelopeStatus(envelopeId: string) {
  const cfg = getDocuSignRuntimeConfig()
  const accessToken = await getDocuSignAccessToken()
  const basePath = cfg.basePath.replace(/\/+$/, '')

  const response = await fetch(
    `${basePath}/restapi/v2.1/accounts/${cfg.accountId}/envelopes/${envelopeId}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  )

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`DocuSign envelope fetch failed: ${response.status} ${text}`)
  }

  const json = (await response.json()) as {
    envelopeId: string
    status: string
    sentDateTime?: string
    completedDateTime?: string
  }

  return {
    envelopeId: json.envelopeId,
    status: json.status,
    sentAt: json.sentDateTime ? new Date(json.sentDateTime) : null,
    completedAt: json.completedDateTime ? new Date(json.completedDateTime) : null,
  }
}
