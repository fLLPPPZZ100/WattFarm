/**
 * The farm view — the game itself.
 *
 * Renders nothing on purpose. The Phaser canvas lives in a `#phaser-root`
 * element that `AppShell` keeps mounted for the whole session, so the canvas
 * survives navigation instead of being torn down and rebooted on every route
 * change. AppShell shows or hides it based on the current path, and the
 * surrounding panels (power, next payout) are drawn there too.
 *
 * This component exists so the index route has something to point at.
 *
 * Renamed from `Dashboard`: nothing here is a dashboard, and "Farm" matches both
 * the product name and what the screen actually shows.
 */
export default function Farm() {
  return null;
}
