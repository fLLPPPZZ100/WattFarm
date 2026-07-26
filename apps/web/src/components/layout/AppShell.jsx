import { useState, useEffect } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useAssetsStore, resetAssetsStore } from '../../store/assetsStore';
import EmailVerificationBanner from '../auth/EmailVerificationBanner';
import {
  boot as bootGame,
  sync as syncGame,
  shutdown as shutdownGame,
  setPlacementCallback,
} from '../../game/GameInstance.js';
import { usePlacementStore } from '../../store/placementStore.js';
import vltCoinImg from '../../assets/coins/vlt-coin.png';
import btcCoinImg from '../../assets/coins/btc-coin.png';
import trxCoinImg from '../../assets/coins/trx-coin.png';
import ethCoinImg from '../../assets/coins/eth-coin.png';
import solCoinImg from '../../assets/coins/sol-coin.png';
import avatarImg from '../../assets/avatars/avatar-1.png';


const NAV_LINKS = [
  { to: '/', label: 'Dashboard', icon: '📊' },
  { to: '/shop', label: 'Shop', icon: '🛒' },
  { to: '/minigames', label: 'Minigames', icon: '🎮' },
  { to: '/wallet', label: 'Wallet', icon: '💰' },
  { to: '/storage', label: 'Storage', icon: '📦' },
];

const CURRENCIES = [
  { id: 'VLT', label: 'VLT', img: vltCoinImg, format: function (v) { return v.toFixed(1); } },
  { id: 'BTC', label: 'BTC', img: btcCoinImg, format: function (v) { return v.toFixed(8); } },
  { id: 'ETH', label: 'ETH', img: ethCoinImg, format: function (v) { return v.toFixed(6); } },
  { id: 'SOL', label: 'SOL', img: solCoinImg, format: function (v) { return v.toFixed(4); } },
  { id: 'TRX', label: 'TRX', img: trxCoinImg, format: function (v) { return v.toFixed(6); } },
];

const CYCLE_SECONDS = 600; // 10 minutes

