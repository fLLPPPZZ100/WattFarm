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
import { usePlacementStore, resetPlacementStore } from '../../store/placementStore.js';
import { CANVAS, STATION, CYCLE_SECONDS } from '../../game/layout.js';
import vltCoinImg from '../../assets/coins/vlt-coin.png';
import btcCoinImg from '../../assets/coins/btc-coin.png';
import trxCoinImg from '../../assets/coins/trx-coin.png';
import ethCoinImg from '../../assets/coins/eth-coin.png';
import solCoinImg from '../../assets/coins/sol-coin.png';
import avatarImg from '../../assets/avatars/avatar-1.png';
import PixelImage from '../ui/PixelImage.jsx';


const NAV_LINKS = [
  { to: '/', label: 'Dashboard', icon: '📊' },
  { to: '/shop', label: 'Shop', icon: '🛒' },
  { to: '/minigames', label: 'Minigames', icon: '🎮' },
  { to: '/wallet', label: 'Wallet', icon: '💰' },
  { to: '/referral', label: 'Referral', icon: '👥' },
  { to: '/storage', label: 'Storage', icon: '📦' },
];

const CURRENCIES = [
  { id: 'VLT', label: 'VLT', img: vltCoinImg, format: function (v) { return v.toFixed(1); } },
  { id: 'BTC', label: 'BTC', img: btcCoinImg, format: function (v) { return v.toFixed(8); } },
  { id: 'ETH', label: 'ETH', img: ethCoinImg, format: function (v) { return v.toFixed(6); } },
  { id: 'SOL', label: 'SOL', img: solCoinImg, format: function (v) { return v.toFixed(4); } },
  { id: 'TRX', label: 'TRX', img: trxCoinImg, format: function (v) { return v.toFixed(6); } },
];

