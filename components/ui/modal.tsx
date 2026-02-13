'use client'

import { ReactNode } from 'react'
import { motion } from 'framer-motion'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { BorderBeam } from '@/components/magicui/border-beam'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
}

const sizeClasses = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-4xl',
}

export function Modal({ isOpen, onClose, title, children, size = 'md' }: ModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={`${sizeClasses[size]} max-h-[90vh] overflow-y-auto overflow-x-hidden`}>
        {/* Spring-based 3D entrance animation */}
        <motion.div
          initial={{ opacity: 0, scale: 0.85, rotateX: 12, y: 20 }}
          animate={{ opacity: 1, scale: 1, rotateX: 0, y: 0 }}
          transition={{
            type: 'spring',
            stiffness: 260,
            damping: 18,
          }}
          style={{ perspective: 800 }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <div className="mt-2">
            {children}
          </div>
        </motion.div>
        {/* Traveling highlight beam around modal border */}
        <BorderBeam size={250} duration={12} borderWidth={1.5} />
      </DialogContent>
    </Dialog>
  )
}