export default function AppShell() {
  const { user, logout } = useAuth();
  const { vltBalance, assets, fetchMining } = useAssetsStore();
  const { placedSolar, placedMount } = usePlacementStore();
  const [activeCurrency, setActiveCurrency] = useState('VLT');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [countdown, setCountdown] = useState(CYCLE_SECONDS);
  const btcBalance = 0;
  const ethBalance = 0;
  const solBalance = 0;
  const trxBalance = 0;
  const location = useLocation();
  const navigate = useNavigate();

  var balances = { VLT: vltBalance, BTC: btcBalance, ETH: ethBalance, SOL: solBalance, TRX: trxBalance };
  var active = CURRENCIES.find(function (c) { return c.id === activeCurrency; }) || CURRENCIES[0];

  /**
   * The game is booted per authenticated user so its saved layout is scoped to
   * that account. Previously it booted once globally and read an unscoped
   * localStorage key, which meant the next person to log in on the same browser
   * saw the previous player's farm.
   */
  useEffect(function () {
    if (!user) return undefined;

    bootGame(user.uid);
    setPlacementCallback(function (solarPlaced, mountPlaced) {
      usePlacementStore.setState({ placedSolar: solarPlaced, placedMount: mountPlaced });
    });

    return function () {
      shutdownGame();
    };
  }, [user]);
  useEffect(function () {
    if (!user) return;
    fetchMining();
    var i = setInterval(fetchMining, 10000);
    return function () { clearInterval(i); };
  }, [user, fetchMining]);
  useEffect(function () {
    var mountCount = 0, solarCount = 0;
    for (var i = 0; i < assets.length; i++) {
      if (assets[i].type === 'panel-mount') mountCount = assets[i].quantity;
      else if (assets[i].type === 'solar') solarCount = assets[i].quantity;
    }
    syncGame(assets, mountCount, solarCount);
  }, [assets]);

  // Countdown for Next Payout (used in power panel)
  useEffect(function () {
    function tick() {
      var now = Math.floor(Date.now() / 1000);
      var remaining = CYCLE_SECONDS - (now % CYCLE_SECONDS);
      setCountdown(remaining);
    }
    tick();
    var id = setInterval(tick, 1000);
    return function () { clearInterval(id); };
  }, []);

  var min = Math.floor(countdown / 60);
  var sec = countdown % 60;
  var countdownStr = min + ':' + (sec < 10 ? '0' : '') + sec;

  // Power panel values
  var activeSolar = placedSolar || 0;
  var totalPower = activeSolar * 1;
  var blockReward = totalPower * 0.05;

  /**
   * Clears all per-user client state before signing out. Without this the next
   * account to log in on the same browser briefly saw the previous player's
   * balance and inventory, because the zustand stores outlive the session.
   */
  function handleLogout() {
    resetAssetsStore();
    usePlacementStore.setState({ placedSolar: 0, placedMount: 0 });
    logout();
  }

  var isDashboard = location.pathname === '/';
  // Phaser root: always in DOM for canvas persistence; show/hide via display
  useEffect(function () {
    var el = document.getElementById('phaser-root');
    if (!el) return;
    if (isDashboard) {
      el.style.display = 'flex';
    } else {
      el.style.display = 'none';
    }
  }, [isDashboard]);

  return (
    <div className="min-h-screen bg-bg-abyss text-text-primary font-body flex">
      {/* ========== SIDEBAR ========== */}
      <aside className="w-60 shrink-0 bg-bg-panel border-r border-line-dusk flex flex-col">
        <div className="h-0.5 bg-accent-watt" />
        <div className="h-[71px] flex items-center px-5">
          <Link to="/" className="block">
            <span className="font-display text-xl text-accent-watt tracking-wide hover:brightness-110 transition-all">WATTFARM</span>
          </Link>
        </div>
        {user && (
          <nav className="flex-1 px-3 space-y-0.5">
            {NAV_LINKS.map(function (link) {
              var active = location.pathname === link.to;
              return (
                <Link key={link.to} to={link.to} className={'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ' + (active ? 'bg-accent-watt/10 text-accent-watt border border-accent-watt/20 font-semibold' : 'text-text-muted hover:text-text-primary hover:bg-bg-abyss/50 border border-transparent')}>
                  <span className="text-base w-5 text-center">{link.icon}</span><span>{link.label}</span>
                  {active && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-accent-watt" />}
                </Link>
              );
            })}
          </nav>
        )}
        <div className="px-3 py-3 border-t border-line-dusk">
          <button onClick={handleLogout} className="w-full text-left px-3 py-2 rounded-lg text-sm text-text-muted hover:text-red-400 hover:bg-red-400/5 transition-all border border-transparent hover:border-red-400/20">Log out</button>
        </div>
      </aside>

      {/* ========== MAIN AREA ========== */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="border-t-[2px] border-accent-watt bg-bg-panel border-b border-line-dusk shrink-0 flex items-center pl-6 pr-8 h-[73px] box-border">
          <div className="flex items-center w-full">
            {/* LEFT: Balance pill */}
            {user && (
              <div className="relative shrink-0">
                <button
                  onClick={function () { setDropdownOpen(!dropdownOpen); }}
                  className={'flex items-center gap-3 bg-bg-abyss px-4 py-2.5 border border-line-dusk hover:border-accent-watt/40 cursor-pointer ' + (dropdownOpen ? 'rounded-t-xl border-b border-b-transparent' : 'rounded-xl')}
                >
                  <img src={active.img} alt={active.label} width="32" height="32" style={{ imageRendering: 'pixelated', filter: 'drop-shadow(0 0 6px rgba(242,184,75,0.5))' }} />
                  <span className="font-mono text-base font-medium text-accent-watt">{active.format(balances[activeCurrency])} {active.label}</span>
                  <span className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-white/5 cursor-pointer transition-colors text-text-muted text-xs">▼</span>
                </button>

                {dropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={function () { setDropdownOpen(false); }} />
                    <div className="absolute left-0 right-0 mt-0 bg-bg-panel border border-line-dusk border-t-0 rounded-b-xl shadow-2xl z-40 overflow-hidden">
                      {CURRENCIES.map(function (c) {
                        var isActive = c.id === activeCurrency;
                        return (
                          <button
                            key={c.id}
                            onClick={function () { setActiveCurrency(c.id); setDropdownOpen(false); }}
                            className={'w-full flex items-center gap-3 px-4 py-3 text-sm ' + (isActive ? 'bg-accent-watt/10' : 'hover:bg-bg-abyss/50')}
                          >
                            <img src={c.img} alt={c.label} width="32" height="32" style={{ imageRendering: 'pixelated', filter: 'drop-shadow(0 0 6px rgba(242,184,75,0.5))' }} />
                            <div className="text-left flex-1">
                              <p className={isActive ? 'text-accent-watt font-semibold text-xs' : 'text-text-primary text-xs'}>{c.label}</p>
                              <p className="font-mono text-xs text-text-muted">{c.format(balances[c.id])} {c.label}</p>
                            </div>
                            {isActive && <span className="text-accent-watt text-sm">●</span>}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* CENTER: flexible spacer */}
            {user && <div className="flex-1" />}

            {/* RIGHT: Profile avatar or Login button */}
            {user ? (
              <div className="flex items-center gap-3 shrink-0" title="Profile">
                <div
                  onClick={function () { navigate('/profile'); }}
                  onKeyDown={function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate('/profile'); } }}
                  role="button"
                  tabIndex={0}
                  aria-label="Abrir perfil"
                  className="shrink-0 cursor-pointer hover:opacity-80 transition-opacity rounded-xl overflow-hidden border border-line-dusk bg-bg-abyss box-border"
                  style={{ width: '54px', height: '54px' }}
                >
                  <img src={avatarImg} alt="" className="w-full h-full object-cover block" style={{ imageRendering: 'pixelated' }} />
                </div>
                <span
                  onClick={function () { navigate('/profile'); }}
                  onKeyDown={function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate('/profile'); } }}
                  role="button"
                  tabIndex={0}
                  aria-label="Abrir perfil"
                  className="text-text-primary text-sm font-extrabold uppercase tracking-wider whitespace-nowrap hidden sm:inline max-w-[160px] truncate cursor-pointer hover:opacity-80 transition-opacity"
                  style={{ lineHeight: '1' }}
                >
                  {user.displayName || user.email}
                </span>
              </div>
            ) : null}
          </div>
        </header>

        <EmailVerificationBanner />

        <div className="flex-1 relative overflow-hidden">
          {/* 3-column layout: power panel (left) + game viewport (center) + ad space (right) */}
          {isDashboard && user && (
            <>
              {/* LEFT: Power Panel */}
              <div className="absolute left-4 top-4 z-10 hidden lg:block">
                <div className="flex flex-col gap-3 bg-bg-panel/80 backdrop-blur-sm border border-line-dusk rounded-xl p-4 w-[160px]">
                  <div>
                    <p className="text-[10px] text-text-muted uppercase tracking-wider mb-0.5">Active Power</p>
                    <p className="font-mono text-sm text-accent-current">{totalPower.toFixed(1)} W/s</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-text-muted uppercase tracking-wider mb-0.5">Next Payout</p>
                    <p className="font-mono text-sm text-accent-watt">{countdownStr}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-text-muted uppercase tracking-wider mb-0.5">Est. Reward</p>
                    <p className="font-mono text-sm text-accent-watt">{blockReward.toFixed(1)} VLT</p>
                  </div>
                </div>
              </div>

              {/* RIGHT: Ad placeholder */}
              {/* TODO: substituir por integração real de ads (ex: AdSense, AdinPlay) quando definido */}
              <div className="absolute right-4 top-4 z-10 hidden xl:block">
                <div className="flex items-center justify-center border border-dashed border-line-dusk rounded-xl bg-bg-panel/40 w-[160px] h-[600px]">
                  <span className="text-xs text-text-muted text-center px-2">
                    Ad Space<br />160×600
                  </span>
                </div>
              </div>
            </>
          )}

          {/* #phaser-root always in DOM — Phaser canvas attaches here at mount */}
          <div id="phaser-root" className="absolute left-1/2 top-3 -translate-x-1/2 z-0" style={{ width: '960px', height: '640px' }} />

          {/* Non-dashboard routes */}
          {!isDashboard && (
            <main className="absolute inset-0 overflow-y-auto z-0">
              <div className="max-w-5xl mx-auto px-6 py-6">
                <Outlet />
              </div>
            </main>
          )}
        </div>
      </div>

    </div>
  );
}