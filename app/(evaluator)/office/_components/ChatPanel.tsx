'use client'

import { useState, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { Send } from 'lucide-react'
import type { ChatChannel } from '@/lib/office-config'

interface ChatMessage {
  id: string
  senderId: string
  senderName: string
  content: string
  channel: string
  timestamp: number
}

interface ChatPanelProps {
  messages: ChatMessage[]
  onSendMessage: (content: string, channel: ChatChannel) => void
}

export function ChatPanel({ messages, onSendMessage }: ChatPanelProps) {
  const [activeTab, setActiveTab] = useState<ChatChannel>('global')
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  const filteredMessages = messages.filter((m) => m.channel === activeTab)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [filteredMessages.length])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = input.trim()
    if (!trimmed) return
    onSendMessage(trimmed, activeTab)
    setInput('')
  }

  const formatTime = (ts: number) => {
    const d = new Date(ts)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="flex flex-col h-full bg-card">
      {/* Tabs */}
      <div className="flex border-b border-border shrink-0">
        {(['global', 'proximity'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'flex-1 px-3 py-2 text-xs font-medium capitalize transition-colors',
              activeTab === tab
                ? 'text-primary border-b-2 border-primary bg-primary/5'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
        {filteredMessages.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">
            {activeTab === 'global'
              ? 'No messages yet. Say hi!'
              : 'Walk near someone to chat!'}
          </p>
        )}
        {filteredMessages.map((msg) => (
          <div key={msg.id} className="text-xs">
            <span className="font-medium text-foreground">{msg.senderName}</span>
            <span className="text-muted-foreground ml-1.5">{formatTime(msg.timestamp)}</span>
            <p className="text-muted-foreground mt-0.5 break-words">{msg.content}</p>
          </div>
        ))}
      </div>

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="shrink-0 border-t border-border p-2 flex gap-1.5"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
          onKeyUp={(e) => e.stopPropagation()}
          placeholder={`Message ${activeTab}...`}
          className="flex-1 bg-muted rounded px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary/50"
          maxLength={500}
        />
        <button
          type="submit"
          disabled={!input.trim()}
          className="shrink-0 rounded bg-primary/10 p-1.5 text-primary hover:bg-primary/20 disabled:opacity-30 disabled:pointer-events-none transition-colors"
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      </form>
    </div>
  )
}
