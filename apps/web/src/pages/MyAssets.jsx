import { useEffect, useMemo, useRef, useState } from 'react';

import { useAssetsStore } from '../store/assetsStore';
import { metaFor, categoryOf } from '../data/items.js';
import vltCoinImg from '../assets/coins/vlt-coin.png';

/** Server cap on a single purchase, mirrored so the input cannot exceed it. */
const MAX_PER_PURCHASE = 1000;

const CATEGORIES = [
  { key: 'generator', label: 'Generators', icon: '⚡' },
  { key: 'support', label: 'Supports', icon: '🔧' },
];

function withAlpha(hex, alpha) {
  if (!hex) return 'transparent';
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * Formats a VLT amount.
 *
 * Trailing `.0` on whole numbers made prices look like measurements; amounts are
 * shown as integers unless there is a real fraction.
 */
function vlt(amount) {
  const value = Number(amount) || 0;
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

/* ── Quantity stepper ────────────────────────────────────────────── */

function QuantityStepper({ value, max, onChange, label }) {
  const clamp = (next) => Math.max(1, Math.min(max, next));

  return (
    <div className="flex items-center gap-2">
      <span className="text-text-muted text-xs">Qty</span>

      <button
        type="button"
        aria-label={`Decrease ${label} quantity`}
        onClick={() => onChange(clamp(value - 1))}
        disabled={value <= 1}
        className="w-8 h-8 rounded bg-bg-panel border border-line-dusk text-text-muted
                   hover:text-text-primary disabled:opacity-40 disabled:hover:text-text-muted
                   text-base font-bold flex items-center justify-center"
      >
        −
      </button>

      <input
        type="text"
        inputMode="numeric"
        aria-label={`${label} quantity`}
        value={value}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^\d]/g, '');
          if (raw === '') {
            onChange(1);
            return;
          }
          // Clamping here rather than on submit means the field can never show
          // a number the server would reject.
          onChange(clamp(parseInt(raw, 10)));
        }}
        className="w-16 h-8 text-center bg-bg-abyss border border-line-dusk rounded
                   text-text-primary text-sm font-mono"
      />

      <button
        type="button"
        aria-label={`Increase ${label} quantity`}
        onClick={() => onChange(clamp(value + 1))}
        disabled={value >= max}
        className="w-8 h-8 rounded bg-bg-panel border border-line-dusk text-text-muted
                   hover:text-text-primary disabled:opacity-40 disabled:hover:text-text-muted
                   text-base font-bold flex items-center justify-center"
      >
        +
      </button>

      {/* MAX used to be a fixed 99, which usually produced an unaffordable
          total and a dead Buy button. It now means "as many as I can pay for". */}
      <button
        type="button"
        onClick={() => onChange(Math.max(1, max))}
        disabled={max <= 1}
        className="ml-1 text-accent-watt text-xs font-semibold hover:underline disabled:opacity-40
                   disabled:no-underline"
      >
        MAX
      </button>
    </div>
  );
}

/* ── Shop card ───────────────────────────────────────────────────── */

function ShopCard({ item, vltBalance, onBuy, busy }) {
  const meta = metaFor(item.type);
  const [qty, setQty] = useState(1);

  const unitPrice = item.price || 0;

  /**
   * Affordability is capped by both the wallet and the server's per-purchase
   * limit, so the stepper can never build a request that will be rejected.
   */
  const affordable = unitPrice > 0 ? Math.floor(vltBalance / unitPrice) : 0;
  const maxQty = Math.max(1, Math.min(MAX_PER_PURCHASE, affordable));

  const totalPrice = Math.round(unitPrice * qty * 100) / 100;
  const canAfford = totalPrice <= vltBalance && affordable >= 1;

  const bonusPercent = item.powerBonus ? Math.round(item.powerBonus * 100) : 0;

  return (
    <div
      className="rounded-xl border border-line-dusk bg-bg-abyss hover:border-accent-watt/20
                 p-5 flex flex-col gap-4 transition-all relative"
    >
      {/* Sprite */}
      <div
        className="w-full h-[120px] rounded-lg flex items-center justify-center"
        style={{ backgroundColor: withAlpha(meta.colour, 0.08) }}
      >
        {meta.img ? (
          <img
            src={meta.img}
            alt={meta.label}
            className="max-h-full object-contain"
            style={{ imageRendering: 'pixelated' }}
          />
        ) : (
          <span className="font-display text-3xl opacity-40" style={{ color: meta.colour }}>
            {(meta.label || item.type).slice(0, 2).toUpperCase()}
          </span>
        )}
      </div>

      {/* Identity */}
      <div>
        <div className="flex items-start justify-between gap-2">
          <p className="font-display text-sm text-text-primary tracking-wide">{meta.label}</p>
          {bonusPercent > 0 && (
            <span className="shrink-0 font-mono text-[10px] text-accent-current border border-accent-current/40 bg-accent-current/10 px-1.5 py-0.5 rounded">
              +{bonusPercent}%
            </span>
          )}
        </div>
        <p className="text-text-muted text-xs mt-1 leading-tight">{meta.blurb}</p>
      </div>

      {/* Server-provided stats. Everything here decides income, so none of it
          is hardcoded in the client. */}
      <div className="space-y-1 text-[11px]">
        {item.baseW > 0 && (
          <Stat label="Output" value={`${item.baseW.toFixed(1)} W/s`} tone="current" />
        )}
        {item.bays > 0 && (
          <Stat
            label="Capacity"
            value={`${item.bays} panel${item.bays > 1 ? 's' : ''} · ${item.cells} cell${item.cells > 1 ? 's' : ''}`}
          />
        )}
        {bonusPercent > 0 && (
          <Stat label="Bonus" value={`+${bonusPercent}% per panel`} tone="current" />
        )}
        <Stat
          label="You own"
          value={
            item.placed > 0
              ? `${item.owned} (${item.placed} installed)`
              : `${item.owned}`
          }
        />
      </div>

      <QuantityStepper value={qty} max={maxQty} onChange={setQty} label={meta.label} />

      {/* Total */}
      <div
        className={
          'flex items-center justify-center gap-1.5 py-2 rounded-lg border text-sm font-mono ' +
          (canAfford
            ? 'border-accent-watt/30 bg-accent-watt/5 text-accent-watt'
            : 'border-red-700/40 bg-red-900/10 text-red-400')
        }
      >
        <img
          src={vltCoinImg}
          alt=""
          width="18"
          height="18"
          style={{ imageRendering: 'pixelated' }}
        />
        <span>{vlt(totalPrice)} VLT</span>
      </div>

      <button
        type="button"
        onClick={() => onBuy(item.type, qty)}
        disabled={!canAfford || busy}
        className={
          'mt-auto w-full font-semibold py-2.5 rounded text-sm transition-all ' +
          (canAfford && !busy
            ? 'bg-accent-watt text-bg-abyss hover:brightness-110'
            : 'bg-[#374151] text-[#9ca3af] cursor-not-allowed')
        }
      >
        {/* Saying why the button is dead beats a grey rectangle. */}
        {busy ? 'Buying…' : canAfford ? 'Buy' : `Need ${vlt(unitPrice - vltBalance)} more VLT`}
      </button>
    </div>
  );
}

