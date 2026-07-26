import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useAssetsStore } from '../store/assetsStore';
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

function fmt(n) { return (n || 0).toFixed(1); }

function calcTotalPrice(unitPrice, qty) {
  if (qty <= 0) return 0;
  return Math.round(unitPrice * qty * 100) / 100;
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
    unitPrice = item.currentPrice || item.basePrice || 0;
  } else {
    unitPrice = item.price || 0;
  }

  totalPrice = calcTotalPrice(unitPrice, qty);
  canBuy = totalPrice > 0 && totalPrice <= vltBalance;
  insufficient = totalPrice > 0 && totalPrice > vltBalance;

  return (
    <div className="rounded-xl border border-line-dusk bg-bg-abyss hover:border-accent-watt/20 p-5 flex flex-col gap-4 transition-all relative"
      style={isPromo ? { borderColor: withAlpha('#F2B84B', 0.4), backgroundColor: withAlpha('#F2B84B', 0.05) } : {}}
    >
      {isPromo && (
        <span className="absolute -top-2 -right-2 bg-accent-watt text-bg-abyss font-bold text-xs px-2 py-0.5 rounded-full">SALE</span>
      )}

      {/* Image — consistent height */}
      <div className="w-full h-[120px] rounded-lg flex items-center justify-center" style={{ backgroundColor: withAlpha(safeColor, 0.08) }}>
        {img ? (
          <img src={img} alt={item.label} className="max-h-full object-contain" style={{ imageRendering: 'pixelated' }} />
        ) : (
          <span className="font-display text-3xl opacity-40" style={{ color: safeColor }}>{(item.label || item.type || '').slice(0, 2).toUpperCase()}</span>
        )}
      </div>

      {/* Name + production */}
      <div>
        <p className="font-display text-sm text-text-primary tracking-wide">{item.label || item.type}</p>
        {isGenerator && powerW > 0 && (
          <p className="text-text-muted text-xs mt-0.5">+{powerW.toFixed(1)} W/s production</p>
        )}
        {!isGenerator && item.description && (
          <p className="text-text-muted text-xs mt-1 leading-tight">{item.description}</p>
        )}
      </div>

      {/* Price (promotions only — others use the price pill below) */}
      {!showPurchaseSystem && (
        <div>
          {isPromo && item.originalPrice ? (
            <span>
              <span className="font-mono text-base text-accent-watt">{fmt(item.price)} VLT</span>
              <span className="text-text-muted text-xs line-through ml-2">{fmt(item.originalPrice)} VLT</span>
            </span>
          ) : (
            <span className="font-mono text-base text-accent-watt">{fmt(unitPrice)} VLT</span>
          )}
        </div>
      )}

      {/* Qty selector (generators & supports) */}
      {showPurchaseSystem && (
        <div className="flex items-center gap-2">
          <span className="text-text-muted text-xs">Qty:</span>
          <button onClick={function () { setQty(Math.max(1, qty - 1)); }} className="w-8 h-8 rounded bg-bg-panel border border-line-dusk text-text-muted hover:text-text-primary text-base font-bold flex items-center justify-center">−</button>
          <input type="text" inputMode="numeric" value={qty} onChange={function (e) { var v = parseInt(e.target.value, 10); if (!isNaN(v) && v >= 1) setQty(v); else if (e.target.value === '') setQty(1); }} className="w-16 h-8 text-center bg-bg-abyss border border-line-dusk rounded text-text-primary text-sm font-mono [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
          <button onClick={function () { setQty(qty + 1); }} className="w-8 h-8 rounded bg-bg-panel border border-line-dusk text-text-muted hover:text-text-primary text-base font-bold flex items-center justify-center">+</button>
          <button onClick={function () { setQty(99); }} className="text-accent-watt text-xs font-semibold hover:underline ml-1">MAX</button>
        </div>
      )}

      {/* VLT price pill + Buy button (generators & supports) */}
      {showPurchaseSystem && (
        <>
          {/* Price pill */}
          <div className={'flex items-center justify-center gap-1.5 py-2 rounded-lg border text-sm font-mono ' +
            (insufficient
              ? 'border-red-700/40 bg-red-900/10 text-red-400'
              : 'border-accent-watt/30 bg-accent-watt/5 text-accent-watt')}>
            <img src={vltCoinImg} alt="VLT" width="18" height="18" className="inline-block"
              style={insufficient
                ? { imageRendering: 'pixelated', filter: 'grayscale(0.5) sepia(1) hue-rotate(-30deg) saturate(4) brightness(0.9)' }
                : { imageRendering: 'pixelated', filter: 'drop-shadow(0 0 4px rgba(242,184,75,0.4))' }} />
            <span>{fmt(totalPrice)} VLT</span>
          </div>

          {/* Buy button */}
          <button
            onClick={function () { onBuy(item.id || item.type, qty); }}
            disabled={!canBuy || loading}
            className={'mt-auto w-full font-semibold py-2.5 rounded text-sm transition-all ' +
              (canBuy
                ? 'bg-accent-watt text-bg-abyss hover:brightness-110'
                : 'bg-[#374151] text-[#9ca3af] cursor-not-allowed')}
          >
            {loading ? 'Buying...' : 'Buy'}
          </button>
        </>
      )}

      {/* Action button (promotions only — no qty selector) */}
      {!showPurchaseSystem && (
        <button
          onClick={function () { onBuy(item.id || item.type, 1); }}
          disabled={loading}
          className="mt-auto w-full bg-accent-watt text-bg-abyss font-semibold py-2.5 rounded text-sm hover:brightness-110 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? 'Buying...' : 'Buy (' + fmt(unitPrice) + ' VLT)'}
        </button>
      )}
    </div>
  );
}

