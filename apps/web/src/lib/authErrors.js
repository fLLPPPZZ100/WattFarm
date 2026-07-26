/**
 * Maps Firebase auth error codes to messages shown to players.
 *
 * Kept out of the UI components so login, registration and password reset all
 * speak with one voice, and so the copy can be reviewed in one place.
 *
 * Deliberate choice on account enumeration: for the login form we do *not*
 * distinguish "no such account" from "wrong password". Firebase itself returns
 * `auth/invalid-credential` for both in recent versions, and revealing which
 * emails are registered is a privacy leak. Registration necessarily reveals it
 * (the address is already taken), so there we are specific.
 */

const MESSAGES = {
  // Credentials
  'auth/invalid-credential': 'E-mail ou senha incorretos.',
  'auth/wrong-password': 'E-mail ou senha incorretos.',
  'auth/user-not-found': 'E-mail ou senha incorretos.',
  'auth/invalid-email': 'Digite um endereço de e-mail válido.',
  'auth/missing-password': 'Digite sua senha.',

  // Registration
  'auth/email-already-in-use': 'Este e-mail já está cadastrado. Tente entrar.',
  'auth/weak-password': 'Senha muito fraca. Use pelo menos 8 caracteres.',

  // Account state
  'auth/user-disabled': 'Esta conta foi desativada. Fale com o suporte.',
  'auth/requires-recent-login': 'Por segurança, entre novamente para continuar.',

  // Rate limiting / abuse
  'auth/too-many-requests':
    'Muitas tentativas. Aguarde alguns minutos antes de tentar de novo.',

  // Network
  'auth/network-request-failed':
    'Falha de conexão. Verifique sua internet e tente novamente.',

  // Google / popup flows
  'auth/popup-closed-by-user': 'A janela de login foi fechada antes de concluir.',
  'auth/cancelled-popup-request': 'Já existe uma tentativa de login em andamento.',
  'auth/popup-blocked':
    'Seu navegador bloqueou a janela de login. Permita pop-ups e tente novamente.',
  'auth/account-exists-with-different-credential':
    'Já existe uma conta com este e-mail usando outro método de login.',
  'auth/operation-not-allowed':
    'Este método de login não está habilitado. Fale com o suporte.',
  'auth/unauthorized-domain':
    'Este domínio não está autorizado no Firebase Auth.',

  // Password reset
  'auth/expired-action-code': 'Este link expirou. Solicite um novo.',
  'auth/invalid-action-code': 'Este link é inválido ou já foi utilizado.',

  // Configuration problems — these mean the developer has work to do, so the
  // message says so plainly instead of blaming the player.
  'auth/invalid-api-key': 'Configuração do Firebase inválida (VITE_FIREBASE_API_KEY).',
  'auth/configuration-not-found':
    'Método de login não configurado no console do Firebase.',
  'auth/internal-error': 'Algo deu errado do nosso lado. Tente novamente.',
};

/** Backend error codes surfaced through ApiError during provisioning. */
const API_MESSAGES = {
  'auth/email-already-linked':
    'Este e-mail já está vinculado a outro método de login. Entre pelo método usado no cadastro.',
  'auth/sync-failed': 'Não foi possível preparar sua conta. Tente novamente.',
  'auth/email-not-verified': 'Verifique seu e-mail para liberar esta ação.',
  'auth/revoked-token': 'Sua sessão foi encerrada. Entre novamente.',
  'auth/expired-token': 'Sua sessão expirou. Entre novamente.',
  'rate-limit/exceeded': 'Muitas requisições. Aguarde um momento.',
  'network/unreachable': 'Não foi possível conectar ao servidor.',
};

/**
 * Converts any thrown auth/API error into a player-facing message.
 *
 * @param {unknown} error a Firebase error, an ApiError, or anything else
 * @returns {string} message safe to render
 */
export function friendlyAuthError(error) {
  if (!error) return 'Ocorreu um erro inesperado. Tente novamente.';

  // ApiError from our backend carries a `code` we control.
  if (error.code && API_MESSAGES[error.code]) return API_MESSAGES[error.code];

  // Firebase errors expose `code` directly.
  if (error.code && MESSAGES[error.code]) return MESSAGES[error.code];

  // Some Firebase paths only embed the code in the message string.
  const haystack = String(error.code || error.message || error);
  for (const [code, message] of Object.entries(MESSAGES)) {
    if (haystack.includes(code)) return message;
  }
  for (const [code, message] of Object.entries(API_MESSAGES)) {
    if (haystack.includes(code)) return message;
  }

  // Our own ApiError instances already carry readable text from the server.
  if (error.name === 'ApiError' && error.message) return error.message;

  return 'Ocorreu um erro inesperado. Tente novamente.';
}

/**
 * Scores password strength for the registration meter.
 *
 * Intentionally simple and transparent: length dominates, with modest credit
 * for character variety. This is guidance for the player, not the security
 * boundary — the minimum length is enforced separately on submit.
 *
 * @param {string} password
 * @returns {{ score: 0|1|2|3|4, label: string, hint: string }}
 */
export function scorePassword(password) {
  const value = password || '';

  if (value.length === 0) {
    return { score: 0, label: '', hint: '' };
  }

  if (value.length < 8) {
    return { score: 1, label: 'Muito curta', hint: 'Use pelo menos 8 caracteres.' };
  }

  let points = 0;
  if (value.length >= 8) points += 1;
  if (value.length >= 12) points += 1;
  if (value.length >= 16) points += 1;
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) points += 1;
  if (/\d/.test(value)) points += 1;
  if (/[^A-Za-z0-9]/.test(value)) points += 1;

  // Common weak patterns cancel out length credit.
  if (/^(.)\1+$/.test(value)) points = 1; // all one character
  if (/^(12345678|password|senha|qwerty|abc123)/i.test(value)) points = 1;

  if (points <= 2) return { score: 2, label: 'Fraca', hint: 'Misture letras, números e símbolos.' };
  if (points <= 4) return { score: 3, label: 'Boa', hint: 'Dá para melhorar com mais variedade.' };
  return { score: 4, label: 'Forte', hint: 'Senha forte.' };
}

export default friendlyAuthError;
