import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { friendlyAuthError, scorePassword } from '../../lib/authErrors.js';
import { formatAccountAge, formatJoinDate, nextAgeRefreshMs } from '../../lib/accountAge.js';
import { getAvatarImage } from '../../data/avatars.js';

/** Longest nickname accepted. Long enough for a real name, short enough for the header. */
const MAX_NICKNAME_LENGTH = 32;

/** Matches the minimum the registration form enforces. */
const MIN_PASSWORD_LENGTH = 8;

/**
 * One labelled field. The label is small and muted, the value large — the point
 * is that the value is what the eye lands on.
 */
function Field({ label, children, mono = false }) {
  return (
    <div className="bg-bg-abyss border border-line-dusk rounded-lg px-4 py-3">
      <p className="text-[10px] text-text-muted uppercase tracking-wider mb-1">{label}</p>
      <p
        className={
          'text-text-primary break-all ' + (mono ? 'font-mono text-xs' : 'text-sm font-semibold')
        }
      >
        {children}
      </p>
    </div>
  );
}

/**
 * Account identity panel: who you are, since when, and the two things you can
 * change about it.
 *
 * Replaces a block that rendered the email and a truncated `uid.slice(0, 8)` as
 * two lines of muted body text, with no way to change anything.
 */
export default function AccountPanel() {
  const { user, account, hasPasswordProvider, emailVerified, updateDisplayName, changePassword } =
    useAuth();

  /* ── Account age ── */

  const createdAt = account?.createdAt || null;
  const [now, setNow] = useState(() => new Date());

  /**
   * Re-render only as often as the displayed string can actually change: every
   * 30s for a fresh account, every 5 minutes in the days-and-hours range, never
   * once it reads in months. `now` is deliberately not a dependency — it is what
   * the interval sets, and depending on it would rebuild the timer every tick.
   */
  useEffect(() => {
    const period = nextAgeRefreshMs(createdAt);
    if (!period) return undefined;

    const id = setInterval(() => setNow(new Date()), period);
    return () => clearInterval(id);
  }, [createdAt]);

  const joinDate = formatJoinDate(createdAt);
  const age = formatAccountAge(createdAt, now);

  /* ── Nickname ── */

  const currentNickname = user?.displayName || '';
  const [editingNickname, setEditingNickname] = useState(false);
  const [nicknameValue, setNicknameValue] = useState(currentNickname);
  const [nicknameSaving, setNicknameSaving] = useState(false);
  const [nicknameError, setNicknameError] = useState('');
  const [nicknameDone, setNicknameDone] = useState('');

  const openNicknameForm = () => {
    // Seed from the live value each time, so reopening after a change does not
    // show the stale draft.
    setNicknameValue(currentNickname);
    setNicknameError('');
    setNicknameDone('');
    setEditingNickname(true);
  };

  const submitNickname = async (event) => {
    event.preventDefault();

    const trimmed = nicknameValue.trim();
    if (trimmed.length > MAX_NICKNAME_LENGTH) {
      setNicknameError(`O apelido pode ter no máximo ${MAX_NICKNAME_LENGTH} caracteres.`);
      return;
    }
    if (trimmed === currentNickname) {
      setEditingNickname(false);
      return;
    }

    setNicknameSaving(true);
    setNicknameError('');
    try {
      await updateDisplayName(trimmed);
      setNicknameDone(trimmed ? 'Apelido atualizado.' : 'Apelido removido.');
      setEditingNickname(false);
    } catch (err) {
      setNicknameError(friendlyAuthError(err));
    } finally {
      setNicknameSaving(false);
    }
  };

  /* ── Password ── */

  const [editingPassword, setEditingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordDone, setPasswordDone] = useState('');

  const strength = scorePassword(newPassword);

  const closePasswordForm = () => {
    setEditingPassword(false);
    // Never leave secrets sitting in state after the form closes.
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError('');
  };

  const submitPassword = async (event) => {
    event.preventDefault();

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setPasswordError(`A nova senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('As senhas não coincidem.');
      return;
    }
    if (newPassword === currentPassword) {
      setPasswordError('A nova senha precisa ser diferente da atual.');
      return;
    }

    setPasswordSaving(true);
    setPasswordError('');
    try {
      await changePassword(currentPassword, newPassword);
      setPasswordDone('Senha alterada.');
      closePasswordForm();
    } catch (err) {
      /**
       * A failed re-authentication comes back as the same code as a failed
       * login, and the shared copy for it reads "E-mail ou senha incorretos" —
       * which points at a field this form does not even have. Name the actual
       * problem instead.
       */
      const code = err?.code || '';
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        setPasswordError('Senha atual incorreta.');
      } else {
        setPasswordError(friendlyAuthError(err));
      }
    } finally {
      setPasswordSaving(false);
    }
  };

  const inputClass =
    'w-full bg-bg-abyss border border-line-dusk rounded px-3 py-2 text-sm text-text-primary ' +
    'placeholder:text-text-muted/60 focus:outline-none focus:border-accent-watt/60';

  return (
    <div className="bg-bg-panel border border-line-dusk rounded-lg p-6 space-y-5">
      <h3 className="font-display text-sm text-text-primary tracking-wide">ACCOUNT</h3>

      {/* Identity header: avatar + nickname */}
      <div className="flex items-center gap-4">
        <div
          className="shrink-0 rounded-lg overflow-hidden border border-line-dusk bg-bg-abyss"
          style={{ width: '72px', height: '72px' }}
        >
          <img
            src={getAvatarImage(account?.avatarId)}
            alt=""
            className="w-full h-full object-cover block"
            style={{ imageRendering: 'pixelated' }}
          />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-[10px] text-text-muted uppercase tracking-wider mb-1">Nickname</p>
          <p className="font-display text-lg text-accent-watt truncate">
            {currentNickname || <span className="text-text-muted">Sem apelido</span>}
          </p>
          {!editingNickname && (
            <button
              type="button"
              onClick={openNicknameForm}
              className="mt-1 text-xs text-text-muted hover:text-accent-watt transition-colors underline decoration-dotted"
            >
              Change nick
            </button>
          )}
        </div>
      </div>

      {nicknameDone && !editingNickname && (
        <p className="text-xs text-accent-current">{nicknameDone}</p>
      )}

      {editingNickname && (
        <form onSubmit={submitNickname} className="space-y-2">
          <input
            type="text"
            value={nicknameValue}
            onChange={(e) => setNicknameValue(e.target.value)}
            maxLength={MAX_NICKNAME_LENGTH}
            placeholder="Seu apelido"
            autoFocus
            className={inputClass}
          />
          <p className="text-[10px] text-text-muted">
            Aparece no topo da tela. Deixe vazio para usar seu e-mail.
          </p>
          {nicknameError && <p className="text-xs text-red-300">{nicknameError}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={nicknameSaving}
              className="bg-accent-watt text-bg-abyss font-semibold px-4 py-1.5 rounded text-xs hover:brightness-110 transition-all disabled:opacity-40"
            >
              {nicknameSaving ? 'Salvando...' : 'Salvar'}
            </button>
            <button
              type="button"
              onClick={() => setEditingNickname(false)}
              className="px-4 py-1.5 rounded text-xs text-text-muted hover:text-text-primary border border-line-dusk"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {/* The facts */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Email">
          {user?.email || '—'}
          {!emailVerified && (
            <span className="ml-2 text-[10px] uppercase tracking-wider text-red-300 border border-red-800 rounded px-1.5 py-0.5 align-middle">
              não verificado
            </span>
          )}
        </Field>

        {/* Shown in full rather than truncated to 8 characters — a partial id is
            no use when support asks for it. */}
        <Field label="User ID" mono>
          {user?.uid || '—'}
        </Field>

        <Field label="Conta criada em">{joinDate || '—'}</Field>

        <Field label="Tempo de conta">{age || '—'}</Field>
      </div>

      {/* Password */}
      <div className="pt-4 border-t border-line-dusk">
        {hasPasswordProvider ? (
          <>
            {!editingPassword && (
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-text-primary">Senha</p>
                  {passwordDone ? (
                    <p className="text-xs text-accent-current mt-0.5">{passwordDone}</p>
                  ) : (
                    <p className="text-xs text-text-muted mt-0.5">
                      Pediremos sua senha atual para confirmar.
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPasswordDone('');
                    setEditingPassword(true);
                  }}
                  className="shrink-0 px-4 py-1.5 rounded text-xs text-text-muted hover:text-accent-watt border border-line-dusk hover:border-accent-watt/40 transition-colors"
                >
                  Change password
                </button>
              </div>
            )}

            {editingPassword && (
              <form onSubmit={submitPassword} className="space-y-3">
                <p className="text-sm text-text-primary">Change password</p>

                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Senha atual"
                  autoComplete="current-password"
                  className={inputClass}
                />
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Nova senha"
                  autoComplete="new-password"
                  className={inputClass}
                />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repita a nova senha"
                  autoComplete="new-password"
                  className={inputClass}
                />

                {/* Same meter as registration, so the guidance is consistent. */}
                {newPassword && (
                  <p className="text-[10px] text-text-muted">
                    Força: <span className="text-text-primary">{strength.label}</span>
                    {strength.hint ? ` — ${strength.hint}` : ''}
                  </p>
                )}

                {passwordError && <p className="text-xs text-red-300">{passwordError}</p>}

                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={passwordSaving}
                    className="bg-accent-watt text-bg-abyss font-semibold px-4 py-1.5 rounded text-xs hover:brightness-110 transition-all disabled:opacity-40"
                  >
                    {passwordSaving ? 'Salvando...' : 'Salvar senha'}
                  </button>
                  <button
                    type="button"
                    onClick={closePasswordForm}
                    className="px-4 py-1.5 rounded text-xs text-text-muted hover:text-text-primary border border-line-dusk"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            )}
          </>
        ) : (
          /* A Google-only account has no password; offering the form would
             produce a Firebase error the player cannot act on. */
          <div>
            <p className="text-sm text-text-primary">Senha</p>
            <p className="text-xs text-text-muted mt-0.5">
              Sua conta entra pelo Google, então a senha é gerenciada lá.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
