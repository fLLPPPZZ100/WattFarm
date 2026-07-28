import { useEffect, useRef, useState } from 'react';
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

/** Per-category accent, so the shelves do not all read as the same blue. */
var CATEGORY_ACCENT = {
  promotions: '#F5923B',
  generators: '#F2B84B',
  supports: '#6FB7D6',
};

var DEFAULT_COLOR = '#2A3B4D';

var PROMOTIONS = [
  {
    id: 'starter-pack',
    label: 'Starter Pack',
    benefit: '1 PANEL + 50 VLT',
    price: 25,
    originalPrice: 35,
    color: '#F2B84B',
    img: solarPanelImg,
  },
];

/**
 * Support presentation, keyed by catalogue type.
 *
 * No prices here on purpose. These used to carry their own `price`, and the
 * double mount's copy said 25 VLT while the catalogue charged 45 — so the card
 * enabled Buy on a total the server then refused. Price now comes from
 * `/api/assets/catalog` for supports exactly as it already did for generators,
 * which removes the possibility of the two disagreeing.
 */
var SUPPORT_META = {
  'panel-mount': {
    label: 'Single Mount',
    benefit: '1 PANEL SLOT',
    color: '#8B7355',
    img: mount1Img,
  },
  'panel-mount-double': {
    label: 'Double Mount',
    benefit: '2 PANEL SLOTS',
    benefitNote: '+25% panel output',
    color: '#8B7355',
    img: mount2Img,
  },
};

/** Display order for the supports shelf. */
var SUPPORT_ORDER = ['panel-mount', 'panel-mount-double'];

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
  if (isPromo) return CATEGORY_ACCENT.promotions;
  if (isGenerator) return CATEGORY_ACCENT.generators;
  return CATEGORY_ACCENT.supports;
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
  if (SUPPORT_META[id]) return SUPPORT_META[id].label;
  return id;
}

/* ── Quantity stepper ───────────────────────────────────────────────
   Presentation only. It looks like a game control rather than an HTML form,
   but keeps the editable input and every mutation still routes through the
   same clampQty/setQty path. */
