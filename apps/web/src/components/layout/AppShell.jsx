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
import { resetNotificationStore } from '../../store/notificationStore.js';
import NotificationStack from '../ui/NotificationStack.jsx';
import vltCoinImg from '../../assets/coins/vlt-coin.png';
import btcCoinImg from '../../assets/coins/btc-coin.png';
import trxCoinImg from '../../assets/coins/trx-coin.png';
import ethCoinImg from '../../assets/coins/eth-coin.png';
import solCoinImg from '../../assets/coins/sol-coin.png';
import { getAvatarImage } from '../../data/avatars.js';
import profileIconImg from '../../assets/sprites/profile.png';
import shopIconImg from '../../assets/sprites/shop.png';


/**
 * One icon slot, shared by the sidebar and the account menu.
 *
 * The slot is a fixed 32px box whether it holds pixel art or an emoji, so every
 * label in a list starts at the same x position no matter which items have been
 * converted yet.
 *
 * Sprites render at 32px, their native size — 1:1, no resampling. They are not
 * scaled down to fit a smaller row: `image-rendering: pixelated` resolves a
 * downscale by nearest neighbour, which throws away every other pixel and can
 * erase a one-pixel detail completely. Emoji sit at 24px, which reads as roughly
 * the same weight as a sprite that keeps a 4px transparent margin.
 */
function MenuIcon({ img, emoji }) {
  return (
    <span className="w-8 shrink-0 flex items-center justify-center">
      {img ? (
        <img src={img} alt="" width="32" height="32" style={{ imageRendering: 'pixelated' }} />
      ) : (
        <span className="text-2xl leading-none">{emoji}</span>
      )}
    </span>
  );
}

/**
 * Phaser canvas size. Must match the game config — the side panels are placed
 * relative to these numbers, so a mismatch shifts them off the canvas edge.
 */
const GAME_WIDTH = 960;
const GAME_HEIGHT = 640;

/** Gap between the canvas and each side panel. */
const PANEL_GAP = 12;

/**
 * Distance from the horizontal centre to the outer edge of a side panel.
 *
 * The canvas is centred, so half of it plus the gap is where a panel's inner
 * edge belongs. Anchoring the panels to the centre rather than to the viewport
 * edges is what keeps the gap constant: pinned to `left-4`/`right-4` they drifted
 * away from the canvas as the window widened, and overlapped it as it narrowed.
 */
const PANEL_OFFSET = GAME_WIDTH / 2 + PANEL_GAP;

/** Vertically centred, level with the middle of the canvas. */
const CENTRED_ROW = {
  top: '50%',
  transform: 'translateY(-50%)',
};

