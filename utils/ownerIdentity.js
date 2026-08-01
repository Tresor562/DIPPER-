'use strict';
/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║   𝐃𝐈𝐏𝐏𝐄𝐑 — Identité dynamique du Owner (Phase 3)            ║
 * ║   utils/ownerIdentity.js                                      ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * RÔLE :
 *   Retourne le nom du compte WhatsApp RÉELLEMENT connecté sur la
 *   session en cours (sock.user.name, rempli par Baileys une fois la
 *   connexion établie), au lieu de la variable .env OWNER_NAME
 *   (statique, figée au démarrage du process, jamais réévaluée).
 *
 *   Une seule fonction, utilisée par les 3 endroits qui affichaient
 *   auparavant config.ownerName : menu.js, botstatus.js, ping.js.
 *   Aucune logique dupliquée entre ces 3 fichiers.
 *
 * ISOLATION MULTI-SESSION :
 *   Le nom est lu depuis LE `sock` de la session en cours d'exécution
 *   (passé en paramètre par l'appelant), jamais depuis une variable
 *   globale — deux sessions simultanées connectées à deux comptes
 *   WhatsApp différents affichent donc chacune leur propre nom, sans
 *   fuite entre elles.
 *
 * NE CHANGE PAS :
 *   config.ownerNumber (numéro Owner, utilisé pour les permissions)
 *   reste inchangé et n'est pas concerné par ce module.
 */

/**
 * @param {object} sock Le socket Baileys de LA session en cours (jamais
 *   une référence globale — voir note d'isolation ci-dessus).
 * @param {string} [fallback] Valeur à retourner si le nom n'est pas
 *   encore disponible (ex: juste après un pairing, avant que WhatsApp
 *   n'ait renvoyé le push name du compte) — filet de sécurité pour ne
 *   jamais afficher une chaîne vide.
 * @returns {string}
 */
function getConnectedOwnerName(sock, fallback) {
  const name = sock?.user?.name;
  if (typeof name === 'string' && name.trim()) return name.trim();
  return fallback;
}

module.exports = { getConnectedOwnerName };
