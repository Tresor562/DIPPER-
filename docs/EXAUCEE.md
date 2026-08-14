# Exaucée 🌸 — Runtime intelligent de THE BIG DIPPER

## État

Exaucée est intégrée au pipeline de THE BIG DIPPER derrière un feature flag. Elle est **désactivée par défaut** et n'intercepte jamais les commandes classiques. L'installation du hook se fait au `prestart` via `scripts/install-exaucee.js`, de façon idempotente et fail-open.

## Activation

Définir :

```env
EXAUCEE_ENABLED=true
```

Au moins un moteur IA gratuit/local doit être disponible pour obtenir des réponses génératives :

```env
# Local, recommandé si disponible
EXAUCEE_LOCAL_AI=true
EXAUCEE_LOCAL_BASE_URL=http://127.0.0.1:11434
EXAUCEE_LOCAL_MODEL=qwen3:8b

# Fournisseurs gratuits optionnels — ne jamais committer les valeurs
GROQ_API_KEY=
GEMINI_API_KEY=
OPENROUTER_API_KEY=
```

Sans fournisseur disponible, Exaucée reste sûre et répond avec un message de dégradation contrôlée au lieu de faire échouer le bot.

## Routage social

- En privé, Exaucée peut répondre aux messages ordinaires lorsque le compte humain connecté n'a pas pris la conversation en main.
- Un message envoyé manuellement depuis le compte connecté active une fenêtre de priorité humaine de 10 minutes pour ce chat privé.
- En groupe, Exaucée reste silencieuse dans les conversations humaines ordinaires.
- Elle répond quand son nom est utilisé, quand elle est mentionnée (formats LID et numéro gérés), ou quand quelqu'un répond à l'un de ses messages récents.
- Les messages de commande classiques restent dans le pipeline historique du handler.

## Mémoire et isolation

La mémoire est séparée par session, chat et utilisateur. Les tâches, commandes dynamiques, parties et journaux sont également isolés par session sous `data/exaucee/`.

Exaucée refuse de persister les formulations qui ressemblent à des tokens, mots de passe, clés API, cookies, credentials ou secrets. Les sorties IA passent également par une redaction textuelle de défense en profondeur.

## Scheduler

Les rappels sont persistants. Le scheduler :

- recharge les tâches après redémarrage ;
- exécute les tâches arrivées à échéance ;
- marque les succès ;
- retente les échecs avec backoff exponentiel ;
- passe définitivement une tâche en `failed` après le nombre maximal de tentatives.

Exemple naturel : `Exaucée, dans 10 minutes rappelle-moi de vérifier le déploiement.`

## Commandes dynamiques

Un owner/supreme owner/admin peut créer une réponse dynamique avec une phrase du type :

`Exaucée, crée une commande hello qui répond Salut tout le monde !`

En groupe, la commande créée est limitée à ce groupe. Elle survit aux redémarrages. Une réponse contenant des données sensibles est refusée.

## Game Master

Exaucée embarque un Game Master persistant :

- Quiz Anime ou Culture générale ;
- nombre de manches configurable ;
- scores multi-joueurs ;
- classement ;
- arrêt de partie ;
- Action ou Vérité avec historique borné et prompts sûrs ;
- reprise de l'état après redémarrage.

Exemples :

- `Exaucée, lance un quiz anime de 5 questions.`
- `Exaucée, classement.`
- `Exaucée, lance Action ou Vérité.`

Répondre directement à la question envoyée par Exaucée permet de poursuivre naturellement la partie dans un groupe.

## Permissions des outils

`CommandBridge` ne remplace pas l'autorité de THE BIG DIPPER. Il réutilise `utils/accessControl.js` et les métadonnées des commandes : owner, sudo, premium, VIP, admin, groupe uniquement, privé uniquement et bot administrateur.

Les actions marquées destructives exigent une confirmation explicite dans le contexte d'exécution.

## Tests

Les tests dédiés sont :

```bash
node --test tests/exaucee-core.test.js tests/exaucee-runtime.test.js
```

Le workflow `Validate commands` contient aussi un job `Exaucee runtime` qui :

1. installe les dépendances de production ;
2. exécute les tests Exaucée ;
3. installe réellement le hook dans `handler.js` ;
4. vérifie la syntaxe du handler final ;
5. relance l'installateur pour vérifier son idempotence ;
6. vérifie la syntaxe des modules critiques.

## Principe de sécurité de déploiement

`main` ne doit pas recevoir Exaucée tant que la branche n'a pas été relue et validée. L'activation en production reste indépendante de la fusion grâce à `EXAUCEE_ENABLED`.
