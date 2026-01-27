import type { Metadata } from 'next'
import './globals.css'
import { ThemeProvider } from '@/components/providers/theme-provider'
import { ToastProvider } from '@/components/ui/toast-provider'

export const metadata: Metadata = {
  title: 'Compass | Plutus 21 Performance Platform',
  description: '360-degree performance evaluations that drive meaningful conversations and foster growth at Plutus 21',
  icons: {
    icon: '/favicon.ico',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="bg-[var(--background)] text-[var(--foreground)] antialiased">
        <ThemeProvider>
          <ToastProvider />
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
