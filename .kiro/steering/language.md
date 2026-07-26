# Language: English only

Everything in this repository is written in English. No exceptions, and no
per-file discretion.

## What this covers

- **Player-facing copy** — page headings, labels, buttons, placeholders, empty
  states, loading text, `aria-label` and `title` attributes, validation
  messages, and the error strings in `apps/web/src/lib/authErrors.js`.
- **API responses** — `error` messages and the `problems[]` arrays returned by
  routes. These surface directly in the UI.
- **Code** — identifiers, comments, JSDoc, log messages, test descriptions.
- **Repository artefacts** — commit messages, PR titles and descriptions,
  branch names, `DECISIONS.md`, steering files.

## Why it is a rule and not a preference

The codebase used to mix the two: English section headings sitting above
Portuguese values, an English `ACCOUNT` panel with a `Senha atual incorreta`
error, `Carregando perfil` under a `PROFILE` title. Every new string then had to
guess which convention applied, and the guess went both ways. One language
removes the decision.

## Notes

- Dates and numbers are still formatted for the user's locale where that makes
  sense — `toLocaleDateString` and friends are about presentation, not copy.
  Keep the format string arguments in English.
- This is a single-language product, not a translated one. Do not add an i18n
  layer, a locale switcher, or translation keys to satisfy this rule; just write
  the English string inline.
- Conversation with the user may happen in any language. This rule is about what
  lands in the repository.