function Stat({ label, value, tone }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-text-muted">{label}</span>
      <span className={`font-mono ${tone === 'current' ? 'text-accent-current' : 'text-text-primary'}`}>
        {value}
      </span>
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────────── */

export default function Shop() {
  const { catalog, vltBalance, loading, fetchCatalog, fetchMining, buyAsset, error } =
    useAssetsStore();

  const pollingRef = useRef(null);
  const [activeCategory, setActiveCategory] = useState('generator');
  const [notice, setNotice] = useState(null); // { tone, message }

  useEffect(() => {
    fetchCatalog();
    fetchMining();

    // The catalog carries owned/installed counts, so it has to refresh too —
    // polling only the wallet left the "you own" figures stale after a purchase.
    pollingRef.current = setInterval(() => {
      fetchCatalog();
      fetchMining();
    }, 5000);

    return () => clearInterval(pollingRef.current);
  }, [fetchCatalog, fetchMining]);

  const items = useMemo(
    () => catalog.filter((item) => categoryOf(item.type) === activeCategory),
    [catalog, activeCategory]
  );

  const handleBuy = async (type, qty) => {
    setNotice(null);
    try {
      const result = await buyAsset(type, qty);
      const meta = metaFor(type);
      setNotice({
        tone: 'success',
        message: `Bought ${qty} × ${meta.label} for ${vlt(result.totalPrice)} VLT`,
      });
    } catch (err) {
      // Surfaced inline. A failed purchase used to fall through to the store's
      // `error`, which replaced the entire shop with an error box.
      setNotice({ tone: 'error', message: err.message || 'Purchase failed' });
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-2xl text-accent-watt tracking-wide">SHOP</h2>
        <p className="text-text-muted text-sm mt-1">
          Panels only produce once installed on a mount — buy both, then place them in your farm.
        </p>
      </div>

      {/*
        Purchase feedback and fetch failures are inline. A transient polling
        error used to replace the whole page, so a single dropped request wiped
        the shop until the next successful fetch.
      */}
      {notice && (
        <div
          role={notice.tone === 'error' ? 'alert' : 'status'}
          className={
            'border-2 px-3 py-2.5 text-xs ' +
            (notice.tone === 'success'
              ? 'border-accent-current bg-accent-current/10 text-accent-current'
              : 'border-danger-crt bg-danger-crt/10 text-danger-crt')
          }
        >
          {notice.message}
        </div>
      )}

      {error && !notice && (
        <div className="border-2 border-line-dusk bg-bg-panel px-3 py-2.5 text-xs text-text-muted">
          Could not refresh the shop: {error}
        </div>
      )}

      <div className="flex gap-6">
        <aside className="w-48 shrink-0 space-y-1">
          {CATEGORIES.map((cat) => {
            const isActive = activeCategory === cat.key;
            return (
              <button
                key={cat.key}
                type="button"
                onClick={() => setActiveCategory(cat.key)}
                className={
                  'w-full text-left flex items-center gap-3 px-4 py-3 rounded-lg text-sm transition-all ' +
                  (isActive
                    ? 'bg-accent-watt/10 text-accent-watt border border-accent-watt/20 font-semibold'
                    : 'text-text-muted hover:text-text-primary hover:bg-bg-panel border border-transparent')
                }
              >
                <span className="text-base w-5 text-center">{cat.icon}</span>
                <span>{cat.label}</span>
                {isActive && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-accent-watt" />}
              </button>
            );
          })}

          <div className="pt-3 mt-3 border-t border-line-dusk px-4">
            <p className="text-[10px] text-text-muted uppercase tracking-wider">Balance</p>
            <p className="font-mono text-sm text-accent-watt mt-0.5">{vlt(vltBalance)} VLT</p>
          </div>
        </aside>

        <div className="flex-1 min-w-0">
          {items.length === 0 ? (
            <p className="text-text-muted text-sm py-12 text-center">
              {catalog.length === 0 ? 'Loading catalog…' : 'Nothing in this category yet.'}
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {items.map((item) => (
                <ShopCard
                  key={item.type}
                  item={item}
                  vltBalance={vltBalance}
                  onBuy={handleBuy}
                  busy={loading}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