// ===== MAIN SHOP PAGE =====
export default function Shop() {
  var { user } = useAuth();
  var { catalog, assets, totalW, vltBalance, loading, fetchCatalog, fetchMining, buyAsset, error } = useAssetsStore();
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
    // buyAsset stores the message in the store's `error`, which is rendered
    // above; swallowing here just prevents an unhandled rejection.
    try { await buyAsset(id, qty || 1); } catch (e) { /* surfaced via store error */ }
  };

  var genCatalog = catalog.filter(function (c) { return c.type === 'solar'; });

  return (
    <div>
      <div className="flex gap-6">
        {/* Categories sidebar */}
        <aside className="w-48 shrink-0 space-y-1">
          {CATEGORIES.map(function (cat) {
            var isActive = activeCategory === cat.key;
            return (
              <button key={cat.key} onClick={function () { setActiveCategory(cat.key); }}
                className={'w-full text-left flex items-center gap-3 px-4 py-3 rounded-lg text-sm transition-all ' +
                  (isActive ? 'bg-accent-watt/10 text-accent-watt border border-accent-watt/20 font-semibold' : 'text-text-muted hover:text-text-primary hover:bg-bg-panel border border-transparent')}
              >
                <span className="text-base w-5 text-center">{cat.icon}</span><span>{cat.label}</span>
                {isActive && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-accent-watt" />}
              </button>
            );
          })}
        </aside>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* GENERATORS */}
          {activeCategory === 'generators' && (
            <section>
              <h2 className="font-display text-lg text-accent-watt tracking-wide mb-4">⚡ GENERATORS</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
            <section>
              <h2 className="font-display text-lg text-accent-watt tracking-wide mb-4">🔥 PROMOTIONS</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {PROMOTIONS.map(function (item) {
                  return (
                    <ShopCard key={item.id} item={item} color={item.color} img={item.img}
                      owned={0} isPromo vltBalance={vltBalance} onBuy={function () { alert('Coming soon!'); }} loading={false} />
                  );
                })}
              </div>
            </section>
          )}

          {/* SUPPORTS */}
          {activeCategory === 'supports' && (
            <section>
              <h2 className="font-display text-lg text-accent-watt tracking-wide mb-4">🔧 SUPPORTS</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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