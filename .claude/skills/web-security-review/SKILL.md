---
name: web-security-review
description: Checklist sécurité pour tout code web touchant à l'authentification, l'autorisation, les sessions, ou les données utilisateur. À lancer avant de merger un endpoint, un flow d'auth (register/login/reset/logout), ou un formulaire/upload. Framework-agnostic (NestJS, Express, Django, Rails, etc.).
---

# web-security-review

Revue systématique. Passe chaque point ; pour chacun : **OK**, **à corriger**,
ou **non applicable** (avec la raison). Ne conclus pas "OK" sans avoir regardé
le code concerné.

## 1. Mots de passe et tokens

- [ ] Mots de passe hachés avec **argon2id** (préféré à bcrypt - standard OWASP
      actuel). Jamais de stockage réversible.
- [ ] Tokens sensibles (reset password, vérification email, refresh) :
      générés avec un CSPRNG, **à usage unique**, expiration courte, et
      **hachés en base** (même logique qu'un mot de passe).
- [ ] Aucun secret / hash / token loggé.

## 2. Autorisation (le trou le plus fréquent)

- [ ] Toute route mutative (`POST`/`PATCH`/`PUT`/`DELETE`) sur une ressource
      utilisateur vérifie **authentification ET ownership** (`req.user.id` ==
      propriétaire de la ressource) → **403** sinon, jamais un accès silencieux.
- [ ] Les scaffolds (`nest g resource`, générateurs CRUD) n'ont **aucun guard
      par défaut** : vérifier que chaque route générée est verrouillée avant
      merge, jamais laissée "temporairement ouverte".
- [ ] Aucune décision d'autorisation basée sur un champ fourni par le client
      (rôle, `isAdmin`, ID d'un autre user dans le body).
- [ ] Pas d'IDOR : un ID de ressource dans l'URL est toujours re-vérifié
      contre l'utilisateur courant.

## 3. Énumération et brute-force

- [ ] Login / register / reset-password renvoient les **mêmes messages** et
      n'exposent pas l'existence d'un compte (ni par le texte, ni par le
      timing exploitable).
- [ ] Endpoints d'auth **rate-limités** (throttler / limiteur) - anti
      brute-force et anti-spam d'emails de reset.

## 4. Validation des entrées

- [ ] Validation stricte de **tout** input côté serveur : whitelist des
      champs, rejet des champs inconnus, typage/coercion contrôlée
      (ex. `ValidationPipe` global `whitelist` + `forbidNonWhitelisted` +
      `transform`).
- [ ] Uploads : type MIME vérifié, taille limitée, nom de fichier
      assaini, stockage hors webroot.

## 5. Injections

- [ ] Requêtes SQL **paramétrées** / via l'ORM - jamais de concaténation de
      chaîne avec de l'input.
- [ ] Sortie HTML/JS échappée par défaut (framework de templating ou React) ;
      tout `dangerouslySetInnerHTML` / `|safe` / `v-html` justifié et assaini.
- [ ] En-têtes de sécurité présents (CSP, `X-Content-Type-Options`,
      `X-Frame-Options` / `frame-ancestors`).

## 6. Transport et session

- [ ] Cookies de session : `HttpOnly`, `Secure`, `SameSite` adapté.
- [ ] Pas de token/JWT en `localStorage` si un cookie `HttpOnly` est possible.
- [ ] CORS restreint à l'origine attendue, pas `*` avec credentials.
- [ ] Logout invalide réellement la session côté serveur (ou blackliste le
      refresh token).

## 7. Config et secrets

- [ ] Secrets uniquement via `.env` (git-ignoré) ; `.env.example` à jour.
- [ ] `gitleaks` (pre-commit + CI) passe.
- [ ] En prod : pas de stack trace / message d'erreur détaillé renvoyé au
      client ; pas de mode debug.
- [ ] Dépendances : PR Dependabot traitées, pas de vuln critique connue non
      corrigée.

## Sortie attendue

Un tableau `point - statut - note`, puis une conclusion : **mergeable** ou
**bloquant : <liste>**.