function QtyStepper({ qty, setQty }) {
  return (
    <div className="flex items-center gap-2" aria-label="Purchase quantity">
      <div className="flex flex-1 items-center rounded-lg border-2 border-line-dusk bg-[#09131e] p-1 shadow-pixel-inset">
        <button
          type="button"
          onClick={function () { setQty(clampQty(qty - 1)); }}
          disabled={qty <= 1}
          aria-label="Decrease quantity"
          className="flex h-10 w-11 items-center justify-center border-r border-line-dusk text-xl font-bold leading-none text-text-muted
                     transition-all duration-150 hover:bg-bg-panel hover:text-accent-watt active:scale-90
                     disabled:cursor-not-allowed disabled:opacity-25 disabled:hover:bg-transparent disabled:hover:text-text-muted"
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
          className="h-10 min-w-0 flex-1 bg-transparent text-center font-mono text-xl font-bold text-text-primary outline-none
                     transition-colors focus:text-accent-watt [appearance:textfield]
                     [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <button
          type="button"
          onClick={function () { setQty(clampQty(qty + 1)); }}
          disabled={qty >= MAX_QTY}
          aria-label="Increase quantity"
          className="flex h-10 w-11 items-center justify-center border-l border-line-dusk text-xl font-bold leading-none text-text-muted
                     transition-all duration-150 hover:bg-bg-panel hover:text-accent-watt active:scale-90
                     disabled:cursor-not-allowed disabled:opacity-25 disabled:hover:bg-transparent disabled:hover:text-text-muted"
        >+</button>
      </div>

      <button
        type="button"
        onClick={function () { setQty(MAX_QTY); }}
        className="h-[52px] rounded-lg border-2 border-accent-watt/40 bg-accent-watt/10 px-4 font-display text-xs uppercase tracking-wide text-accent-watt
                   shadow-pixel-sm transition-all duration-150 hover:-translate-y-0.5 hover:border-accent-watt hover:bg-accent-watt/20
                   active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
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
        'relative mt-1 w-full overflow-hidden rounded-lg border-2 py-4 font-display text-sm uppercase tracking-[0.08em] transition-all duration-150 ' +
        (enabled
          ? 'border-[#F7D089] bg-gradient-to-b from-[#F8D793] to-[#F2B84B] text-bg-abyss ' +
            'shadow-[0_5px_0_0_#8A6A2B,0_12px_24px_-8px_rgba(242,184,75,0.5)] ' +
            'hover:-translate-y-0.5 hover:brightness-110 hover:scale-[1.01] ' +
            'hover:shadow-[0_6px_0_0_#8A6A2B,0_16px_28px_-8px_rgba(242,184,75,0.6)] ' +
            'active:translate-y-1 active:scale-[0.99] active:shadow-[0_1px_0_0_#8A6A2B]'
          : 'cursor-not-allowed border-line-dusk bg-[#1b2735] text-[#5b6a7d] shadow-none')
      }
    >
      {enabled && !loading && (
        <span className="pointer-events-none absolute inset-y-0 -left-12 w-8 -skew-x-12 bg-white/25 opacity-0 blur-sm
                         transition-all duration-500 group-hover:left-[110%] group-hover:opacity-100" />
      )}
      <span className="relative">{loading ? 'Buying…' : label}</span>
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
  }

  if (showPurchaseSystem) {
    // Authoritative price from the server catalogue (exponential pricing).
    // Applies to generators and supports alike — anything the buy endpoint
    // actually sells is priced by the endpoint, never by this file.
    unitPrice = item.currentPrice || item.basePrice || 0;
  } else {
    // Promotions are static placeholders with no catalogue row yet.
    unitPrice = item.price || 0;
  }

  totalPrice = calcTotalPrice(unitPrice, qty);
  canBuy = totalPrice > 0 && totalPrice <= vltBalance;
  insufficient = totalPrice > 0 && totalPrice > vltBalance;

  var accent = accentFor({ isPromo: isPromo, isGenerator: isGenerator });
  var displayPrice = showPurchaseSystem ? totalPrice : item.price;
  // Promotions are informational placeholders today and do not call the buy
  // endpoint, so only real purchases should turn the price red for low funds.
  var priceInsufficient = showPurchaseSystem && insufficient;

  return (
    <article
      className={
        'group relative flex h-full flex-col overflow-hidden rounded-xl border-2 border-line-dusk bg-[#101d2b] ' +
        'shadow-[6px_7px_0_#07101a,0_18px_32px_-20px_rgba(0,0,0,0.9)] ' +
        'transition-all duration-200 ease-out hover:-translate-y-1 hover:border-[color:var(--card-border)] ' +
        'hover:shadow-[6px_9px_0_#07101a,0_24px_42px_-18px_var(--card-glow)]'
      }
      style={{ '--card-glow': withAlpha(accent, 0.38), '--card-border': withAlpha(accent, 0.68) }}
    >
      {/* Category-coloured edge: a game-item frame, not a generic form card. */}
      <div className="h-1.5 w-full shrink-0" style={{ background: accent, boxShadow: '0 0 14px ' + withAlpha(accent, 0.6) }} />

      {isPromo && (
        <span className="absolute right-3 top-3 z-20 border border-[#ffc06e] bg-[#d86b28] px-2.5 py-1
                         font-display text-[10px] uppercase tracking-wider text-white shadow-pixel-sm">
          Soon
        </span>
      )}

      {showPurchaseSystem && owned > 0 && (
        <span
          aria-label={`${owned} owned`}
          className="absolute left-3 top-3 z-20 border border-line-dusk bg-bg-abyss/90 px-2 py-1
                     font-mono text-[10px] text-text-muted shadow-pixel-sm backdrop-blur-sm"
        >
          ×{owned} owned
        </span>
      )}

      {/* Product first: oversized art on its own lit stage. */}
      <div
        className="relative mx-3 mt-3 flex h-[190px] items-center justify-center overflow-hidden border border-white/5"
        style={{
          background:
            'radial-gradient(circle at 50% 38%, ' + withAlpha(accent, 0.25) + ', rgba(11,22,34,0) 62%), ' +
            'linear-gradient(180deg, #1a3048 0%, #0b1724 100%)',
        }}
      >
        <div className="pointer-events-none absolute inset-0 opacity-25 pixel-grid" aria-hidden="true" />
        <div
          className="pointer-events-none absolute bottom-4 h-7 w-2/3 rounded-full blur-lg"
          style={{ background: withAlpha(accent, 0.35) }}
          aria-hidden="true"
        />
        {img ? (
          <img
            src={img}
            alt={item.label}
            className="relative max-h-[154px] max-w-[88%] object-contain drop-shadow-[0_10px_12px_rgba(0,0,0,0.58)]
                       transition-transform duration-300 ease-out group-hover:scale-[1.09] group-hover:-translate-y-1"
            style={{ imageRendering: 'pixelated' }}
          />
        ) : (
          <span className="font-display text-4xl opacity-50" style={{ color: safeColor }}>
            {(item.label || item.type || '').slice(0, 2).toUpperCase()}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-4 p-5 pt-4">
        {/* Name second. */}
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-heading-lg text-text-primary">{item.label || item.type}</h3>
        </div>

        {/* Benefit third. One glance answers why this upgrade matters. */}
        <div
          className="flex min-h-[62px] items-center gap-3 border-l-4 px-3 py-2.5"
          style={{ borderColor: accent, background: withAlpha(accent, 0.09) }}
        >
          <span className="text-2xl leading-none" aria-hidden="true">
            {isGenerator ? '⚡' : isPromo ? '✦' : '▣'}
          </span>
          <div className="min-w-0">
            {isGenerator && powerW > 0 ? (
              <span className="block font-mono text-[28px] font-bold leading-none text-accent-watt drop-shadow-[0_0_10px_rgba(242,184,75,0.45)]">
                +{powerW.toFixed(1)} W/s
              </span>
            ) : (
              <span className="block font-display text-lg font-semibold leading-tight" style={{ color: accent }}>
                {item.benefit}
              </span>
            )}
            {item.benefitNote && (
              <span className="mt-1 block text-[11px] font-semibold text-accent-current">{item.benefitNote}</span>
            )}
          </div>
        </div>

        {/* Purchase dock: quantity → price → BUY. No form-like labels. */}
        <div className="mt-auto flex flex-col gap-3 border-t border-line-dusk/70 pt-4">
          {showPurchaseSystem && <QtyStepper qty={qty} setQty={setQty} />}

          <div className="flex min-h-[45px] items-center justify-center gap-2">
            {showPurchaseSystem && <span className="mr-1 text-label text-text-muted">Total</span>}
            <img
              src={vltCoinImg}
              alt="VLT"
              width="26"
              height="26"
              style={
                priceInsufficient
                  ? { imageRendering: 'pixelated', filter: 'grayscale(0.5) sepia(1) hue-rotate(-30deg) saturate(4) brightness(0.9)' }
                  : { imageRendering: 'pixelated', filter: 'drop-shadow(0 0 7px rgba(242,184,75,0.55))' }
              }
            />
            <span className={'font-mono text-[26px] font-bold ' + (priceInsufficient ? 'text-danger-crt' : 'text-accent-watt')}>
              {fmtPrice(displayPrice)}
            </span>
            <span className={'font-display text-sm uppercase tracking-wide ' + (priceInsufficient ? 'text-danger-crt/80' : 'text-accent-watt/80')}>
              VLT
            </span>
            {isPromo && item.originalPrice ? (
              <span className="ml-1 font-mono text-sm text-text-muted line-through">{fmtPrice(item.originalPrice)}</span>
            ) : null}
          </div>

          {showPurchaseSystem ? (
            <BuyButton
              enabled={canBuy}
              loading={loading}
              label="Buy"
              onClick={function () { onBuy(item.id || item.type, clampQty(qty)); }}
            />
          ) : (
            <BuyButton
              enabled={!loading}
              loading={loading}
              label="Coming Soon"
              onClick={function () { onBuy(item.id || item.type, 1); }}
            />
          )}
        </div>
      </div>
    </article>
  );
}

// ===== MAIN SHOP PAGE =====
export default function Shop() {
  var { user } = useAuth();
  var { catalog, assets, vltBalance, loading, fetchCatalog, fetchMining, buyAsset, clearError, error } = useAssetsStore();
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

  /**
   * Supports, built from the catalogue in a fixed display order.
   *
   * Driving the shelf off the catalogue means a type the server does not sell
   * simply does not appear, rather than rendering a card whose Buy is
   * guaranteed to fail.
   */
  var supportCatalog = SUPPORT_ORDER.map(function (type) {
    var entry = catalog.find(function (c) { return c.type === type; });
    return entry ? { ...entry, id: type, ...SUPPORT_META[type] } : null;
  }).filter(Boolean);

  // Section heading colour follows the active category's accent.
  var sectionAccent = CATEGORY_ACCENT[activeCategory] || CATEGORY_ACCENT.generators;

  return (
    <div className="relative pb-10">
      {/* Layered ambient light: enough depth to feel like a shop room, never a dashboard panel. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-20 -top-24 h-96 w-96 rounded-full blur-3xl"
        style={{ background: 'radial-gradient(circle, rgba(242,184,75,0.08), rgba(11,22,34,0) 68%)' }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-20 top-20 h-80 w-80 rounded-full blur-3xl"
        style={{ background: 'radial-gradient(circle, rgba(95,212,196,0.045), rgba(11,22,34,0) 70%)' }}
      />

      {/* Shop masthead: identity on the left, buying power on the right. */}
      <header className="relative mb-5 flex items-center justify-between gap-4 border-b border-line-dusk pb-5">
        <div>
          <h1 className="text-heading-xl text-accent-watt">SHOP</h1>
          <p className="text-body-sm mt-1 text-text-muted">Turn VLT into a stronger farm.</p>
        </div>
        <div className="flex items-center gap-2 border-2 border-line-dusk bg-bg-panel px-3 py-2 shadow-pixel-sm">
          <img
            src={vltCoinImg}
            alt=""
            width="26"
            height="26"
            style={{ imageRendering: 'pixelated', filter: 'drop-shadow(0 0 6px rgba(242,184,75,0.5))' }}
          />
          <div className="text-right">
            <p className="text-label text-text-muted">Available</p>
            <p className="font-mono text-base font-semibold leading-tight text-accent-watt">{fmtPrice(vltBalance)} VLT</p>
          </div>
        </div>
      </header>

      {/* Horizontal shop shelves free the full width for products and do not read like admin navigation. */}
      <nav
        className="relative flex gap-2 overflow-x-auto pb-1 sm:grid sm:grid-cols-3 sm:overflow-visible sm:pb-0"
        aria-label="Shop categories"
      >
        {CATEGORIES.map(function (cat) {
          var isActive = activeCategory === cat.key;
          var catAccent = CATEGORY_ACCENT[cat.key] || CATEGORY_ACCENT.generators;
          return (
            <button
              key={cat.key}
              type="button"
              onClick={function () { setActiveCategory(cat.key); }}
              aria-pressed={isActive}
              className={
                'group relative flex min-w-[145px] flex-1 items-center justify-center gap-2 overflow-hidden border-2 px-3 py-3 font-semibold ' +
                'transition-all duration-200 sm:min-w-0 ' +
                (isActive
                  ? 'border-line-dusk bg-bg-panel text-text-primary shadow-pixel-sm -translate-y-0.5'
                  : 'border-transparent bg-bg-abyss/40 text-text-muted hover:-translate-y-0.5 hover:border-line-dusk hover:bg-bg-panel/70 hover:text-text-primary')
              }
            >
              <span
                className="grid h-8 w-8 shrink-0 place-items-center border transition-all duration-200 group-hover:scale-110"
                style={{
                  color: catAccent,
                  borderColor: isActive ? withAlpha(catAccent, 0.55) : 'transparent',
                  background: isActive ? withAlpha(catAccent, 0.14) : 'transparent',
                }}
              >
                {cat.icon}
              </span>
              <span className="truncate text-sm">{cat.label}</span>
              <span
                aria-hidden="true"
                className="absolute inset-x-0 bottom-0 h-1 transition-opacity duration-200"
                style={{ background: catAccent, opacity: isActive ? 1 : 0 }}
              />
            </button>
          );
        })}
      </nav>

      {/* Product shelf. Each category remounts, so the entrance animation replays naturally. */}
      <div className="relative mt-7">
        {activeCategory === 'generators' && (
          <section key="generators" className="animate-shop-enter">
            <div className="mb-4 flex items-center gap-3">
              <h2 className="text-heading-lg" style={{ color: sectionAccent }}>⚡ GENERATORS</h2>
              <span className="h-px flex-1" style={{ background: withAlpha(sectionAccent, 0.28) }} />
            </div>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {genCatalog.map(function (item) {
                var meta = GENERATOR_META[item.type] || {};
                return (
                  <ShopCard key={item.type}
                    item={{ ...item, label: meta.label }}
                    color={meta.color} img={meta.img}
                    owned={ownedMap[item.type] || 0} isGenerator vltBalance={vltBalance} onBuy={handleBuy} loading={loading} />
                );
              })}
            </div>
          </section>
        )}

        {activeCategory === 'promotions' && (
          <section key="promotions" className="animate-shop-enter">
            <div className="mb-4 flex items-center gap-3">
              <h2 className="text-heading-lg" style={{ color: sectionAccent }}>🔥 PROMOTIONS</h2>
              <span className="h-px flex-1" style={{ background: withAlpha(sectionAccent, 0.28) }} />
            </div>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
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

        {activeCategory === 'supports' && (
          <section key="supports" className="animate-shop-enter">
            <div className="mb-4 flex items-center gap-3">
              <h2 className="text-heading-lg" style={{ color: sectionAccent }}>🔧 SUPPORTS</h2>
              <span className="h-px flex-1" style={{ background: withAlpha(sectionAccent, 0.28) }} />
            </div>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {supportCatalog.map(function (item) {
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
  );
}