export default function AppShell() {
  const { user, logout } = useAuth();
  const { vltBalance, assets, fetchMining } = useAssetsStore();
  const { placedSolar, placedMount, powerRate, networkTotal } = usePlacementStore();
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
    setPlacementCallback(function (solarPlaced, mountPlaced, rate, total, baseline) {
      usePlacementStore.getState().setPlacement({
        placedSolar: solarPlaced,
        placedMount: mountPlaced,
        powerRate: rate,
        networkTotal: total,
        networkBaseline: baseline,
      });
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

  /**
   * Power panel values.
   *
   * `powerRate` comes from the game and already includes mount bonuses, so it is
   * no longer `panels x 1`. `networkTotal` comes from the server and is the
   * denominator the payout share is taken against — the baseline plus every
   * player's output, not just this player's. The estimated reward uses the same
   * formula as the payout, because output on its own says nothing about income.
   */
  var activeSolar = placedSolar || 0;
  var totalPower = powerRate || 0;
  var network = networkTotal || 0;
  var networkShare = network > 0 ? totalPower / network : 0;
  var BUDGET_PER_CYCLE = 50;
  var blockReward = networkShare * BUDGET_PER_CYCLE;

  /**
   * Clears all per-user client state before signing out. Without this the next
   * account to log in on the same browser briefly saw the previous player's
   * balance and inventory, because the zustand stores outlive the session.
   */
  function handleLogout() {
    resetAssetsStore();
    resetPlacementStore();
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
                  <PixelImage src={active.img} alt={active.label} sourceSize={32} size={32} glow />
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
                            <PixelImage src={c.img} alt={c.label} sourceSize={32} size={32} glow />
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
                {/*
                  The 32px avatar used to be stretched to fill a 54px box, a
                  1.6875x scale that mangled the pixel grid. It is now drawn at
                  exactly 2x inside a 64px frame.
                */}
                <div
                  onClick={function () { navigate('/profile'); }}
                  onKeyDown={function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate('/profile'); } }}
                  role="button"
                  tabIndex={0}
                  aria-label="Abrir perfil"
                  className="shrink-0 cursor-pointer hover:opacity-80 transition-opacity rounded-xl overflow-hidden border border-line-dusk bg-bg-abyss box-border flex items-center justify-center"
                  style={{ width: '64px', height: '64px' }}
                >
                  <PixelImage src={avatarImg} sourceSize={32} size={64} className="block" />
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
          {/*
            Game viewport and its stats panel are laid out as one centred pair.

            The panel sits beside the canvas, not over it, and the trunk cable
            drawn inside the canvas runs out to the left edge at STATION.connectorY.
            Because both share the same top edge, that height lines up with the
            panel's own connector and the wire reads as continuous across the
            boundary. Geometry comes from game/layout.js — a few pixels of drift
            shows up as a severed cable.

            The panel needs 176px beside a 960px canvas, so it only appears when
            there is genuinely room; below that the canvas re-centres on its own.
          */}
          <div className="absolute inset-0 flex justify-center pt-3 pointer-events-none">
            {isDashboard && user && (
              <div
                className="relative shrink-0 hidden 2xl:block pointer-events-auto"
                style={{ width: STATION.width, height: CANVAS.height }}
              >
                <div
                  className="absolute right-0 flex flex-col gap-2.5 bg-bg-panel border-2 border-line-dusk p-3"
                  style={{
                    top: STATION.top,
                    width: STATION.width,
                    height: STATION.height,
                  }}
                >
                  {/* Accent rule, matching the site's panels. */}
                  <div className="absolute inset-x-0 top-0 h-0.5 bg-accent-watt" />

                  {/*
                    Connector stub on the panel's right edge, level with the
                    cable leaving the canvas, so the two meet as one wire.
                  */}
                  <div
                    className="absolute bg-[#101c26]"
                    style={{
                      right: -6,
                      top: STATION.height / 2 - 1,
                      width: 6,
                      height: 2,
                    }}
                  />
                  <div
                    className="absolute bg-[#101c26]"
                    style={{
                      right: -3,
                      top: STATION.height / 2 - 5,
                      width: 5,
                      height: 10,
                    }}
                  />

                  <div>
                    <p className="text-[9px] text-text-muted uppercase tracking-wider">Your Power</p>
                    <p className="font-mono text-sm text-accent-current">{totalPower.toFixed(1)} W/s</p>
                    <p className="text-[9px] text-text-muted">{activeSolar} panels placed</p>
                  </div>

                  <div>
                    <p className="text-[9px] text-text-muted uppercase tracking-wider">Network Power</p>
                    <p className="font-mono text-sm text-text-primary">{network.toFixed(1)} W/s</p>
                    {/* Share bar — the payout is proportional to this. */}
                    <div className="mt-1 h-1.5 w-full bg-bg-abyss border border-line-dusk">
                      <div
                        className="h-full bg-accent-current"
                        style={{ width: Math.min(100, networkShare * 100).toFixed(1) + '%' }}
                      />
                    </div>
                    <p className="text-[9px] text-accent-current mt-0.5 font-mono">
                      {(networkShare * 100).toFixed(1)}% share
                    </p>
                  </div>

                  <div>
                    <p className="text-[9px] text-text-muted uppercase tracking-wider">Next Payout</p>
                    <p className="font-mono text-sm text-accent-watt">{countdownStr}</p>
                  </div>

                  <div>
                    <p className="text-[9px] text-text-muted uppercase tracking-wider">Est. Reward</p>
                    <p className="font-mono text-sm text-accent-watt">{blockReward.toFixed(2)} VLT</p>
                  </div>
                </div>
              </div>
            )}

            {/*
              #phaser-root stays in the DOM at all times so the canvas is never
              torn down; AppShell toggles its display per route.
            */}
            <div
              id="phaser-root"
              className="shrink-0 pointer-events-auto"
              style={{ width: '960px', height: '640px' }}
            />
          </div>

          {/* RIGHT: Ad placeholder */}
          {/* TODO: substituir por integração real de ads (ex: AdSense, AdinPlay) quando definido */}
          {isDashboard && user && (
            <div className="absolute right-4 top-4 z-10 hidden xl:block">
              <div className="flex items-center justify-center border border-dashed border-line-dusk rounded-xl bg-bg-panel/40 w-[160px] h-[600px]">
                <span className="text-xs text-text-muted text-center px-2">
                  Ad Space<br />160×600
                </span>
              </div>
            </div>
          )}

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