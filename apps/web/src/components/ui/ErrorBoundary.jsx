import { Component } from 'react';

/**
 * Contains a render-time crash to one region of the UI.
 *
 * ## Why this exists
 *
 * The app had no boundary anywhere. React's behaviour when an error escapes to
 * the root is to unmount the entire tree, so a single bad property access on one
 * page produced a completely white screen — no navigation, no way back, and no
 * indication that anything had failed. That happened on the referral page:
 * `data` was still null when the component rendered, and `data.code` threw.
 *
 * The page bug is fixed, but a boundary is the difference between "one page is
 * broken" and "the product is gone". It belongs around the routed content, so
 * the sidebar survives and the player can navigate away.
 *
 * Deliberately a class: `componentDidCatch` has no hook equivalent.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Kept as a real console error so the stack is still available in devtools;
    // a swallowed crash is harder to diagnose than a visible one.
    console.error('[ErrorBoundary] render failed:', error, info?.componentStack);
  }

  /**
   * Clearing the error re-renders the children. Recovery is offered rather than
   * forced, since a transient failure (a bad response, a race) usually clears on
   * a retry, and a full reload would cost the player their place.
   */
  handleRetry = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="bg-bg-panel border border-red-500/30 rounded-lg p-6 space-y-4">
        <div>
          <h2 className="font-display text-sm text-red-400 tracking-wide">SOMETHING BROKE</h2>
          <p className="text-text-muted text-sm mt-2">
            This page failed to render. The rest of the game is still running — use the menu to
            go somewhere else, or try again.
          </p>
        </div>

        {/* The message, not the stack: enough for a bug report, not a wall of text. */}
        <pre className="bg-bg-abyss border border-line-dusk rounded p-3 text-xs text-text-muted overflow-x-auto whitespace-pre-wrap">
          {error.message || String(error)}
        </pre>

        <button
          type="button"
          onClick={this.handleRetry}
          className="px-3 py-2 rounded border border-accent-watt/40 bg-accent-watt/10 font-display text-[10px] uppercase tracking-widest text-accent-watt hover:bg-accent-watt/20 transition-colors"
        >
          Try again
        </button>
      </div>
    );
  }
}
