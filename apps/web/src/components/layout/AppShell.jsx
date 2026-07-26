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
import vltCoinImg from '../../assets/coins/vlt-coin.png';
import btcCoinImg from '../../assets/coins/btc-coin.png';
import trxCoinImg from '../../assets/coins/trx-coin.png';
import ethCoinImg from '../../assets/coins/eth-coin.png';
import solCoinImg from '../../assets/coins/sol-coin.png';
import { getAvatarImage } from '../../data/avatars.js';


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
  const { user, account, logout } = useAuth();
  const { vltBalance, assets, fetchMining } = useAssetsStore();
  const { placedSolar, placedMount, powerRate, networkBaseline } = usePlacementStore();
  const [activeCurrency, setActiveCurrency] = useState('VLT');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [countdown, setCountdown] = useState(CYCLE_SECONDS);
  const btcBalance = 0;
  const ethBalance = 0;
  const solBalance = 0;
  const trxBalance = 0;
  const location = useLocation();
  const navigate = useNavigate();

  var balances = { VLT: vltBalance, BTC: btcBalance, ETH: ethBalance, SOL: solBalance, TRX: trxBalance };

  /**
   * The header avatar used to be a hardcoded import of avatar-1.png, so picking
   * a different one in the profile changed nothing here. It now follows the
   * account row, which AuthContext caches and the picker writes back to.
   * `getAvatarImage` falls back to the default for an unknown id, so a row
   * pointing at an avatar this build no longer ships still renders.
   */
  var avatarImg = getAvatarImage(account?.avatarId);
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
    setPlacementCallback(function (solarPlaced, mountPlaced, powerRate, networkBaseline) {
      usePlacementStore.getState().setPlacement({
        placedSolar: solarPlaced,
        placedMount: mountPlaced,
        powerRate: powerRate,
        networkBaseline: networkBaseline,
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
   * no longer `panels x 1`. The estimated reward is the player's share of the
   * fixed budget against the synthetic network baseline — the same formula the
   * server uses at payout — because output on its own says nothing about income.
   */
  var activeSolar = placedSolar || 0;
  var totalPower = powerRate || 0;
  var networkTotal = totalPower + (networkBaseline || 0);
  var networkShare = networkTotal > 0 ? totalPower / networkTotal : 0;
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

  /**
   * The two header dropdowns are mutually exclusive — opening one closes the
   * other, otherwise both panels can be on screen at once and they overlap.
   */
  function toggleAccountMenu() {
    setDropdownOpen(false);
    setAccountMenuOpen(function (open) { return !open; });
  }

  function openCurrencyDropdown() {
    setAccountMenuOpen(false);
    setDropdownOpen(!dropdownOpen);
  }

  /** Navigates from a menu item, closing the menu first. */
  function goFromAccountMenu(to) {
    setAccountMenuOpen(false);
    navigate(to);
  }

  // Escape closes the account menu. A click-away overlay handles the mouse, but
  // a keyboard user who opened the menu with Enter has no way out without this.
  useEffect(function () {
    if (!accountMenuOpen) return undefined;

    function onKeyDown(event) {
      if (event.key === 'Escape') setAccountMenuOpen(false);
    }

    document.addEventListener('keydown', onKeyDown);
    return function () { document.removeEventListener('keydown', onKeyDown); };
  }, [accountMenuOpen]);

  var isDashboard = location.pathname === '/';

  // A route change must close the menu. Selecting "Profile" while already on
  // /profile does not unmount anything, so the menu would otherwise stay open.
  useEffect(function () {
    setAccountMenuOpen(false);
  }, [location.pathname]);
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
        {/* Log out moved into the account menu in the header, next to Profile —
            it belongs with the other account actions rather than sitting alone
            at the bottom of the navigation. */}
      </aside>

      {/* ========== MAIN AREA ========== */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="border-t-[2px] border-accent-watt bg-bg-panel border-b border-line-dusk shrink-0 flex items-center pl-6 pr-8 h-[73px] box-border">
          <div className="flex items-center w-full">
            {/* LEFT: Balance pill */}
            {user && (
              <div className="relative shrink-0">
                <button
                  onClick={openCurrencyDropdown}
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

            {/* RIGHT: account menu (avatar + name) */}
            {user ? (
              <div className="relative shrink-0">
                {/*
                  Avatar and name are one button rather than two clickable
                  elements. They used to be separate `role="button"` divs that
                  both navigated straight to /profile; making them a single real
                  <button> gives keyboard and screen-reader support for free
                  (Enter/Space, focus ring, expanded state) instead of
                  reimplementing it with onKeyDown handlers.
                */}
                <button
                  type="button"
                  onClick={toggleAccountMenu}
                  aria-haspopup="true"
                  aria-expanded={accountMenuOpen}
                  aria-label="Abrir menu da conta"
                  className={'flex items-center gap-3 p-1 pr-2 border cursor-pointer transition-colors ' + (accountMenuOpen ? 'bg-bg-abyss border-accent-watt/40 rounded-xl' : 'border-transparent hover:bg-bg-abyss/60 rounded-xl')}
                >
                  <span
                    className="shrink-0 block rounded-xl overflow-hidden border border-line-dusk bg-bg-abyss box-border"
                    style={{ width: '54px', height: '54px' }}
                  >
                    <img src={avatarImg} alt="" className="w-full h-full object-cover block" style={{ imageRendering: 'pixelated' }} />
                  </span>
                  <span
                    className="text-text-primary text-sm font-extrabold uppercase tracking-wider whitespace-nowrap hidden sm:inline max-w-[160px] truncate"
                    style={{ lineHeight: '1' }}
                  >
                    {user.displayName || user.email}
                  </span>
                  <span aria-hidden="true" className={'text-text-muted text-xs transition-transform ' + (accountMenuOpen ? 'rotate-180' : '')}>▼</span>
                </button>

                {accountMenuOpen && (
                  <>
                    {/* Click-away layer, matching the currency dropdown above. */}
                    <div className="fixed inset-0 z-30" onClick={function () { setAccountMenuOpen(false); }} />
                    {/*
                      Deliberately NOT role="menu". That role is a promise of
                      arrow-key navigation with managed focus, and a screen
                      reader will stop treating Tab as the way through the
                      items once it sees it. With three plain buttons, native
                      Tab order plus Escape is fully usable and honest about
                      what is implemented. Revisit if this grows into a real
                      menu with submenus.
                    */}
                    <div
                      aria-label="Conta"
                      className="absolute right-0 top-full mt-2 w-56 bg-bg-panel border border-line-dusk rounded-xl shadow-2xl z-40 overflow-hidden py-1"
                    >
                      <button
                        type="button"
                        onClick={function () { goFromAccountMenu('/profile'); }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-text-muted hover:text-text-primary hover:bg-bg-abyss/50 transition-colors"
                      >
                        <span className="text-base w-5 text-center">👤</span>
                        <span>Profile</span>
                      </button>

                      {/*
                        Referências has no route yet, so it is rendered disabled
                        rather than as a link that goes nowhere — a menu item
                        that silently does nothing reads as a bug. The `Soon`
                        tag carries that state as text, rather than leaving it
                        to the dimmed colour alone; a `title` tooltip would not
                        do, since browsers suppress those on disabled controls.
                      */}
                      <button
                        type="button"
                        disabled
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-text-muted/40 cursor-not-allowed"
                      >
                        <span className="text-base w-5 text-center">🔗</span>
                        <span>Referências</span>
                        <span className="ml-auto text-[10px] uppercase tracking-wider border border-line-dusk rounded px-1.5 py-0.5">Soon</span>
                      </button>

                      <div className="my-1 border-t border-line-dusk" />

                      <button
                        type="button"
                        onClick={function () { setAccountMenuOpen(false); handleLogout(); }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-text-muted hover:text-red-400 hover:bg-red-400/5 transition-colors"
                      >
                        <span className="text-base w-5 text-center">🚪</span>
                        <span>Log out</span>
                      </button>
                    </div>
                  </>
                )}
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
                <div className="flex flex-col gap-3 bg-bg-panel/80 backdrop-blur-sm border border-line-dusk rounded-xl p-4 w-[176px]">
                  <div>
                    <p className="text-[10px] text-text-muted uppercase tracking-wider mb-0.5">Your Power</p>
                    <p className="font-mono text-sm text-accent-current">{totalPower.toFixed(1)} W/s</p>
                    <p className="text-[10px] text-text-muted mt-0.5">{activeSolar} panels placed</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-text-muted uppercase tracking-wider mb-0.5">Network Power</p>
                    <p className="font-mono text-sm text-text-primary">{networkTotal.toFixed(1)} W/s</p>
                    {/* Share bar — the payout is proportional to this. */}
                    <div className="mt-1 h-1.5 w-full bg-bg-abyss border border-line-dusk">
                      <div
                        className="h-full bg-accent-current"
                        style={{ width: Math.min(100, networkShare * 100).toFixed(1) + '%' }}
                      />
                    </div>
                    <p className="text-[10px] text-accent-current mt-0.5 font-mono">
                      {(networkShare * 100).toFixed(1)}% share
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-text-muted uppercase tracking-wider mb-0.5">Next Payout</p>
                    <p className="font-mono text-sm text-accent-watt">{countdownStr}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-text-muted uppercase tracking-wider mb-0.5">Est. Reward</p>
                    <p className="font-mono text-sm text-accent-watt">{blockReward.toFixed(2)} VLT</p>
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