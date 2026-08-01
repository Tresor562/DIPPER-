# Chantier en attente — Message Store léger

## Statut : non démarré

## Origine
Découvert pendant l'audit de `commands/group_management/clean.js` (catégorie
`group_management`) : la commande dépend de `require('../../index').store`,
qui n'existe pas — `index.js` n'exporte rien et aucun cache de messages
n'existe nulle part dans le projet. `.clean` répond donc systématiquement
« aucun message trouvé », dans tous les cas d'usage, depuis toujours.

## Décision (validée)
- Ne pas transformer `.clean` en doublon de `.delete`
- Ne pas supprimer `.clean`
- Construire un vrai Message Store, réutilisable par tout le projet, puis
  revenir finaliser `.clean` une fois cette infrastructure prête

## Contraintes de conception (validées)
- **Léger** : historique limité par groupe (fenêtre glissante, pas un
  historique complet illimité)
- **Nettoyage automatique** : pas d'accumulation indéfinie
- **Persistance non obligatoire** : peut vivre uniquement en mémoire,
  perdu au redémarrage si nécessaire — pas une exigence de conception
- **Réutilisable** : conçu comme une brique commune (`utils/`), pas
  spécifique à `.clean`, pour bénéficier à d'éventuelles futures
  fonctionnalités ayant besoin d'un historique de messages

## Fichiers concernés (à ce stade, non modifiés)
- `commands/group_management/clean.js` — **en attente d'infrastructure,
  intentionnellement non modifié pour l'instant**
- `index.js` — devra probablement exposer/alimenter le futur store
- `handler.js` — point d'écoute naturel des messages entrants
  (`messages.upsert` côté Baileys) pour alimenter le store

## Prochaine étape
Concevoir et implémenter le Message Store dans `utils/`, avec sa propre
analyse de dépendances/risques avant toute modification de `handler.js`/
`index.js`, selon la méthodologie habituelle. Revenir ensuite finaliser
`clean.js` pour qu'il consomme réellement ce store.
