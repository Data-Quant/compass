import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import './globals.css'
import { ThemeProvider } from '@/components/providers/theme-provider'
import { CompanyBrandingProvider } from '@/components/providers/company-branding-provider'
import { ToastProvider } from '@/components/ui/toast-provider'
import {
  COMPANY_COOKIE_NAME,
  getCompanyBranding,
  normalizeCompanyView,
} from '@/lib/company-branding'

export async function generateMetadata(): Promise<Metadata> {
  const cookieStore = await cookies()
  const selectedCompany = normalizeCompanyView(cookieStore.get(COMPANY_COOKIE_NAME)?.value)
  const branding = getCompanyBranding(selectedCompany)

  const iconEntries =
    selectedCompany === 'plutus'
      ? [
          {
            url: branding.iconLight,
            sizes: 'any',
            type: 'image/svg+xml',
            media: '(prefers-color-scheme: light)',
          },
          {
            url: branding.iconDark,
            sizes: '32x32',
            type: 'image/png',
            media: '(prefers-color-scheme: dark)',
          },
          {
            url: branding.shortcutIcon,
            sizes: 'any',
            type: 'image/x-icon',
          },
        ]
      : [
          {
            url: branding.iconLight,
            sizes: '192x192',
            type: 'image/png',
          },
        ]

  return {
    title: branding.title,
    description: branding.description,
    icons: {
      icon: iconEntries,
      apple: [
        {
          url: branding.appleIcon,
          sizes: '180x180',
          type: 'image/png',
        },
      ],
      shortcut: branding.shortcutIcon,
    },
  }
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const cookieStore = await cookies()
  const selectedCompany = normalizeCompanyView(cookieStore.get(COMPANY_COOKIE_NAME)?.value)

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="font-sans antialiased">
        <ThemeProvider>
          <CompanyBrandingProvider initialCompany={selectedCompany}>
            <ToastProvider />
            {children}
          </CompanyBrandingProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
