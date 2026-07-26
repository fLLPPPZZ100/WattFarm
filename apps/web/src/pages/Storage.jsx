import { useEffect, useMemo, useRef, useState } from 'react';

import { useAssetsStore } from '../store/assetsStore';
import { metaFor, categoryOf } from '../data/items.js';
import PixelImage from '../components/ui/PixelImage.jsx';
import vltCoinImg from '../assets/coins/vlt-coin.png';

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

function vlt(amount) {
  const value = Number(amount) || 0;
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

/**
 * Inventory.
 *
 * Availability and item values come from the catalog rather than from constants
 * in this file. The previous version hardcoded mount prices, so raising the
 * double mount to 45 VLT left the inventory valuing it at 25, and it derived
 * "available" by subtracting a combined mount count from the single-mount total —
 * so installing a double made a single appear to vanish.
 */
export default function Storage() {
  const { catalog, fetchCatalog, fetchMining } = useAssetsStore();
  const pollingRef = useRef(null);
  const [activeCategory, setActiveCategory] = useState('generator');

  useEffect(() => {
    fetchCatalog();
    fetchMining();

    pollingRef.current = setInterval(() => {
      fetchCatalog();
      fetchMining();
    }, 8000);

    return () => clearInterval(pollingRef.current);
  }, [fetchCatalog, fetchMining]);

  const items = useMemo(
    () => catalog.filter((item) => categoryOf(item.type) === activeCategory),
    [catalog, activeCategory]
  );

  const totals = useMemo(() => {
    let owned = 0;
    let installed = 0;
    let value = 0;

    for (const item of catalog) {
      owned += item.owned || 0;
      installed += item.placed || 0;
      value += (item.owned || 0) * (item.price || 0);
    }

    return { owned, installed, value: Math.round(value * 100) / 100 };
  }, [catalog]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl text-accent-watt tracking-wide">STORAGE</h2>
        <p className="text-text-muted text-sm mt-1">
          {totals.owned} item{totals.owned === 1 ? '' : 's'} owned · {totals.installed} installed ·{' '}
          <span className="font-mono text-accent-watt">{vlt(totals.value)} VLT</span> invested
        </p>
      </div>

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
        </aside>

        <div className="flex-1 min-w-0">
          {items.length === 0 ? (
            <p className="text-text-muted text-sm py-12 text-center">
              {catalog.length === 0 ? 'Loading inventory…' : 'Nothing in this category yet.'}
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {items.map((item) => (
                <InventoryCard key={item.type} item={item} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InventoryCard({ item }) {
  const meta = metaFor(item.type);
  const owned = item.owned || 0;
  const placed = item.placed || 0;
  const available = item.available != null ? item.available : Math.max(0, owned - placed);
  const has = owned > 0;

  const bonusPercent = item.powerBonus ? Math.round(item.powerBonus * 100) : 0;

  return (
    <div
      className={
        'rounded-xl border border-line-dusk bg-bg-abyss p-5 flex flex-col gap-4 transition-all ' +
        (has ? 'hover:border-accent-watt/20' : 'opacity-50')
      }
    >
      <div
        className="w-full h-[136px] rounded-lg flex items-center justify-center overflow-hidden"
        style={{ backgroundColor: withAlpha(meta.colour, 0.08) }}
      >
        {meta.img ? (
          <PixelImage
            src={meta.img}
            alt={meta.label}
            sourceSize={meta.spriteWidth}
            sourceHeight={meta.spriteHeight}
            size={meta.spriteWidth * meta.cardScale}
          />
        ) : (
          <span className="font-display text-3xl opacity-40" style={{ color: meta.colour }}>
            {(meta.label || item.type).slice(0, 2).toUpperCase()}
          </span>
        )}
      </div>

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

      {has ? (
        <>
          <div className="space-y-1 text-[11px]">
            <Row label="Owned" value={owned} />
            <Row label="Installed" value={placed} tone={placed > 0 ? 'current' : undefined} />
            <Row
              label="In storage"
              value={available}
              tone={available > 0 ? 'watt' : undefined}
            />
          </div>

          <div className="flex items-center justify-center gap-1.5 py-2 rounded-lg border border-accent-watt/30 bg-accent-watt/5 text-accent-watt text-sm font-mono">
            <PixelImage src={vltCoinImg} sourceSize={32} size={16} />
            <span>{vlt(owned * (item.price || 0))} VLT</span>
          </div>
        </>
      ) : (
        <p className="text-center text-text-muted text-xs mt-auto">Not owned</p>
      )}
    </div>
  );
}

function Row({ label, value, tone }) {
  const colour =
    tone === 'current' ? 'text-accent-current' : tone === 'watt' ? 'text-accent-watt' : 'text-text-primary';

  return (
    <div className="flex items-baseline justify-between">
      <span className="text-text-muted">{label}</span>
      <span className={`font-mono ${colour}`}>{value}</span>
    </div>
  );
}
