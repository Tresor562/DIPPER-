# Exaucée Dynamic Command Builder

Le Builder V3 transforme des instructions naturelles en workflows déclaratifs validés.

Types supportés :
- `reply`
- `random_reply`
- `sequence`

Variables sûres disponibles à l'exécution : `{user}`, `{userId}`, `{chatId}`, `{args}`, `{arg1}`, `{arg2}`, `{arg3}`.

Contraintes principales : pas d'`eval`, pas de JavaScript arbitraire, maximum 12 étapes, délais bornés à 10 secondes, détection des collisions avec les commandes natives et aliases, historique de versions avec rollback côté registre.
