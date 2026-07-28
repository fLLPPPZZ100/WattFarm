import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useAssetsStore } from '../store/assetsStore';
import { notify } from '../lib/notify.js';
import solarPanelImg from '../assets/items/panel-1-animation.gif';
import mount1Img from '../assets/items/mounts/mount-1.png';
import mount2Img from '../assets/items/mounts/mount-2.png';
import vltCoinImg from '../assets/coins/vlt-coin.png';

function withAlpha(hex, a) {
  if (!hex) return 'transparent';
  var r = parseInt(hex.slice(1, 3), 16);
  var g = parseInt(hex.slice(3, 5), 16);
  var b = parseInt(hex.slice(5, 7), 16);
  return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
}

/**
 * Formats a price with up to 2 decimal places and thousands separators.
 * @param {number} n
 * @returns {string}
 */
function fmtPrice(n) {
  return (n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function fmt(n) { return (n || 0).toFixed(1); }

function calcTotalPrice(unitPrice, qty) {
  if (qty <= 0) return 0;
  return Math.round(unitPrice * qty * 100) / 100;
}

/**
 * Most units buyable in one transaction.
 *
 * The server enforces the same ceiling (`MAX_PURCHASE_QUANTITY` in
 * routes/assets.js) and rejects anything above it, so this is only here to keep
 * the selector from offering a quantity that is guaranteed to fail. Keep both
 * values in sync.
 */
var MAX_QTY = 99;

/**
 * Keeps a quantity inside 1..MAX_QTY.
 *
 * Every control that changes the quantity goes through this. The `+` button and
 * the text input previously incremented and parsed without a ceiling, so typing
 * or clicking past 99 produced a total the server would refuse.
 *
 * @param {number} n
 * @returns {number}
 */
function clampQty(n) {
  if (!Number.isFinite(n)) return 1;
  return Math.min(MAX_QTY, Math.max(1, Math.floor(n)));
}

var CATEGORIES = [
  { key: 'promotions', label: 'Promotions', icon: '🔥' },
  { key: 'generators', label: 'Generators', icon: '⚡' },
  { key: 'supports', label: 'Supports', icon: '🔧' },
];

var DEFAULT_COLOR = '#2A3B4D';

var PROMOTIONS = [
  { id: 'starter-pack', label: 'Starter Pack', description: '1 Solar Panel + 50 VLT bonus', price: 25, originalPrice: 35, color: '#F2B84B', img: solarPanelImg },
];

var SUPPORTS = [
  { id: 'panel-mount', label: 'Single Mount', description: 'Ground mount for 1 solar panel', price: 15, color: '#8B7355', img: mount1Img },
  { id: 'panel-mount-double', label: 'Double Mount', description: 'Ground mount for 2 solar panels', price: 25, color: '#8B7355', img: mount2Img },
];

var GENERATOR_META = {
  solar: { label: 'Solar Panel', color: '#F2B84B', img: solarPanelImg, baseW: 1 },
};

/**
 * Per-category accent, used only for presentation: category tab highlight, card
 * glow and image backdrop. Rewards stay watt-yellow everywhere; this is what
 * stops every card reading as the same flat blue.
 *
 *   promotions → ember orange   generators → watt yellow   supports → steel blue
 */
function accentFor({ isPromo, isGenerator }) {
  if (isPromo) return '#F5923B';
  if (isGenerator) return '#F2B84B';
  return '#6FB7D6';
}

/**
 * Display name for an asset id, so a notification can say "Double Mount"
 * instead of "panel-mount-double".
 *
 * @param {string} id
 * @returns {string} the catalogue label, or the id itself if it is unknown
 */
function itemLabel(id) {
  if (GENERATOR_META[id]) return GENERATOR_META[id].label;
  for (var i = 0; i < SUPPORTS.length; i++) {
    if (SUPPORTS[i].id === id) return SUPPORTS[i].label;
  }
  return id;
}

/* ── Quantity stepper ───────────────────────────────────────────────
   Presentation only. Every mutation still routes through clampQty and the
   same setQty, so the bounds behave exactly as before. */
function QtyStepper({ qty, setQty }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-1 rounded-xl border border-line-dusk bg-bg-abyss/70 p-1">
        <button
          type="button"
          onClick={function () { setQty(clampQty(qty - 1)); }}
          disabled={qty <= 1}
          aria-label="Decrease quantity"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-xl font-bold leading-none text-text-muted
                     transition-all hover:bg-bg-panel hover:text-accent-watt active:scale-90
                     disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-text-muted"
        >−</button>
        <input
          type="text"
          inputMode="numeric"
          value={qty}
          onChange={function (e) {
            // An empty field is a legitimate intermediate state while typing,
            // so it falls back to 1 rather than rejecting the keystroke.
            if (e.target.value === '') { setQty(1); return; }
            var v = parseInt(e.target.value, 10);
            if (!isNaN(v)) setQty(clampQty(v));
          }}
          aria-label="Quantity"
          className="h-9 w-12 bg-transparent text-center font-mono text-lg font-semibold text-text-primary outline-none
                     [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <button
          type="button"
          onClick={function () { setQty(clampQty(qty + 1)); }}
          disabled={qty >= MAX_QTY}
          aria-label="Increase quantity"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-xl font-bold leading-none text-text-muted
                     transition-all hover:bg-bg-panel hover:text-accent-watt active:scale-90
                     disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-text-muted"
        >+</button>
      </div>

      <button
        type="button"
        onClick={function () { setQty(MAX_QTY); }}
        className="rounded-lg border border-accent-watt/30 bg-accent-watt/10 px-3.5 py-2 font-display text-[11px] uppercase tracking-wide text-accent-watt
                   transition-all hover:-translate-y-0.5 hover:border-accent-watt/60 hover:bg-accent-watt/20 active:translate-y-0"
      >
        Max
      </button>
    </div>
  );
}

/* ── Buy button ─────────────────────────────────────────────────────
   The screen's primary CTA. Chunky pixel bevel (hard bottom shadow in the
   watt-dim tone) that compresses on press, so it reads as a physical button. */
function BuyButton({ enabled, loading, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!enabled || loading}
      className={
        'mt-1 w-full rounded-xl py-3.5 font-display text-sm uppercase tracking-wide transition-all duration-150 ' +
        (enabled
          ? 'bg-gradient-to-b from-[#F7D089] to-[#F2B84B] text-bg-abyss ' +
            'shadow-[0_5px_0_0_#A97F24,0_10px_18px_-6px_rgba(242,184,75,0.45)] ' +
            'hover:-translate-y-0.5 hover:brightness-105 ' +
            'hover:shadow-[0_6px_0_0_#A97F24,0_14px_24px_-6px_rgba(242,184,75,0.55)] ' +
            'active:translate-y-1 active:shadow-[0_2px_0_0_#A97F24]'
          : 'cursor-not-allowed bg-[#212c3a] text-[#5b6a7d]')
      }
    >
      {loading ? 'Buying…' : label}
    </button>
  );
}

// ===== SINGLE UNIFIED SHOP CARD =====
function ShopCard({ item, color, img, owned, isPromo, isGenerator, isSupport, vltBalance, onBuy, loading }) {
  var safeColor = color || DEFAULT_COLOR;
  var [qty, setQty] = useState(1);
  var showPurchaseSystem = isGenerator || isSupport;

  var powerW = null;
  var unitPrice, totalPrice, canBuy, insufficient;

  if (isGenerator) {
    var meta = GENERATOR_META[item.type] || {};
    powerW = item.baseW || meta.baseW || 0;
    // Authoritative price from server (exponential pricing)
    unitPrice = item.currentPrice || item.basePrice || 0;
  } else {
    unitPrice = item.price || 0;
  }

  totalPrice = calcTotalPrice(unitPrice, qty);
  canBuy = totalPrice > 0 && totalPrice <= vltBalance;
  insufficient = totalPrice > 0 && totalPrice > vltBalance;

  var accent = accentFor({ isPromo: isPromo, isGenerator: isGenerator });

  return (
    <div
      className={
        'group relative flex flex-col gap-4 rounded-2xl border p-6 transition-all duration-200 ease-out ' +
        'border-line-dusk/70 shadow-[0_6px_20px_-8px_rgba(0,0,0,0.65)] ' +
        'bg-gradient-to-b ' + (isPromo ? 'from-[#2a2417] to-[#121a27]' : 'from-[#1b2c43] to-[#0e1b2a]') + ' ' +
        'hover:-translate-y-1 hover:scale-[1.015] ' +
        'hover:border-[color:var(--card-border)] hover:shadow-[0_16px_38px_-12px_var(--card-glow)]'
      }
      style={{ '--card-glow': withAlpha(accent, 0.3), '--card-border': withAlpha(accent, 0.55) }}
    >
      {/* Sale badge */}
      {isPromo && (
        <span className="absolute -top-2.5 right-4 z-10 rounded-full bg-gradient-to-r from-[#F5923B] to-[#F2B84B]
                         px-2.5 py-0.5 font-display text-[10px] uppercase tracking-wider text-bg-abyss
                         shadow-[0_2px_10px_rgba(245,146,59,0.55)]">
          Sale
        </span>
      )}

      {/* Inventory count — uses the owned prop already passed in; no new data. */}
      {showPurchaseSystem && owned > 0 && (
        <span className="absolute left-3 top-3 z-10 rounded-md border border-line-dusk bg-bg-abyss/85 px-2 py-0.5
                         font-mono text-[10px] text-text-muted backdrop-blur-sm">
          ×{owned} owned
        </span>
      )}

      {/* ── Product image: enlarged, lit from within ── */}
      <div
        className="relative flex h-[172px] w-full items-center justify-center overflow-hidden rounded-xl border border-white/5"
        style={{
          background:
            'radial-gradient(circle at 50% 42%, ' + withAlpha(accent, 0.2) + ', rgba(11,22,34,0) 70%), ' +
            'linear-gradient(180deg, #16273d 0%, #0d1a29 100%)',
        }}
      >
        {/* Soft floor glow under the item. */}
        <div
          className="pointer-events-none absolute inset-x-8 bottom-4 h-6 rounded-full blur-md"
          style={{ background: withAlpha(accent, 0.28) }}
          aria-hidden="true"
        />
        {img ? (
          <img
            src={img}
            alt={item.label}
            className="relative max-h-[136px] object-contain drop-shadow-[0_8px_12px_rgba(0,0,0,0.5)]
                       transition-transform duration-300 ease-out group-hover:scale-110"
            style={{ imageRendering: 'pixelated' }}
          />
        ) : (
          <span className="font-display text-4xl opacity-40" style={{ color: safeColor }}>
            {(item.label || item.type || '').slice(0, 2).toUpperCase()}
          </span>
        )}
      </div>

      {/* ── Title + headline stat ── */}
      <div className="flex flex-col gap-2">
        <p className="text-heading-md text-text-primary">{item.label || item.type}</p>

        {/* Power is the hero of a generator card: value only, big, glowing yellow. */}
        {isGenerator && powerW > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xl leading-none" aria-hidden="true">⚡</span>
            <span className="font-mono text-2xl font-bold text-accent-watt drop-shadow-[0_0_10px_rgba(242,184,75,0.4)]">
              +{powerW.toFixed(1)} W/s
            </span>
          </div>
        )}

        {/* Supports and promos have no output; their line is the description. */}
        {!isGenerator && item.description && (
          <p className="text-body-sm text-text-muted leading-snug">{item.description}</p>
        )}
      </div>

      {/* ── Promotions: price only (no quantity system) ── */}
      {!showPurchaseSystem && (
        <div className="flex items-center gap-2">
          <img
            src={vltCoinImg}
            alt="VLT"
            width="22"
            height="22"
            style={{ imageRendering: 'pixelated', filter: 'drop-shadow(0 0 5px rgba(242,184,75,0.5))' }}
          />
          <span className="font-mono text-2xl font-bold text-accent-watt">{fmtPrice(item.price)}</span>
          <span className="font-display text-xs uppercase tracking-wide text-accent-watt/80">VLT</span>
          {isPromo && item.originalPrice ? (
            <span className="ml-1 font-mono text-sm text-text-muted line-through">{fmtPrice(item.originalPrice)}</span>
          ) : null}
        </div>
      )}

      {/* ── Generators & supports: quantity → total → buy ── */}
      {showPurchaseSystem && (
        <>
          <QtyStepper qty={qty} setQty={setQty} />

          {/* Total, the number the eye lands on before the button. */}
          <div className="flex items-end justify-between rounded-xl border border-line-dusk/70 bg-bg-abyss/50 px-3.5 py-2.5">
            <div className="flex flex-col">
              <span className="text-label text-text-muted">Total</span>
              <span className="font-mono text-[11px] text-text-muted">Unit {fmtPrice(unitPrice)} VLT</span>
            </div>
            <div className={'flex items-center gap-1.5 ' + (insufficient ? 'text-danger-crt' : 'text-accent-watt')}>
              <img
                src={vltCoinImg}
                alt="VLT"
                width="20"
                height="20"
                className="inline-block"
                style={
                  insufficient
                    ? { imageRendering: 'pixelated', filter: 'grayscale(0.5) sepia(1) hue-rotate(-30deg) saturate(4) brightness(0.9)' }
                    : { imageRendering: 'pixelated', filter: 'drop-shadow(0 0 5px rgba(242,184,75,0.45))' }
                }
              />
              <span className="font-mono text-xl font-bold">{fmtPrice(totalPrice)}</span>
              <span className="font-display text-xs uppercase tracking-wide opacity-80">VLT</span>
            </div>
          </div>

          <BuyButton
            enabled={canBuy}
            loading={loading}
            label="Buy"
            onClick={function () { onBuy(item.id || item.type, clampQty(qty)); }}
          />
        </>
      )}

      {/* ── Promotions: buy action (no quantity) ── */}
      {!showPurchaseSystem && (
        <BuyButton
          enabled={!loading}
          loading={loading}
          label={'Buy · ' + fmtPrice(unitPrice) + ' VLT'}
          onClick={function () { onBuy(item.id || item.type, 1); }}
        />
      )}
    </div>
  );
}

