# DIPPER — IMPLEMENTATION_STATUS.md
## État : Phase 0 ✅ — Phase 1 ✅ — Phase 2 ✅ — Phase 3 ✅ — Phase 4A ✅ — Phase 4B ✅ — Phase 4C ✅ — séparation Telegram ✅ — Phase 4D ✅ — séparation Website + refonte écran de connexion ✅ TERMINÉE ET VALIDÉE — en attente de nouvelles instructions

---

## Décisions validées (remplacent les questions ouvertes de Phase 0)
1. `.pair` : **self-service pour tous**, plus d'owner-only. Même moteur pour WhatsApp, Telegram (à créer), site Web (à créer).
2. Stockage : **hybride confirmé** — MongoDB pour credentials/sessions/pairing (inchangé), JSON **par session** pour les données métier. Structure retenue : `database/sessions/<sessionId>/{groups,users,warnings,mods,botState}.json` (+ `modlogs/`, `cache/`, `media/` à répartir progressivement).
3. Telegram/Web : n'existent pas, à concevoir plus tard. Phase 0/1 préparent uniquement le terrain (Pairing Service isolé, appelable par les deux canaux quand ils existeront).
4. Migration **strictement progressive**, aucun big bang, bot fonctionnel à chaque étape — c'est le principe appliqué en Phase 1 (voir plus bas).

---

## Séparation du site Web + refonte de l'écran de connexion — TERMINÉE ET VALIDÉE

Le dossier `web/` a été extrait vers `/Website`, projet indépendant au même titre que `/TelegramBot` (son propre `package.json`, un petit `server.js` natif sans dépendance pour `npm start`). Architecture finale à trois projets : `Bot WhatsApp/` (backend+API), `TelegramBot/`, `Website/` — communication strictement limitée à l'API HTTP.

L'écran de saisie du numéro a été refait avec **intl-tel-input** (v29, MIT) au lieu du sélecteur `<select>` écrit à la main — recherche par nom/indicatif/code ISO, sélecteur plein écran sur mobile, formatage et validation par pays appuyés sur `libphonenumber`, thème re-stylé en violet/cyan/noir pour rester cohérent avec le reste du site. Validation client = pré-vérification UX uniquement ; `pairingService.js` reste l'unique source de vérité, aucune logique dupliquée. Repli gracieux (simple champ texte) si la bibliothèque ne charge pas.

