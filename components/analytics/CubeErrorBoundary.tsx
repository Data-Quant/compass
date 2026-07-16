'use client'

import { Component, type ReactNode } from 'react'

interface CubeErrorBoundaryProps {
  children: ReactNode
  /** Rendered instead of the children when the 3D view fails to load or render. */
  fallback: ReactNode
  onError: () => void
}

interface CubeErrorBoundaryState {
  failed: boolean
}

/**
 * Guards the 3D cube so a WebGL, driver, or chunk-load failure degrades to the
 * 2D grid rather than taking down the whole Talent Grid tab.
 *
 * This exists because an earlier cube crashed at chunk init in production and
 * blanked the entire page — nothing caught it. The 2D grid carries the same
 * data, so falling back to it costs the user nothing but the orbit interaction.
 */
export class CubeErrorBoundary extends Component<CubeErrorBoundaryProps, CubeErrorBoundaryState> {
  state: CubeErrorBoundaryState = { failed: false }

  static getDerivedStateFromError(): CubeErrorBoundaryState {
    return { failed: true }
  }

  componentDidCatch(error: unknown): void {
    // Surface the real cause for debugging; the user still gets the 2D view.
    console.error('Talent Cube failed, falling back to the 2D grid:', error)
    this.props.onError()
  }

  render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}