// ===== MAIN SHOP PAGE =====
export default function Shop() {
  var { user } = useAuth();
  var { catalog, assets, totalW, vltBalance, loading, fetchCatalog, fetchMining, buyAsset, clearError, error } = useAssetsStore();
  var pollingRef = useRef(null);
  var [activeCategory, setActiveCategory] = useState('promotions');

  useEffect(function () {
    if (!user) return;
    fetchCatalog();
    fetchMining();
    pollingRef.current = setInterval(fetchMining, 4000);
    return function () { clearInterval(pollingRef.current); };
  }, [user, fetchCatalog, fetchMining]);

  // No unauthenticated branch: RequireAuth gates this route.
  if (error) { return (<div className="flex items-center justify-center py-32"><div className="bg-red-900/20 border border-red-800 rounded-lg p-6 text-center max-w-md"><p className="text-red-400 text-sm">{error}</p></div></div>); }

  var ownedMap = {};
  for (var i = 0; i < assets.length; i++) { ownedMap[assets[i].type] = assets[i].quantity; }

  var handleBuy = async function (id, qty) {
    var quantity = qty || 1;
    var label = itemLabel(id);

    try {
      var result = await buyAsset(id, quantity);

      // Read the total defensively: a TypeError while building this string would
      // be caught below and reported as a failed purchase that in fact succeeded.
      var paid = result && typeof result.totalPrice === 'number' ? result.totalPrice : null;

      notify.success(
        'Purchase complete',
        paid !== null
          ? quantity + 'x ' + label + ' for ' + fmtPrice(paid) + ' VLT — now in your storage.'
          : quantity + 'x ' + label + ' is now in your storage.'
      );
    } catch (err) {
      /**
       * The API answers an unaffordable purchase with the exact figures, so the
       * notification can state the shortfall rather than the useless
       * "insufficient balance". This is also the path that surfaces a price the
       * client had wrong: the server is authoritative, and the player now sees
       * how much is actually missing.
       */
      var payload = err && err.payload;
      var shortfall =
        payload && typeof payload.required === 'number' && typeof payload.balance === 'number'
          ? payload.required - payload.balance
          : null;

      if (shortfall !== null && shortfall > 0) {
        notify.error(
          'Insufficient VLT',
          'You need ' + fmtPrice(shortfall) + ' more VLT for ' + quantity + 'x ' + label + '.'
        );
      } else {
        notify.error(
          'Purchase failed',
          (err && err.message) || 'Could not complete the purchase. Try again.'
        );
      }

      /**
       * The failure has been reported, so drop it from the store: `error` is
       * rendered as a full-page block below, which would replace the entire shop
       * because one purchase was refused.
       */
      clearError();
    }
  };

  var genCatalog = catalog.filter(function (c) { return c.type === 'solar'; });

  // Section heading colour follows the active category's accent.
  var sectionAccent = activeCategory === 'promotions' ? '#F5923B' : activeCategory === 'supports' ? '#6FB7D6' : '#F2B84B';

  return (
    <div className="relative">
      {/* Soft warm glow behind the grid — depth without leaving the dark theme. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-8 left-1/2 h-72 w-[70%] -translate-x-1/2 rounded-full blur-3xl"
        style={{ background: 'radial-gradient(circle, rgba(242,184,75,0.07), rgba(11,22,34,0) 70%)' }}
      />

      {/* Page header */}
      <div className="relative mb-6">
        <h1 className="text-heading-xl text-accent-watt">SHOP</h1>
        <p className="text-body-sm text-text-muted mt-1">
          Spend VLT on panels, mounts and limited deals.
        </p>
      </div>

      <div className="relative flex gap-6">
        {/* Categories sidebar */}
        <aside className="w-52 shrink-0 space-y-1.5">
          {CATEGORIES.map(function (cat) {
            var isActive = activeCategory === cat.key;
            var catAccent = cat.key === 'promotions' ? '#F5923B' : cat.key === 'supports' ? '#6FB7D6' : '#F2B84B';
            return (
              <button
                key={cat.key}
                onClick={function () { setActiveCategory(cat.key); }}
                className={
                  'group relative w-full overflow-hidden flex items-center gap-3 rounded-xl border px-3.5 py-3 text-sm transition-all duration-200 ' +
                  (isActive
                    ? 'border-line-dusk bg-bg-panel font-semibold text-text-primary shadow-[0_4px_16px_-6px_rgba(0,0,0,0.7)]'
                    : 'border-transparent text-text-muted hover:translate-x-0.5 hover:bg-bg-panel/50 hover:text-text-primary')
                }
              >
                {/* Active accent rail. */}
                {isActive && (
                  <span
                    className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full"
                    style={{ background: catAccent, boxShadow: '0 0 10px ' + withAlpha(catAccent, 0.75) }}
                    aria-hidden="true"
                  />
                )}
                <span
                  className="grid h-8 w-8 place-items-center rounded-lg text-base transition-colors"
                  style={isActive ? { background: withAlpha(catAccent, 0.16), color: catAccent } : undefined}
                >
                  {cat.icon}
                </span>
                <span>{cat.label}</span>
                {isActive && (
                  <span className="ml-auto h-1.5 w-1.5 rounded-full" style={{ background: catAccent }} aria-hidden="true" />
                )}
              </button>
            );
          })}
        </aside>

        {/* Content — keyed on the category so switching replays a soft fade. */}
        <div className="flex-1 min-w-0">
          {/* GENERATORS */}
          {activeCategory === 'generators' && (
            <section key="generators" className="animate-fade-in">
              <h2 className="text-heading-lg mb-4" style={{ color: sectionAccent }}>⚡ GENERATORS</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {genCatalog.map(function (item) {
                  var meta = GENERATOR_META[item.type] || {};
                  return (
                    <ShopCard key={item.type}
                      item={{ ...item, label: meta.label, description: '+' + (meta.baseW || item.baseW || 0) + ' W/s production' }}
                      color={meta.color} img={meta.img}
                      owned={ownedMap[item.type] || 0} isGenerator vltBalance={vltBalance} onBuy={handleBuy} loading={loading} />
                  );
                })}
              </div>
            </section>
          )}

          {/* PROMOTIONS */}
          {activeCategory === 'promotions' && (
            <section key="promotions" className="animate-fade-in">
              <h2 className="text-heading-lg mb-4" style={{ color: sectionAccent }}>🔥 PROMOTIONS</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {PROMOTIONS.map(function (item) {
                  return (
                    <ShopCard key={item.id} item={item} color={item.color} img={item.img}
                      owned={0} isPromo vltBalance={vltBalance} loading={false}
                      onBuy={function () {
                        // Bundles are not implemented server-side yet. A blocking
                        // window.alert for that is heavy-handed; this is the same
                        // information without stopping the page.
                        notify.info(item.label, 'Bundles are not available yet — coming soon.');
                      }} />
                  );
                })}
              </div>
            </section>
          )}

          {/* SUPPORTS */}
          {activeCategory === 'supports' && (
            <section key="supports" className="animate-fade-in">
              <h2 className="text-heading-lg mb-4" style={{ color: sectionAccent }}>🔧 SUPPORTS</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {SUPPORTS.map(function (item) {
                  return (
                    <ShopCard key={item.id} item={item} color={item.color} img={item.img}
                      owned={ownedMap[item.id] || 0} isSupport vltBalance={vltBalance} onBuy={handleBuy} loading={loading} />
                  );
                })}
              </div>
            </section>
          )}

        </div>
      </div>
    </div>
  );
}
