/* Containment for the optional game.
 *
 * The rule this enforces: a failure in the racing game must never break the
 * study site it is embedded in. ensureApp() in racing/index.js already catches
 * a failed DOWNLOAD, but nothing caught a failure AFTER the module loaded --
 * a WebGL context the browser refuses, a cannon worker that cannot start, a
 * geometry build that throws on an odd archetype. Those would have propagated
 * out of React into the host page.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react'

export interface ErrorBoundaryProps {
  children: ReactNode
  /** Called once when the tree fails, so the host can restore the v1 game. */
  onError?: (error: Error) => void
}

interface State {
  failed: boolean
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Logged, never rethrown: this is the boundary, and throwing from here
    // would defeat the entire point of having one.
    try {
      console.warn('racing v2 failed, falling back:', error.message, info.componentStack)
    } catch {
      /* console itself can throw in exotic embeddings; ignore */
    }
    try {
      this.props.onError?.(error)
    } catch {
      /* a broken host callback must not re-break the boundary */
    }
  }

  render() {
    // Render nothing on failure rather than an error card. The host page owns
    // what the student sees, and it is putting the working v1 game back.
    return this.state.failed ? null : this.props.children
  }
}
