# 🚀 THE BIG DIPPER — Déploiement serveur / VPS

DIPPER est autonome : **le bot WhatsApp, le moteur multisession, l'API de pairing et le site de connexion tournent dans le même processus Node.js**.

Il n'y a plus besoin d'un site Vercel séparé ni d'une URL `DIPPER_API_BASE_URL`.

## Prérequis

- Node.js 20 recommandé (18+ supporté par `package.json`)
- npm
- MongoDB accessible depuis le serveur
- Un port HTTP ouvert ou exposé derrière un reverse proxy
- Un stockage persistant pour les credentials WhatsApp

## Variables d'environnement

| Variable | Description | Exemple |
|---|---|---|
| `MONGODB_URI` | Base MongoDB utilisée par le mode multisession et l'index des sessions | `mongodb+srv://...` |
| `PHONE_NUMBER` | Numéro du propriétaire principal, indicatif inclus | `22990000000` |
| `OWNER_NAME` | Nom affiché du propriétaire | `Trésor` |
| `PREFIX` | Préfixe des commandes | `.` |
| `API_INTERNAL_TOKEN` | Protège les routes internes de gestion de session | chaîne aléatoire longue |
| `PUBLIC_MODE` | Active/désactive le mode public | `true` |
| `PORT` | Port imposé par l'hébergeur/panel, s'il existe | `3001` |
| `API_PORT` | Port manuel de repli si `PORT` n'est pas défini | `3001` |

Ne committe jamais les secrets réels dans le dépôt.

## Installation

```bash
git clone https://github.com/Tresor562/DIPPER-.git
cd DIPPER-
npm install --omit=dev --no-audit --no-fund
npm start
```

Le processus démarre automatiquement :

1. le bot WhatsApp ;
2. les sessions multisession persistantes ;
3. le serveur HTTP de pairing ;
4. le site web présent dans `public/`.

## Pairing

Le frontend et l'API utilisent **la même origine**.

- Site : `http://IP_DU_SERVEUR:3001/`
- Santé : `http://IP_DU_SERVEUR:3001/health`
- Pairing : `POST /pair`

Le navigateur appelle directement `/pair` sur le serveur DIPPER. Il n'y a aucun backend web intermédiaire et aucune dépendance à Vercel.

Pour un domaine HTTPS, place simplement Nginx, Caddy ou le proxy de ton panel devant le port de DIPPER. Le chemin `/` et `/pair` doivent être routés vers **le même processus**.

## Exemple PM2

```bash
npm install -g pm2
PORT=3001 pm2 start index.js --name dipper --node-args="--expose-gc"
pm2 save
```

Avec un fichier `.env`, les variables sont chargées par le projet au démarrage.

## Déployer / mettre à jour depuis le site

Le panneau admin est intégré au même site que le pairing, mais il reste caché
pour les visiteurs normaux.

Ouvre :

```text
https://VOTRE-DOMAINE/?admin=1
```

Configure d'abord sur le serveur :

```env
DEPLOY_ADMIN_TOKEN=une-cle-longue-et-aleatoire
DIPPER_DEPLOY_WORKDIR=/chemin/vers/DIPPER-
DIPPER_DEPLOY_COMMAND=git fetch origin main && git reset --hard origin/main && npm install --omit=dev --no-audit --no-fund && pm2 restart dipper --update-env
```

Le navigateur n'envoie jamais de commande shell. Il envoie uniquement le
token admin à `POST /admin/deploy`. La commande réellement exécutée vient
exclusivement de `DIPPER_DEPLOY_COMMAND`, configurée côté serveur.

Routes :

- `POST /admin/deploy` : lance le déploiement ;
- `GET /admin/deploy/status` : retourne état et journal court ;
- les deux exigent `Authorization: Bearer <DEPLOY_ADMIN_TOKEN>`.

Un seul déploiement peut tourner à la fois.

### Si le serveur utilise THE_BIG_DIPPER comme wrapper

Le processus WhatsApp tourne dans `THE_BIG_DIPPER/bot`. Dans ce cas, le
plus propre est de faire travailler la commande depuis la racine du wrapper :

```env
DIPPER_DEPLOY_WORKDIR=/chemin/vers/THE_BIG_DIPPER
DIPPER_DEPLOY_COMMAND=git fetch origin main && git reset --hard origin/main && node ensure-bot-submodule.js && cd bot && npm install --omit=dev --no-audit --no-fund && pm2 restart dipper --update-env
```

Ainsi le serveur récupère d'abord la version de THE_BIG_DIPPER, puis la
révision DIPPER épinglée par le wrapper, avant de redémarrer le processus.

## Vérifications après déploiement

```bash
curl http://127.0.0.1:3001/health
```

Réponse attendue :

```json
{"status":"ok"}
```

Puis ouvre la racine du serveur dans un navigateur, saisis un numéro WhatsApp et vérifie que le code de pairing est généré. Le code est créé par `utils/pairingService.js`, qui réutilise directement le moteur de sessions du bot.

## Persistance

Les credentials WhatsApp doivent rester sur un disque persistant. MongoDB conserve l'index et les métadonnées des sessions ; le serveur recharge les sessions connues au redémarrage.

Évite de lancer simultanément deux instances qui possèdent la même session WhatsApp : WhatsApp peut remplacer la connexion précédente (`connectionReplaced`).

## Mise à jour

Pour une mise à jour CORE, valide d'abord la candidate puis redémarre proprement le processus :

```bash
git pull
npm install --omit=dev --no-audit --no-fund
npm test
pm2 restart dipper --update-env
```

Le pairing web reste embarqué dans le même dépôt et suit donc automatiquement la même version que le bot.
