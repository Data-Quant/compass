'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'

/**
 * Handbook bodies are stored as authored and sanitized here, at render.
 *
 * This is a deliberate, documented exception to the repo's sanitize-at-ingest
 * posture (lib/sanitize.ts): markdown must survive round-tripping through the
 * editor, so stripping it on the way in would corrupt it. The allowlist below
 * is the compensating control -- no raw HTML, no scripts, no iframes.
 */
const schema = {
  ...defaultSchema,
  tagNames: [
    'h1',
    'h2',
    'h3',
    'h4',
    'p',
    'ul',
    'ol',
    'li',
    'strong',
    'em',
    'del',
    'blockquote',
    'code',
    'pre',
    'a',
    'hr',
    'br',
    'table',
    'thead',
    'tbody',
    'tr',
    'th',
    'td',
  ],
  attributes: {
    ...defaultSchema.attributes,
    a: ['href', 'title'],
    th: ['align'],
    td: ['align'],
  },
  protocols: {
    ...defaultSchema.protocols,
    href: ['http', 'https', 'mailto'],
  },
}

export function HandbookMarkdown({
  source,
  variant = 'policy',
}: {
  source: string
  variant?: 'policy' | 'letter'
}) {
  // Body copy was text-sm text-muted-foreground -- the app's fine-print token.
  // Long-form policy read in muted grey at 14px is poor ergonomics on any page.
  // foreground/90 rather than flat foreground: full contrast is right for
  // headings but slightly heavy for multi-paragraph body copy.
  return (
    <div
      className={
        variant === 'letter'
          ? // The ! on my-10 is load-bearing: space-y-5 sets margin-top via a
            // higher-specificity selector, so without it the sign-off rule gets
            // the same 20px gap as any paragraph and separates nothing.
            'font-display text-[19px] leading-[1.7] text-foreground/90 max-w-[600px] space-y-5 [&_hr]:!my-10 [&_hr]:border-border/60'
          : 'text-base leading-relaxed text-foreground/90 max-w-[68ch] space-y-4'
      }
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeSanitize, schema]]}
        components={{
          h1: ({ children }) => (
            <h2 className="text-xl font-semibold text-foreground mt-8 mb-3 first:mt-0">{children}</h2>
          ),
          h2: ({ children }) => (
            <h2 className="text-lg font-semibold text-foreground mt-8 mb-3 first:mt-0">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-base font-semibold text-foreground mt-6 mb-2">{children}</h3>
          ),
          h4: ({ children }) => (
            <h4 className="text-sm font-semibold text-foreground mt-4 mb-2">{children}</h4>
          ),
          ul: ({ children }) => <ul className="list-disc pl-5 space-y-1.5">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-5 space-y-1.5">{children}</ol>,
          strong: ({ children }) => (
            <strong className="font-semibold text-foreground">{children}</strong>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              className="text-primary underline underline-offset-2 hover:opacity-80 transition-opacity"
              target="_blank"
              rel="noopener noreferrer"
            >
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-border pl-4 italic">{children}</blockquote>
          ),
          code: ({ children }) => (
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-foreground">{children}</code>
          ),
          hr: () => <hr className="border-border" />,
          // Wide content must scroll inside its own container -- the page body
          // must never scroll horizontally.
          table: ({ children }) => (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm border-collapse">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="text-left font-medium text-foreground bg-muted/50 px-3 py-2 border-b border-border">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-3 py-2 border-b border-border align-top">{children}</td>
          ),
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  )
}
