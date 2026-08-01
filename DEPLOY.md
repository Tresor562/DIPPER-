# 🚀 THE BIG DIPPER — Guide de déploiement

> Calqué sur la méthode d'INCONNU BOY (Render, Railway, Heroku) — ces
> plateformes gèrent `PORT` et le domaine public automatiquement,
> contrairement à un panel type Pterodactyl (Katabump). `api/server.js`
> lit déjà `process.env.PORT` en priorité et écoute sur `0.0.0.0`, donc
> aucune adaptation de code n'est nécessaire pour ces trois services.

## Prérequis (toutes plateformes)

1. **URI MongoDB** — cluster gratuit sur [MongoDB Atlas](https://www.mongodb.com/cloud/atlas/register)
2. **Ton numéro WhatsApp**, avec indicatif, sans `+` (ex: `22990000000`)
3. Node.js 18+ (uniquement pour tester en local)

## Variables d'environnement

| Variable | Description | Exemple |
|---|---|---|
| `MONGODB_URI` | Connexion Mongo (sessions + métadonnées) | `mongodb+srv://user:pass@cluster...` |
| `PHONE_NUMBER` | Ton numéro WhatsApp (propriétaire) | `22990000000` |
| `OWNER_NAME` | Nom affiché du propriétaire | `Trésor` |
| `PREFIX` | Préfixe des commandes | `.` |
| `API_INTERNAL_TOKEN` | Protège `/session/status` et `/session/stop` (recommandé) | chaîne aléatoire longue |
| `PUBLIC_MODE` | `true`/`false` | `true` |

⚠️ Ne mets **jamais** de valeur réelle pour ces variables dans un fichier committé — uniquement dans le panel de la plateforme (Render/Railway/Heroku ont chacun un onglet "Environment Variables"/"Config Vars").

---

## 🟣 Déployer sur Render (recommandé — gratuit)

1. Pousse ce projet sur GitHub (dépôt personnel).
2. [render.com](https://render.com) → **New** → **Web Service**.
3. Connecte le repo.
4. Configuration :
   ```
   Environment:   Node
   Build Command: npm install
   Start Command: npm start
   ```
5. Ajoute les variables d'environnement ci-dessus.
6. **Deploy Web Service**.
7. Une fois déployé, le site ET l'API sont sur la même adresse :
   ```
   https://ton-app.onrender.com/
   ```
   Le bouton "Generate Pairing Code" fonctionne directement, sans aucune config d'URL — c'est le même serveur qui sert la page et répond à `/pair`.

⚠️ **Palier gratuit Render** : le service s'endort après 15 min d'inactivité (donc la session WhatsApp aussi). Utilise [UptimeRobot](https://uptimerobot.com) pour le garder actif si besoin d'une présence continue.

---

## 🚂 Déployer sur Railway (facile — crédit gratuit)

1. Pousse le projet sur GitHub.
2. [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub**.
3. Sélectionne le repo — Railway détecte Node.js automatiquement.
4. Onglet **Variables** → ajoute les variables ci-dessus.
5. Onglet **Settings** → **Domains** → **Generate Domain**.
6. Visite :
   ```
   https://ton-app.up.railway.app/
   ```

### Avantages Railway
- Pas de mise en veille sur le palier gratuit (dans la limite du crédit)
- Redémarrage automatique en cas de crash
- Logs intégrés et lisibles

---

## 🟣 Déployer sur Heroku

```bash
heroku login
git clone <ton-repo>
cd the-big-dipper
heroku create the-big-dipper-tonpseudo

heroku config:set MONGODB_URI="mongodb+srv://..."
heroku config:set PHONE_NUMBER="22990000000"
heroku config:set OWNER_NAME="Trésor"
heroku config:set PREFIX="."

git push heroku main
heroku open
```
Ou directement : `https://the-big-dipper-tonpseudo.herokuapp.com/`

⚠️ Le `Procfile` doit déclarer un dyno `web:` (pas `worker:`) — sinon Heroku ne route jamais le trafic HTTP public vers le process, même si tout le reste est correct. C'est déjà corrigé dans ce projet (`web: npm start`).

---

## Pourquoi c'est plus simple ici que sur Katabump

| | Render / Railway / Heroku | Katabump (Pterodactyl) |
|---|---|---|
| Domaine public | Fourni automatiquement, HTTPS inclus | IP:port brut, HTTP seulement |
| Variable de port | `PORT` standard, lue automatiquement | Souvent `SERVER_PORT`, pas toujours `PORT` |
| Dyno/process web | Détecté nativement | Dépend de l'egg utilisé |

Le site et l'API pairing étant fusionnés dans ce projet (voir `api/staticFiles.js`), une fois déployé sur l'une de ces trois plateformes, l'URL racine suffit — pas de `DIPPER_API_BASE_URL` à configurer, pas de souci HTTPS/HTTP mixte.