const NAV_LINKS = [
  { to: '/', label: 'Farm', icon: '🌱' },
  { to: '/shop', label: 'Shop', img: shopIconImg },
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
    resetNotificationStore();
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

  var isFarmView = location.pathname === '/';

  // A route change must close the menu. Selecting "Profile" while already on
  // /profile does not unmount anything, so the menu would otherwise stay open.
  useEffect(function () {
    setAccountMenuOpen(false);
  }, [location.pathname]);
  // Phaser root: always in DOM for canvas persistence; show/hide via display
  useEffect(function () {
    var el = document.getElementById('phaser-root');
    if (!el) return;
    if (isFarmView) {
      el.style.display = 'flex';
    } else {
      el.style.display = 'none';
    }
  }, [isFarmView]);

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
                <Link key={link.to} to={link.to} className={'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ' + (active ? 'bg-accent-watt/10 text-accent-watt border border-accent-watt/20 font-semibold' : 'text-text-muted hover:text-text-primary hover:bg-bg-abyss/50 border border-transparent')}>
                  <MenuIcon img={link.img} emoji={link.icon} /><span>{link.label}</span>
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
                  <span className="text-currency text-base text-accent-watt">{active.format(balances[activeCurrency])} {active.label}</span>
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
                  aria-label="Open account menu"
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
                      aria-label="Account"
                      className="absolute right-0 top-full mt-2 w-56 bg-bg-panel border border-line-dusk rounded-xl shadow-2xl z-40 overflow-hidden py-1"
                    >
                      <button
                        type="button"
                        onClick={function () { goFromAccountMenu('/profile'); }}
                        className="w-full flex items-center gap-3 px-4 py-2 text-sm text-text-muted hover:text-text-primary hover:bg-bg-abyss/50 transition-colors"
                      >
                        <MenuIcon img={profileIconImg} />
                        <span>Profile</span>
                      </button>

                      {/*
                        Referrals lives here rather than in the sidebar: the
                        sidebar is the game loop (farm, shop, minigames, wallet,
                        storage) and an invite link is an account concern, like
                        the profile it sits next to. The `Soon` tag it used to
                        carry is gone now that the route exists. Still emoji
                        until pixel art exists for it and for Log out.
                      */}
                      <button
                        type="button"
                        onClick={function () { goFromAccountMenu('/referrals'); }}
                        className="w-full flex items-center gap-3 px-4 py-2 text-sm text-text-muted hover:text-text-primary hover:bg-bg-abyss/50 transition-colors"
                      >
                        <MenuIcon emoji="🔗" />
                        <span>Referrals</span>
                      </button>

                      <div className="my-1 border-t border-line-dusk" />

                      <button
                        type="button"
                        onClick={function () { setAccountMenuOpen(false); handleLogout(); }}
                        className="w-full flex items-center gap-3 px-4 py-2 text-sm text-text-muted hover:text-red-400 hover:bg-red-400/5 transition-colors"
                      >
                        <MenuIcon emoji="🚪" />
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
          {isFarmView && user && (
            <>
              {/*
                LEFT: Power Panel — its right edge sits PANEL_GAP left of the canvas.

                The `min-[1576px]` breakpoint is arithmetic, not taste. A centred
                canvas is symmetric, so the wider of the two panels sets the
                requirement for both: 960 + 2 x (176 + 12) = 1336px of content,
                plus the 240px sidebar. Below that a panel would be clipped by the
                container's overflow, so both are hidden instead.

                The old `lg:` (1024px) threshold is why the panels used to sit on
                top of the canvas on a laptop.
              */}
              <div
                className="absolute z-10 hidden min-[1576px]:block"
                style={{ ...CENTRED_ROW, right: `calc(50% + ${PANEL_OFFSET}px)` }}
              >
                <div className="flex flex-col gap-3 bg-bg-panel/80 backdrop-blur-sm border border-line-dusk rounded-xl p-4 w-[176px]">
                  <div>
                    <p className="text-label text-text-muted mb-0.5">Your Power</p>
                    <p className="text-stat text-sm text-accent-current">{totalPower.toFixed(1)} W/s</p>
                    <p className="text-body-sm text-text-muted mt-0.5">{activeSolar} panels placed</p>
                  </div>
                  <div>
                    <p className="text-label text-text-muted mb-0.5">Network Power</p>
                    <p className="text-stat text-sm text-text-primary">{networkTotal.toFixed(1)} W/s</p>
                    {/* Share bar — the payout is proportional to this. */}
                    <div className="mt-1 h-1.5 w-full bg-bg-abyss border border-line-dusk">
                      <div
                        className="h-full bg-accent-current"
                        style={{ width: Math.min(100, networkShare * 100).toFixed(1) + '%' }}
                      />
                    </div>
                    <p className="font-mono text-[10px] text-accent-current mt-0.5">
                      {(networkShare * 100).toFixed(1)}% share
                    </p>
                  </div>
                  <div>
                    <p className="text-label text-text-muted mb-0.5">Next Payout</p>
                    <p className="text-timer text-accent-watt">{countdownStr}</p>
                  </div>
                  <div>
                    <p className="text-label text-text-muted mb-0.5">Est. Reward</p>
                    <p className="text-currency text-accent-watt">{blockReward.toFixed(2)} VLT</p>
                  </div>
                </div>
              </div>

              {/* RIGHT: Ad placeholder */}
              {/* TODO: replace with a real ad integration (e.g. AdSense, AdinPlay) once chosen */}
              <div
                className="absolute z-10 hidden min-[1576px]:block"
                style={{ ...CENTRED_ROW, left: `calc(50% + ${PANEL_OFFSET}px)` }}
              >
                <div className="flex items-center justify-center border border-dashed border-line-dusk rounded-xl bg-bg-panel/40 w-[160px] h-[600px]">
                  <span className="text-xs text-text-muted text-center px-2">
                    Ad Space<br />160×600
                  </span>
                </div>
              </div>
            </>
          )}

          {/*
            #phaser-root always in DOM — Phaser canvas attaches here at mount and
            survives navigation, so it must not be inside the isFarmView branch.

            Centred on both axes. It used to be pinned near the top (`top-3`),
            which left the panels and the canvas anchored to different things.
          */}
          <div
            id="phaser-root"
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-0"
            style={{ width: `${GAME_WIDTH}px`, height: `${GAME_HEIGHT}px` }}
          />

          {/* Non-dashboard routes */}
          {!isFarmView && (
            <main className="absolute inset-0 overflow-y-auto z-0">
              <div className="max-w-5xl mx-auto px-6 py-6">
                <Outlet />
              </div>
            </main>
          )}

          {/*
            Notifications. Mounted here for lifecycle convenience, but it renders
            through a portal into document.body, so it pins to the top-left of
            the viewport regardless of where this sits in the tree.
          */}
          <NotificationStack />
        </div>
      </div>

    </div>
  );
}