import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useAssetsStore } from '../store/assetsStore';
import { usePlacementStore } from '../store/placementStore';
import solarPanelImg from '../assets/items/panel-1-animation.gif';
import mountSingleImg from '../assets/items/mounts/mount-1.png';
import mountDoubleImg from '../assets/items/mounts/mount-2.png';

var CATEGORIES = [
  { key: 'generators', label: 'Generators', icon: '⚡' },
  { key: 'supports', label: 'Supports', icon: '🔧' },
  { key: 'boosters', label: 'Boosters', icon: '🚀' },
];

var GENERATOR_META = {
  solar: { label: 'Solar Panel', color: '#F2B84B', img: solarPanelImg, wps: 1 },
};

var SUPPORTS = [
  { id: 'panel-mount', label: 'Panel Mount (1 Slot)', description: 'Ground mount for 1 solar panel', price: 15, color: '#8B7355', img: mountSingleImg },
  { id: 'panel-mount-double', label: 'Panel Mount (2 Slots)', description: 'Ground mount for 2 solar panels', price: 25, color: '#8B7355', img: mountDoubleImg },
];

function fmt(n) { return (n || 0).toFixed(1); }

export default function Storage() {
  var { user } = useAuth();
  var { assets, fetchMining } = useAssetsStore();
  var { placedSolar, placedMount } = usePlacementStore();
  var pollingRef = useRef(null);
  var [activeCategory, setActiveCategory] = useState('generators');

  useEffect(function () {
    if (!user) return;
    fetchMining();
    pollingRef.current = setInterval(fetchMining, 8000);
    return function () { clearInterval(pollingRef.current); };
  }, [user, fetchMining]);

  // No unauthenticated branch: RequireAuth gates this route.

  // Build owned map from API data (type -> quantity)
  var ownedMap = {};
  for (var i = 0; i < assets.length; i++) {
    ownedMap[assets[i].type] = assets[i].quantity;
  }
  // Subtract placed items — placedMount is a combined total (single + double)
  ownedMap['solar'] = Math.max(0, (ownedMap['solar'] || 0) - (placedSolar || 0));
  ownedMap['panel-mount'] = Math.max(0, (ownedMap['panel-mount'] || 0) - (placedMount || 0));
  ownedMap['panel-mount-double'] = Math.max(0, (ownedMap['panel-mount-double'] || 0) - 0);

  var totalItems = 0;
  for (var key in ownedMap) {
    totalItems += ownedMap[key];
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-heading-xl text-accent-watt">STORAGE</h2>
        <p className="text-body-sm text-text-muted mt-1">{totalItems} items in inventory</p>
      </div>

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
              <h3 className="text-heading-md text-text-primary mb-4 uppercase">⚡ Generators</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {Object.keys(GENERATOR_META).map(function (type) {
                  var meta = GENERATOR_META[type];
                  var qty = ownedMap[type] || 0;
                  return (
                    <div key={type} className="rounded-xl border border-line-dusk bg-bg-abyss hover:border-accent-watt/20 p-5 flex flex-col items-center gap-3 transition-all">
                      <div className="w-full rounded-lg flex items-center justify-center py-4" style={{ backgroundColor: meta.color + '0f' }}>
                        {meta.img ? (
                          <img src={meta.img} alt={meta.label} width="96" height="96" style={{ imageRendering: 'pixelated' }} />
                        ) : (
                          <span className="font-display text-3xl opacity-50" style={{ color: meta.color }}>{meta.label.slice(0, 2).toUpperCase()}</span>
                        )}
                      </div>
                      <div className="text-center w-full">
                        <p className="text-heading-md text-text-primary">{meta.label}</p>
                        <p className="text-body-sm text-text-muted mt-0.5">{meta.wps} W/s per unit</p>
                      </div>
                      <span className="font-mono text-xl text-accent-watt">×{qty}</span>
                      {qty > 0 ? (
                        <p className="text-text-muted text-[11px]">
                          Total output: <span className="text-accent-current">{fmt(meta.wps * qty)} W/s</span>
                        </p>
                      ) : (
                        <p className="text-text-muted text-[11px]">Not owned</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* SUPPORTS */}
          {activeCategory === 'supports' && (
            <section>
              <h3 className="text-heading-md text-text-primary mb-4 uppercase">🔧 Supports & Equipment</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {SUPPORTS.map(function (item) {
                  var qty = ownedMap[item.id] || 0;
                  var hasItem = qty > 0;
                  var safeColor = item.color || '#888';
                  return (
                    <div key={item.id} className={'rounded-xl border border-line-dusk bg-bg-abyss p-5 flex flex-col gap-4 transition-all ' + (hasItem ? 'hover:border-accent-watt/20' : 'opacity-50')}>
                      <div className="w-full h-[120px] rounded-lg flex items-center justify-center" style={{ backgroundColor: safeColor + '14' }}>
                        {item.img ? (
                          <img src={item.img} alt={item.label} className="max-h-full object-contain" style={{ imageRendering: 'pixelated' }} />
                        ) : (
                          <span className="font-display text-3xl opacity-40" style={{ color: safeColor }}>{item.label.slice(0, 2).toUpperCase()}</span>
                        )}
                      </div>
                      <div>
                        <p className="text-heading-md text-text-primary">{item.label}</p>
                        <p className="text-body-sm text-text-muted mt-1 leading-tight">{item.description}</p>
                      </div>
                      {hasItem ? (
                        <>
                          <div className="flex items-center justify-center gap-1.5 py-2 rounded-lg border border-accent-watt/30 bg-accent-watt/5 text-accent-watt text-sm font-mono">
                            <span>🪙</span>
                            <span>{fmt(item.price * qty)} VLT</span>
                          </div>
                          <span className="text-center font-mono text-lg text-accent-watt">×{qty} owned</span>
                        </>
                      ) : (
                        <p className="text-center text-text-muted text-xs">Not owned</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* BOOSTERS */}
          {activeCategory === 'boosters' && (
            <section>
              <h3 className="text-heading-md text-text-primary mb-4 uppercase">🚀 Boosters</h3>
              <div className="bg-bg-panel border border-dashed border-line-dusk rounded-xl p-8 text-center">
                <p className="text-text-muted text-sm">Boosters coming soon.</p>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}