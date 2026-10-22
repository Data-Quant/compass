// navigator.clipboard only exists on https/localhost, so plain-http (LAN/WSL IP) needs the execCommand fallback.
export async function copyTextToClipboard(text: string, trigger?: Element | null): Promise<boolean> {
  try {
    if (window.isSecureContext && navigator.clipboard) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // fall through to the legacy path
  }
  // Mount inside the open dialog so a Radix focus trap does not block the selection.
  const host = trigger?.closest('[role="dialog"]') ?? document.body
  const ta = document.createElement('textarea')
  ta.value = text
  ta.readOnly = true
  ta.setAttribute('aria-hidden', 'true')
  ta.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0'
  try {
    host.appendChild(ta)
    ta.select()
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    ta.remove()
  }
}