23 tests réels en navigateur Chromium (dont le chemin de repli en conditions réseau réellement bloquées, et le chemin bibliothèque via une simulation fidèle à l'API officielle documentée) : tous PASS. Détail complet dans `PROGRESS.md`.

**Aucune fonctionnalité existante cassée — API, bot Telegram et backend WhatsApp inchangés.**

## Phase 4D — TERMINÉE ET VALIDÉE : audit final + durcissement de l'écosystème complet

Audit systématique du système entier (site Web + API + bot Telegram + WhatsApp self-service) selon la checklist demandée. 5 bugs réels trouvés et corrigés, minimum de fichiers touchés :

1. **Sessions orphelines (lacune majeure)** : seul le bot Telegram nettoyait les sessions qu'il créait lui-même — rien ne couvrait le site Web ou `.pair` self-service WhatsApp, ni un crash du bot Telegram en plein suivi. Corrigé par un filet de sécurité **centralisé** dans `utils/sessionManager.js` (`startOrphanSessionSweep()`, toujours actif, réutilise `getAllSessions()`/`stopSession()` existants) — couvre tous les canaux d'un coup.
2. **Validation de numéro incomplète** : pas de borne maximale. Ajouté (≤15, limite E.164) dans `pairingService.js` — hérité automatiquement par les 3 canaux.
3. **`/delsession` (Telegram) confirmait un succès même quand l'appel API échouait réellement** — corrigé, plus de fausse confirmation, plus de session orpheline silencieuse.
4. **Erreurs réseau brutes exposées à l'utilisateur Telegram** — `pairingApiClient.js` les convertit maintenant en erreur typée avec message propre.
5. **Endpoints internes (`/session/status`, `/session/stop`) sans protection** — ajout d'une clé partagée optionnelle (`API_INTERNAL_TOKEN`), non activée par défaut (rien ne casse), recommandée en production.

15 tests réels (dont le vrai `sessionManager.js` avec toutes ses dépendances, un vrai serveur HTTP, un vrai client HTTP) : tous PASS. Aucune régression sur les 24+33 tests des phases précédentes (revue manuelle des diffs — aucune signature exportée changée). Détail complet dans `PROGRESS.md`.

**Aucune nouvelle fonctionnalité ajoutée hors du périmètre de durcissement demandé.**

## Bot Telegram extrait en projet indépendant (`/TelegramBot`)

Suite à une demande explicite : le bot Telegram n'est plus lancé depuis `index.js` de ce projet et n'utilise plus MongoDB. C'est maintenant un projet séparé (`/TelegramBot`, sibling de ce dossier), avec son propre `package.json`/`.env`/cycle de démarrage (`cd TelegramBot && npm start`), son propre stockage JSON local (`telegramUsers.json`, `telegramSessions.json`, `waiting.json`), et un seul lien avec ce projet : l'API HTTP.

**Impact sur ce projet (WhatsApp) — minimal, 3 fichiers :**
- `api/server.js` : 2 nouveaux endpoints ajoutés — `GET /session/status?phoneNumber=...` et `POST /session/stop` (exposent `sessionManager.getSession()`/`stopSession()`, déjà existants, non modifiés). ⚠️ Ces routes ne vérifient pas la propriété du numéro appelant — à sécuriser si l'API sort d'une communication interne entre les deux projets.
- `index.js` : bloc de démarrage du bot Telegram retiré.
- `.env.example` : section Telegram retirée (déplacée dans `/TelegramBot/.env.example`).
- Dossier `telegram/` supprimé (déplacé vers `/TelegramBot`, pas dupliqué).

10 tests de non-régression API + 14 tests de bout en bout (vrai serveur HTTP + vrai client HTTP du projet Telegram séparé) : tous PASS. Détail complet dans `PROGRESS.md`. Toutes les fonctionnalités de la Phase 4C (pair, activesession, delsession, owner, broadcast, vérification canal/groupe, isolation entre utilisateurs) confirmées intactes après la séparation.

**Pour la suite du bot Telegram, voir `/TelegramBot/README.md` et son propre `IMPLEMENTATION_STATUS.md` si créé.**

## Phase 4C — TERMINÉE : Bot Telegram "The Big Dipper"

Nouveau dossier `telegram/` (`telegramClient.js`, `membershipGuard.js`, `telegramStore.js`, `pendingActions.js`, `pairingCodeWatcher.js`, `commands.js`, `bot.js`). Aucun fichier existant du moteur modifié — uniquement `index.js` (démarrage opt-in) et `.env.example` (doc des 2 nouvelles variables `TELEGRAM_BOT_TOKEN`/`TELEGRAM_OWNER_ID`).

**Point important tranché avant de coder :** aucune durée de validité officielle et documentée n'existe pour un code de pairing WhatsApp/Baileys (recherche effectuée, détail dans `PROGRESS.md`). Plutôt que d'inventer un chiffre, `pairingCodeWatcher.js` observe l'état réel de la session (`sessionManager.getSession().isOnline`) pour détecter succès ou expiration, sans jamais afficher une durée fabriquée comme si elle était officielle.

Vérification d'appartenance canal+groupe **centralisée** (`membershipGuard.ensureMembership()`), revérifiée à chaque commande liée à WhatsApp (`/pair`, `/activesession`, `/delsession`), pas seulement au `/start`. Isolation stricte entre utilisateurs Telegram pour leurs sessions (nouvelles collections Mongo `telegram_users`/`telegram_sessions`, via `mongoClient.js` existant, non modifié). `/delsession` avec état d'attente à expiration automatique (3 min), intercepte toute réponse hors numéro valide — y compris une autre commande. `/broadcast` owner-only avec rate limiting, comptage exact, résilient aux échecs individuels (utilisateur ayant bloqué le bot, etc.).

Bouton "Copier le code" : pas de fausse capacité inventée — l'API Telegram Bot ne permet pas d'écrire dans le presse-papiers, donc code affiché en `<code>` (tap-to-copy natif) + alerte Telegram native en repli.

33 tests réels (faux client Telegram + faux sessionManager/Mongo injectés) : tous PASS — dont l'isolation entre deux utilisateurs Telegram, la suppression réelle qui appelle `stopSession()`, le broadcast avec un utilisateur "bloquant" le bot, et la détection de connexion/expiration du pairing.

**Aucun code de la Phase 4D (`/pair` en message privé WhatsApp) commencé.**

## Phase 4B — TERMINÉE : Site Web de pairing (frontend uniquement)

Nouveau dossier `web/` (`index.html`, `css/style.css`, `js/app.js`, `js/countries.js`, `README.md`) : site statique HTML/CSS/JS sans framework qui consomme `POST /pair` (Phase 4A). Aucune logique de pairing dupliquée — validation légère côté client (champ non vide) uniquement, tout le reste reste dans `pairingService.js`.

Thème signature : la Grande Ourse (Big Dipper) réellement dessinée en arrière-plan animé, en écho direct au nom du projet. Formulaire pays + numéro (sélecteur natif, ~70 pays), 3 états de carte (formulaire / code obtenu / déjà reconnecté), copie presse-papiers avec repli, erreurs traduites en notifications élégantes (jamais de JSON brut ni d'`alert()`), respect de `prefers-reduced-motion`, focus clavier visible.

URL de l'API configurable via `window.DIPPER_API_BASE_URL` (défaut : relatif, même origine) — documenté dans `web/README.md`.

Testé en vrai navigateur Chromium (Playwright) avec API mockée par interception réseau : 16/17 vérifications automatiques passées (desktop/mobile/tablette sans débordement, formulaire, succès, reconnexion, 3 types d'erreurs, copie, clavier, reduced-motion). Le seul point non conforme est un chargement de police Google Fonts bloqué par le proxy réseau de l'environnement de travail (sandbox sans accès internet sortant) — non représentatif d'un déploiement réel, et sans impact car les polices système de repli prennent le relais.

**Aucun fichier du moteur (`pairingService.js`, `sessionManager.js`, `database.js`, `api/server.js`) modifié.** Aucun code Telegram commencé.

**Prochaine étape : Phase 4C (bot Telegram), à ne commencer qu'après validation explicite.**

## Phase 4A — TERMINÉE : API HTTP Pairing (backend uniquement)

Nouveau `api/server.js` : `POST /pair` (body `{ phoneNumber }` → `{ sessionId, pairingCode, reconnected }`), `GET /health`. Construit avec le module `http` natif de Node (pas Express — aucune dépendance HTTP n'existait avant, une seule route ne le justifie pas ; migration vers Express triviale plus tard si besoin, `createServer()` est le seul point de contact). Aucune logique métier dans ce fichier — tout passe par `pairingService.createPairingSession()` (Phase 3), inchangé.

Démarrage opt-in via `API_PORT` (documenté dans `.env.example`) — si absent, rien ne démarre, zéro impact sur les déploiements existants. Démarré une seule fois dans `index.js`, indépendamment du cycle crash/restart du bot WhatsApp (`launchBot()`), pour ne jamais tenter d'écouter deux fois sur le même port.

10 tests réels contre un vrai serveur HTTP en écoute (health check, création, champ manquant, numéro invalide, anti-doublon, cooldown, reconnexion, échec de code, route inconnue, JSON invalide) : tous PASS. Détail dans `PROGRESS.md`.

Nettoyage incidental : suppression de `global.ghostgMode = config.ghostgMode` dans `index.js`, code mort confirmé (oubli de la Phase 2 — plus rien ne le lit depuis la correction de `ghostg.js`).

**Aucune interface commencée (ni site Web, ni Telegram)** — conforme au découpage strict demandé. Prochaine étape : Phase 4B (site Web consommant cette API), à ne commencer qu'après validation explicite.

## Phase 3 — TERMINÉE : Pairing Service neutre

Nouveau `utils/pairingService.js` : `createPairingSession(phoneNumber, { requesterKey })` → `{ sessionId, pairingCode, reconnected }`. Aucun code WhatsApp/Telegram/Web à l'intérieur — le canal appelant affiche le résultat comme il veut. Réutilise entièrement `sessionManager.js`/`mongoClient.js`/`sessionContext.js` existants.

Refactor nécessaire : la demande de code de pairing était couplée à WhatsApp dans `sessionManager.js` (envoi direct via `sock.sendMessage`). Extraite en fonction neutre `requestPairingCode()`, awaitable, réutilisable par n'importe quel canal. `.pair` (`commands/bot_sovereignty/pair.js`) n'est plus `ownerOnly` — self-service pour tous, comme demandé.

Gère nativement : anti-abus (cooldown par demandeur), anti-doublon, reconnexion (numéro déjà appairé → pas de nouveau code), rollback si le code échoue après création de la session, erreurs typées (`PairingError.code`). 8 tests réels (mock de sessionManager/mongoClient) : tous PASS — détail dans `PROGRESS.md`.

**Prochaine étape explicitement mise en attente par l'utilisateur : ne rien commencer d'autre tant que de nouvelles instructions n'arrivent pas** (la suite prévue est l'intégration automatique de la chaîne/groupe WhatsApp officiels à la connexion d'un nouvel utilisateur, mais ce n'est PAS encore démarré).

## Phase 2 — TERMINÉE : audit exhaustif d'isolation multi-session

Toutes les catégories demandées ont été auditées (écritures JSON, caches mémoire, cooldowns, anti-spam, statistiques, médias, logs, plugins, timers, listeners, chemins de fichiers, variables globales). 30 fichiers corrigés, tous avec le même mécanisme réutilisé (`sessionContext.scopeKey()` pour les caches mémoire, `database/sessions/<id>/` pour les fichiers). Détail complet, bug le plus critique (`ghostgMode`) et tests réels : voir `PROGRESS.md`.

**Point tmp/temp fermé :** les deux systèmes de fichiers temporaires partagés (`temp/` via `utils/tempManager.js`, et `tmp/` dans `purification.js`/`update.js`) sont maintenant scopés par session (`temp/<sessionId>/`, `tmp/<sessionId>/`). Détail complet et tests réels dans `PROGRESS.md`.

**Limite de validation connue (inchangée depuis Phase 1) :** pas de `node_modules`/accès réseau dans l'environnement de travail → impossible de lancer `handler.js` avec ses 193 commandes en conditions réelles. Tous les fichiers modifiés passent `node --check` (syntaxe) et la logique d'isolation a été testée fonctionnellement en simulant le contexte de session (`utils/sessionContext.js`) directement.

## Phase 1 — TERMINÉE : `database.js` isolé par session

- Mécanisme : `utils/sessionContext.js` (AsyncLocalStorage) — le sessionId courant traverse toute la chaîne asynchrone d'un message sans toucher `handler.js` ni les 193 commandes.
- `database.js` : refonte interne uniquement, signatures exportées inchangées.
- Points de branchement (les 2 seuls endroits touchés en dehors de `database.js`/`sessionContext.js`) : `utils/sessionManager.js` (mode multi-session) et `index.js` (mode legacy mono-session, session `default`).
- Migration automatique et non destructive des anciens fichiers racine vers `sessions/default/` au premier accès.
- Tests fonctionnels d'isolation réels : PASS (détail dans `PROGRESS.md`).
- **Reste à faire avant prod : test d'intégration complet avec `npm install` et `handler.js` chargé en entier** (non exécutable dans l'environnement de travail actuel, pas d'accès réseau/`node_modules`).

## Phase 0 — Audit multi-session & architecture (avant tout code)

---

## ⚠️ Correction de postulat (important)

Le brief de reprise indique « tu n'as encore rien implémenté concernant le pairing ». **C'est inexact** — l'audit du zip fourni montre qu'une base multi-session existe déjà et fonctionne selon un principe correct (1 processus, N sockets Baileys) :

- `utils/mongoAuth.js` : auth Baileys stockée dans MongoDB, **une collection par session** (`auth_session_<numéro>`) — isolation des credentials déjà correcte.
- `utils/sessionManager.js` : `startSession()`/`stopSession()`/`getSession()`/`getAllSessions()`/`loadAllSessions()`. Chaque session a son propre socket, son `messageStore`, sa map anti-doublon, ses timers (heartbeat, reconnexion avec backoff). Recharge toutes les sessions Mongo au démarrage.
- `commands/bot_sovereignty/pair.js` : commande `.pair <numéro>`, **owner only**, avec double mode — legacy (mono-session, sans Mongo) et multi-session (si `MONGODB_URI` présent). Anti-doublon si session déjà en ligne.
- `index.js` : bascule automatique mono/multi selon la présence de `MONGODB_URI`.

Donc la **couche transport (sockets + credentials)** est déjà multi-session et déjà isolée correctement. Ce n'est pas à reconstruire.

---

## 🚨 Lacune critique identifiée (le vrai chantier)

`database.js` — la couche **données métier** (paramètres de groupe, utilisateurs, warnings, modérateurs, état du bot) — est **globale et partagée par toutes les sessions** :

- `database/groups.json`, `database/users.json`, `database/warnings.json`, `database/mods.json`, `database/botState.json` : un seul fichier chacun, un seul cache mémoire, lu/écrit par n'importe quelle session.
- Concrètement : si l'utilisateur A et l'utilisateur B ont chacun un groupe WhatsApp portant le même JID (impossible en pratique, JID est unique) ce n'est pas le problème — le vrai problème est que **les réglages, warnings, et modérateurs de tous les groupes de tous les utilisateurs finissent dans les mêmes 5 fichiers**, sans notion de « à quelle session/quel propriétaire appartient cette donnée ». Sur 100–500 utilisateurs, ces fichiers deviennent un point de contention unique (debounce 2s partagé, un seul writer) et une fuite d'isolation potentielle si deux commandes de deux sessions différentes touchent la même clé au même moment.
- De plus, `commands/` (193 fichiers) importent `require('../../database')` directement — un singleton global. Il n'y a **aucun concept de contexte de session** qui descend jusqu'aux commandes.

**C'est donc ça, l'écart réel entre « transport multi-session » (fait) et « plateforme multi-session » (à faire) : la couche Storage/Database/Command Context n'est pas scopée par session.**

---

## Composants — état réel

| Composant | État | Action requise |
|---|---|---|
| Sockets Baileys (N sessions, 1 processus) | 🟢 Fait | Aucune — RAS |
| Auth credentials (Mongo, par session) | 🟢 Fait | Aucune |
| Reconnexion / backoff / cleanup listeners | 🟢 Fait | Aucune |
| Commande `.pair` côté WhatsApp | 🟢 Fait (owner only) | Ouvrir à tout utilisateur (cf. décision à valider #1) |
| `database.js` (groups/users/warnings/mods/state) | 🔴 Non scopé par session | Refonte : namespacing par sessionId, ou 1 fichier/collection par session |
| Command Context (`extra` passé aux commandes) | 🟠 Existe mais sans notion de session | Ajouter `extra.sessionId` / `extra.sessionDb` explicite |
| Media/logs/cache par utilisateur | 🔴 Inexistant (chemins globaux : `data/modlogs`, `data/group_backups`) | À scoper par session |
| Pairing Service unifié (Web/Telegram/WhatsApp) | 🔴 Inexistant — seule la voie WhatsApp existe, et couplée à la commande `.pair` (owner only, pas self-service) | À extraire en service neutre (cf. architecture) |
| Bot Telegram | 🔴 Absent du zip fourni | À créer (ou existe dans un autre projet à fournir — voir question) |
| Site Web | 🔴 Absent du zip fourni | À créer |
| Vérification communauté officielle | 🔴 Non commencé (explicitement reporté après le pairing, conforme au brief) | Ne pas commencer |

---

## Architecture proposée

```
                    ┌──────────────────────────┐
                    │      Pairing Service       │  (neutre, sans I/O canal)
                    │  createSession(phone)       │
                    │   → { sessionId, code }     │
                    └─────────────┬────────────┘
                                  │
                ┌─────────────────┼─────────────────┐
                │                 │                 │
        ┌───────▼──────┐  ┌───────▼──────┐  ┌───────▼──────┐
        │  WhatsApp     │  │  Telegram     │  │  Web (API)    │
        │  commande      │  │  bot          │  │  formulaire    │
        │  `pair`        │  │               │  │                │
        └───────┬──────┘  └───────┬──────┘  └───────┬──────┘
                └─────────────────┼─────────────────┘
                                  │  (les 3 appellent le même service,
                                  │   aucune logique dupliquée)
                    ┌─────────────▼────────────┐
                    │      Session Manager        │  (existe déjà, à étendre)
                    │  socket Baileys par session  │
                    └─────────────┬────────────┘
                    ┌─────────────▼────────────┐
                    │    Command Context           │  (à créer : porte le
                    │  { sessionId, sessionDb,      │   scope de session jusqu'aux
                    │    sessionPaths, ... }        │   193 commandes existantes)
                    └─────────────┬────────────┘
                    ┌─────────────▼────────────┐
                    │   Storage / Database Manager │  (refonte de database.js)
                    │  par-session : settings,      │
                    │  warnings, mods, media, logs, │
                    │  cache, stats                 │
                    └───────────────────────────┘
```

### Storage — structure de dossiers proposée
```
sessions/<sessionId>/
  auth/          (déjà dans Mongo — inchangé)
  database/
    groups.json
    users.json
    warnings.json
    mods.json
    botState.json
  media/
  logs/
    modlogs/
  cache/
  stats/
```
Alternative full-Mongo (recommandée dès 100+ utilisateurs pour éviter le I/O disque concurrent) : une base/collection Mongo par session au lieu de fichiers JSON, en réutilisant le pattern déjà validé par `mongoAuth.js` (`db.collection('data_' + sessionId)`), avec le même cache mémoire + debounce que `database.js` actuel mais scopé par session.

### Pairing Service — contrat strict (conforme au brief)
`createPairingSession(phoneNumber) → { sessionId, pairingCode }`
- Ne fait *que* ça. Aucun accès Web/Telegram/WhatsApp à l'intérieur.
- Réutilise `sessionManager.startSession()` existant (déjà quasiment ce contrat) mais **retire l'obligation `isOwner`** et le couplage à `pairingSock`/`pairingChatId` — le service retourne le code, chaque canal (WhatsApp/Telegram/Web) décide comment l'afficher.

---

## Ce qui reste inchangé
- `mongoAuth.js`, `sessionManager.js` (transport) — étendus, pas réécrits.
- Les 193 commandes existantes — compatibles sans casse tant que `database.js` garde la même API de surface (`getGroupSettings`, etc.) en interne redirigée vers le stockage scopé.
- Style, menus, group_management — hors périmètre (déjà terminés selon le brief).

---

## Risques identifiés
1. **Migration de données existantes** : les fichiers globaux actuels (`database/*.json`) contiennent déjà des données du numéro owner actuel — il faudra les rattacher à la session correspondante lors de la migration, pas les perdre.
2. **193 commandes à ne pas casser** : si `extra.sessionId` n'est pas propagé partout, une commande peut silencieusement retomber sur le mauvais scope. Nécessite un point d'entrée unique (`handler.js`) qui injecte systématiquement le contexte de session — pas une modification commande par commande.
3. **Concurrence disque à 500 sessions** : fichiers JSON par session limitent le risque de collision mais multiplient les descripteurs de fichiers/watchers — argument pour bascule Mongo si la cible 1000 utilisateurs est prise au sérieux.
4. **Ouvrir `.pair` à tous les utilisateurs** (actuellement `ownerOnly: true`) est un changement de comportement utilisateur → à valider explicitement (voir ci-dessous), pas à appliquer directement.

## Dépendances
- Pairing Service dépend du Session Manager existant (déjà prêt).
- Command Context dépend du nouveau Storage Manager (à faire avant, sinon rien à y brancher).
- Bot Telegram et site Web dépendent tous deux du Pairing Service (à faire en premier).

## Ordre de travail proposé
1. Storage Manager scopé par session (refonte `database.js`) — fondation de tout le reste.
2. Command Context (`extra.sessionId`, `extra.sessionDb`) injecté dans `handler.js`.
3. Pairing Service extrait (neutre, réutilisable) à partir de `sessionManager.startSession`.
4. Ouverture de `.pair` à tous les utilisateurs côté WhatsApp (après validation du changement de comportement).
5. Bot Telegram consommant le Pairing Service.
6. API Web + formulaire consommant le Pairing Service.
7. (Plus tard, hors scope actuel) Vérification communauté officielle.

---

## Décisions à valider avant implémentation
1. **`.pair` doit-elle rester owner-only ou devenir self-service pour tout utilisateur ?** Le brief dit « tous les utilisateurs pourront l'utiliser » mais le code actuel est `ownerOnly: true` — changement de comportement utilisateur, à confirmer explicitement.
2. **Fichiers JSON par session ou Mongo par session ?** Fichiers = plus proche de l'existant, moins de refonte immédiate. Mongo = plus robuste à 500-1000 utilisateurs, réutilise le pattern `mongoAuth.js`. Les deux sont compatibles avec l'architecture ci-dessus ; le choix change surtout `utils/sessionManager.js`/nouveau Storage Manager.
3. **Le bot Telegram et le site Web existent-ils déjà dans un autre projet**, ou faut-il les créer de zéro dans ce dépôt ? Le zip fourni ne contient que le bot WhatsApp.

---

## Point de reprise
Phase 0 terminée : audit fait, architecture proposée, écart réel identifié (Storage non scopé, pas le transport). En attente de réponse aux 3 décisions ci-dessus avant de commencer l'implémentation (étape 1 : Storage Manager).

---

## Commandes sans préfixe — Supreme Owner / Owner (terminé)

**Statut : 🔴 Corrigé / terminé et validé.**

- Fichier modifié : `handler.js` uniquement (2 emplacements : détection `isCommand`, extraction `rawArgs`/`commandName`).
- Aucun autre fichier touché (193 commandes, aliases, permissions, menus, Premium, VIP, Pairing, Telegram, Site Web — tous inchangés).
- Comportement : `isMe` (Supreme Owner + Owner + fromMe) peut invoquer toute commande avec ou sans préfixe ; tous les autres utilisateurs (y compris Sudo) doivent toujours utiliser le préfixe, comportement strictement inchangé pour eux.
- Détail complet, y compris les 18 tests réels exécutés (18/18 PASS) et l'effet de bord (non modifié) sur le bloc NLP `ghostgMode` : voir `PROGRESS.md`.

---

## Réaction ⚜️ systématique sur commande exécutée (Owner/Supreme Owner) — terminé

**Statut : 🔴 Corrigé / terminé et validé.**

- Fichier modifié : `handler.js` uniquement (1 emplacement, juste après résolution de la commande, avant la hiérarchie d'accès).
- `isMe` (Owner + Supreme Owner) reçoit désormais la réaction ⚜️ sur CHAQUE commande exécutée, préfixée ou non, sans dépendre du toggle `ghostgMode`.
- Aucun autre utilisateur concerné. `ghostgMode`/`.dark` conservent leur rôle de toggle NLP, inchangés.
- 5/5 tests réels PASS — détail dans `PROGRESS.md`.

---

## Commande `gc` (adaptation d'un gcstatus externe) — terminé

**Statut : 🔴 Corrigé / terminé et validé.**

- Fichier créé : `commands/group_management/gc.js` (nouveau, seul fichier ajouté).
- Aucun fichier existant modifié.
- Logique interne (checkAuth, téléchargement média, conversion audio, publication du statut) strictement identique au code fourni. Adaptations : export au format DIPPER, import `isOwnerOrSudo` remplacé par un équivalent local (`isAnyOwner`/`isSudoUser` de `handler.js`), chemin `CONFIG_PATH` corrigé pour la profondeur réelle des dossiers, textes traduits en français, crédit `Daratech` → `DIPPER`, `$gcstatus` → `${prefix}gc` dans les textes d'usage.
- ⚠️ Signalé (non corrigé sans autorisation) : chevauchement fonctionnel avec les commandes déjà existantes `groupstatus.js` (alias `gcstatus`) et `tostatus.js`. Aucune collision technique (nom `gc` libre), mais à clarifier si un comportement unifié ou des alias spécifiques sont souhaités.
- 20/20 tests réels PASS (chargement réel de `commandLoader`, exécution via le vrai `handler.js`) — détail dans `PROGRESS.md`.

---

## Stabilisation Pairing + identité dynamique du Owner — Phase 0 (AUDIT)

**Statut : 🟡 Audit terminé, aucune modification de code. En attente de validation avant Phase 1.**

Constats confirmés (détail complet + preuves dans `PROGRESS.md`) :
1. 🔴 `api/server.js` ne démarre jamais sans `API_PORT` — absent du vrai `.env` → cause racine du "Something went wrong" côté site Web (et probablement Telegram, même dépendance).
2. 🔴 `index.js` génère encore un code de pairing automatique au démarrage pour `PHONE_NUMBER` (présent dans le vrai `.env`) — comportement à supprimer selon la demande, décision à confirmer sur le premier appairage du bot une fois ce bloc retiré.
3. 🔴 Nom du Owner affiché = `OWNER_NAME` (`.env`), jamais le compte WhatsApp réellement connecté.
4. 🟡 Préfixe : code déjà correct (`.` par défaut), mais le vrai `.env` contient `PREFIX=+` — décision à confirmer avant de le changer.
5. 🟢 `pairingService.js`, `sessionManager.js`, `api/server.js`, `.pair` (mode multi-session), et le bot Telegram (documentation) appellent déjà tous le même moteur unique — pas de logique dupliquée à corriger sur ce point.

Plan en 5 phases proposé, en attente de feu vert avant Phase 1.

---

## Stabilisation Pairing + identité dynamique du Owner — Phases 1-5 — terminé

**Statut : 🔴 Corrigé / terminé et validé par tests réels (26 + 5 régression = 31 tests, tous PASS).**

Fichiers modifiés :
- `api/server.js` — API démarre toujours automatiquement (port par défaut 3001) ; nouveau code d'erreur `DB_UNAVAILABLE` (503).
- `index.js` — bloc de génération automatique de code au démarrage (`PHONE_NUMBER`) supprimé.
- `utils/pairingService.js` — `getDb()` protégé par try/catch → panne MongoDB typée proprement au lieu de crasher en erreur générique 500.
- `commands/general_tools/menu.js`, `commands/bot_sovereignty/botstatus.js`, `commands/general_tools/ping.js` — nom du Owner lu dynamiquement depuis la session connectée (`sock.user.name`), plus depuis `.env`.
- `commands/bot_sovereignty/pair.js` — message dédié pour `DB_UNAVAILABLE`.
- `.env` — `PREFIX` corrigé (`+` → `.`) ; `.env.example`/`app.json` alignés (rôle de `PHONE_NUMBER` clarifié, `PREFIX` par défaut corrigé).
- **Nouveau fichier** : `utils/ownerIdentity.js`.
- **Nouveau fichier (autre projet)** : `Website/js/app.js` — message dédié pour `DB_UNAVAILABLE`.

Correction importante découverte en cours d'implémentation (transparence) : le diagnostic initial ("API jamais démarrée" seule) était incomplet — une panne MongoDB non interceptée dans `pairingService.js` est la cause la plus probable et la plus directe du message exact "Something went wrong on our end" rapporté. Corrigée (voir `PROGRESS.md` pour le détail complet).

Aucune régression : commande `gc`, commandes sans préfixe Owner, réaction ⚜️, `.menu` — tous revérifiés (5/5 PASS).

---

## API Pairing universelle — compatible tous hébergeurs — terminé

**Statut : 🔴 Corrigé / terminé et validé par tests réels (8/8 tests PASS, `tests/api-server.test.js`).**

**Cause racine identifiée par audit :** `api/server.js` ne lisait que la variable maison `API_PORT` (jamais `PORT`, la variable standard que Railway, Render, Katabump, TeoHéberge et la quasi-totalité des hébergeurs Node injectent automatiquement pour rediriger le trafic public). Sans `API_PORT` défini manuellement, l'API démarrait toujours sur le port fixe 3001 — un port que l'hébergeur ne route jamais vers l'extérieur. Résultat exact observé : *"Can't reach the pairing service at this address..."*, quel que soit l'hébergeur.

Fichier modifié :
- `api/server.js` — `startApiServer()` :
  - Résolution du port : `process.env.PORT || process.env.API_PORT || 3001` (`PORT` prioritaire, `API_PORT` conservé en repli pour compatibilité VPS/Docker existants, aucune régression).
  - Écoute explicite sur `0.0.0.0` (toutes les interfaces réseau) au lieu de laisser l'hôte implicite — élimine tout risque de liaison restreinte à `localhost`/`127.0.0.1` selon la configuration IPv4/IPv6 de l'environnement.
  - Logs de démarrage enrichis : port effectif, hôte, et **source** de la valeur (`PORT`, `API_PORT` ou défaut) — diagnostic immédiat en cas de nouveau problème de connectivité.
  - Messages d'erreur explicites pour `EADDRINUSE` et `EACCES` (au lieu du message générique précédent).

Fichiers non touchés (conformément à la demande) : moteur WhatsApp, `pairingService.js` (logique métier de pairing), site Web, bot Telegram.

Nouveau fichier : `tests/api-server.test.js` (Node `node:test`, natif — aucune dépendance ajoutée) — 8 tests réels :
1. Démarrage local sans variable définie → port par défaut 3001.
2. Démarrage avec `PORT` imposé (standard hébergeurs cloud).
3. `PORT` prioritaire sur `API_PORT` quand les deux sont définis.
4. `API_PORT` sert de repli si `PORT` est absent (VPS/Docker).
5. Écoute confirmée sur `0.0.0.0` (jamais restreinte à `localhost`).
6. Accès HTTP réel à `/health`.
7. Accès HTTP réel à `/pair` (routage bout-en-bout, indépendant de MongoDB).
8. Route inconnue → 404 JSON propre.

Lancer les tests : `npm test` (ou `node --test tests/`).

**Variables d'environnement :**
- Obligatoire : aucune — l'API démarre toujours automatiquement avec des valeurs par défaut sûres.
- `PORT` — ne jamais définir manuellement sur Railway/Render/Katabump/TeoHéberge (l'hébergeur la fournit et route le trafic public dessus). Priorité absolue si présente.
- `API_PORT` — optionnel, repli utile uniquement sur VPS/Docker où vous choisissez vous-même le port exposé. Ignoré si `PORT` est défini.
- `API_INTERNAL_TOKEN` — optionnel, inchangé (protège `/session/status` et `/session/stop`).
- `MONGODB_URI` — optionnel pour l'API elle-même (elle démarre sans), mais requis pour que `POST /pair` fonctionne réellement (sinon réponse `503 NO_MONGODB`).

**URL publique de l'API — comment la retrouver par hébergeur :**
- **Railway** : Project → Settings → Networking → "Generate Domain" (ou domaine déjà généré) → `https://<nom>.up.railway.app`.
- **Render** : Dashboard du service Web → l'URL apparaît en haut, format `https://<nom>.onrender.com`.
- **Katabump** : panneau d'hébergement → section domaine/URL du serveur assignée à l'instance (format propre à Katabump, visible dans le panneau).
- **TeoHéberge** : panneau d'hébergement → URL/sous-domaine assigné à l'application Node.
- **VPS Linux / Docker** : pas d'URL générée automatiquement — c'est votre IP publique ou le nom de domaine que vous pointez vous-même dessus (`http://VOTRE_IP:PORT` ou domaine + reverse proxy Nginx/Caddy en 80/443).

**Valeur exacte pour `DIPPER_API_BASE_URL` sur Vercel :** l'URL complète (avec `https://`, sans slash final) de l'API telle qu'obtenue ci-dessus — ex. `https://votre-app.up.railway.app`. Si le site Vercel et l'API tournent sur des origines différentes (ce qui est le cas dès que le site est sur Vercel et l'API ailleurs), cette variable est obligatoire côté site ; jamais à deviner, toujours copier l'URL réellement affichée par le panneau de l'hébergeur choisi pour l'API.

---

## Architecture hybride de stockage des sessions — EN COURS

**Statut : 🟢 TERMINÉ — 5/5 phases, 41/41 tests PASS, aucune régression.**

Phase 5 (clôture) : revue de non-régression globale (41/41 tests, exécution finale propre). Ajout d'un `.gitignore` (absent du projet jusqu'ici) couvrant `sessions/` — le nouveau dossier de credentials WhatsApp introduit par ce chantier — et `auth_info_baileys/` (mono-session, préexistant). Aucun autre fichier touché.

Architecture finale : credentials WhatsApp en fichiers locaux (`sessions/<sessionId>/`, `utils/fileAuthState.js`), métadonnées dans l'index Mongo (`sessions_index`, `utils/sessionIndex.js`). `utils/mongoAuth.js` (ancien système) conservé tel quel mais plus utilisé par le code — traçabilité/rollback. Migration one-shot disponible (`npm run migrate:hybrid`). Les 3 canaux de pairing (WhatsApp, Telegram, Site Web) validés fonctionnels, sans modification d'aucune commande ni d'aucun projet externe.

Phase 4 (validation bout-en-bout) : les 3 canaux de pairing (WhatsApp `.pair`, Telegram via API, Site Web via API) confirmés fonctionnels avec l'architecture hybride — origin/owner correctement propagés et indexés, reconnexion, anti-abus et anti-doublon (ALREADY_ACTIVE) tous vérifiés. Aucun fichier modifié, uniquement de nouveaux tests (`tests/pairing-channels.test.js`).

Phase 3 (migration) : `scripts/migrate-sessions-to-hybrid.js` (`npm run migrate:hybrid`) convertit les sessions Mongo existantes (ancien `mongoAuth.js`) vers l'architecture hybride — one-shot, idempotent, ne supprime jamais les collections Mongo `auth_*` d'origine (rollback possible). Supporte `--dry-run` et `--force`. Bug corrigé pendant les tests : `saveCreds()` natif de Baileys nécessite de muter `state.creds` en place plutôt que de réassigner la propriété.

Phase 2 (intégration) : `utils/sessionManager.js` utilise désormais `fileAuthState.js`/`sessionIndex.js` pour toutes les nouvelles sessions et au redémarrage (`loadAllSessions()` pilotée par l'index Mongo). `utils/pairingService.js` et `api/server.js` acceptent des métadonnées `owner`/`origin` optionnelles et rétrocompatibles. Aucune commande modifiée, aucune signature publique cassée. Nouveau : `tests/session-manager.test.js`, `tests/helpers/fakeBaileys.js`.

Nouveaux fichiers (Phase 1, aucun fichier existant modifié) :
- `utils/fileAuthState.js` — fournisseur fichiers pour les credentials WhatsApp multi-session (`sessions/<sessionId>/`), basé sur `useMultiFileAuthState` natif de Baileys.
- `utils/sessionIndex.js` — index Mongo des métadonnées de session (`sessions_index`), sans aucun credential WhatsApp.
- `tests/file-auth-state.test.js`, `tests/session-index.test.js`, `tests/helpers/fakeMongoClient.js` — tests réels de ces deux modules.

Ces deux modules sont désormais utilisés en production par `sessionManager.js` (Phase 2) — le Pairing WhatsApp/Telegram/Site Web fonctionne à l'identique côté interfaces publiques, mais les credentials WhatsApp sont maintenant stockés en fichiers locaux (`sessions/<sessionId>/`) et MongoDB ne stocke plus que les métadonnées (`sessions_index`). Détail complet, choix techniques et résultats de tests dans `PROGRESS.md`.
