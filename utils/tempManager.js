/**
 * Centralized Temp Directory Management
 * Ensures all temp files go to a single directory and sets environment variables
 * for libraries like Baileys and ffmpeg to use the same directory
 *
 * [PHASE 2 — SUITE] Isolation par session : `temp/` était un seul dossier
 * partagé par TOUTES les sessions (téléchargements/conversions média en
 * cours pouvaient se faire écraser ou supprimer par le nettoyage d'une
 * autre session). getTempDir()/createTempFilePath() résolvent maintenant
 * vers un sous-dossier `temp/<sessionId>/` — un seul point de changement,
 * les 9 fichiers qui consomment déjà getTempDir()/deleteTempFile() sont
 * isolés automatiquement, sans y toucher.
 *
 * LIMITE CONNUE ET ASSUMÉE : les variables d'environnement TMPDIR/TMP/TEMP
 * sont fixées UNE SEULE FOIS au démarrage du processus (initializeTempSystem),
 * avant que les sessions n'existent — elles ne peuvent pas être re-scopées
 * par session sans risquer une vraie race condition (deux sessions actives
 * en même temps dans le même processus se marcheraient dessus si on
 * réassignait process.env à la volée). Elles pointent donc vers la racine
 * `temp/` commune ; seules les bibliothèques externes qui lisent cette
 * variable directement (hors de notre propre code) restent sur une base
 * partagée — tout ce qui passe par getTempDir()/createTempFilePath() (notre
 * code) est, lui, pleinement isolé par session.
 */

const fs = require('fs');
const path = require('path');
const sessionContext = require('./sessionContext');

// Get the project root directory
const PROJECT_ROOT = process.cwd();

// Racine commune (limite connue ci-dessus) ; les sous-dossiers par session
// sont ce que retourne réellement getTempDir().
const TEMP_DIR = path.join(PROJECT_ROOT, 'temp');

/**
 * Initialize temp directory system
 * MUST be called before any libraries that use temp directories are loaded
 */
function initializeTempSystem() {
  // Set environment variables BEFORE any libraries load
  // This ensures Baileys, ffmpeg, and other libraries use our temp directory
  const tempDirAbsolute = path.resolve(TEMP_DIR);
  
  // Set all common temp environment variables
  process.env.TMPDIR = tempDirAbsolute;
  process.env.TMP = tempDirAbsolute;
  process.env.TEMP = tempDirAbsolute;
  
  // Windows-specific
  if (process.platform === 'win32') {
    process.env.TEMP = tempDirAbsolute;
    process.env.TMP = tempDirAbsolute;
  }
  
  // Ensure temp directory exists
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }
  
  return TEMP_DIR;
}

/**
 * Get the temp directory for the CURRENT session (sous-dossier de TEMP_DIR).
 * Isolé par session — voir note en tête de fichier.
 */
function getTempDir() {
  const dir = path.join(TEMP_DIR, sessionContext.getCurrentSessionId());
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Create a safe temp file path
 * @param {string} prefix - File prefix
 * @param {string} extension - File extension (without dot)
 * @returns {string} Full path to temp file
 */
function createTempFilePath(prefix = 'temp', extension = 'tmp') {
  const tempDir = getTempDir();
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2);
  const filename = `${prefix}_${timestamp}_${random}.${extension}`;
  return path.join(tempDir, filename);
}

/**
 * Safely delete a temp file
 * @param {string} filePath - Path to file to delete
 * @returns {boolean} True if deleted successfully, false otherwise
 */
function deleteTempFile(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) {
      // Only delete files inside the shared temp/ tree for safety
      // (ancêtre commun à tous les sous-dossiers de session)
      const resolvedPath = path.resolve(filePath);
      const tempDirResolved = path.resolve(TEMP_DIR);
      
      if (resolvedPath.startsWith(tempDirResolved)) {
        fs.unlinkSync(filePath);
        return true;
      } else {
        console.warn(`Attempted to delete file outside temp directory: ${filePath}`);
        return false;
      }
    }
    return false;
  } catch (error) {
    console.error(`Error deleting temp file ${filePath}:`, error.message);
    return false;
  }
}

/**
 * Delete multiple temp files
 * @param {string[]} filePaths - Array of file paths to delete
 */
function deleteTempFiles(filePaths) {
  if (!Array.isArray(filePaths)) return;
  
  filePaths.forEach(filePath => {
    deleteTempFile(filePath);
  });
}

/**
 * Parcourt tous les sous-dossiers de session sous temp/ et appelle
 * `fn(sessionDirPath, sessionId)` pour chacun. Utilisé par le nettoyage
 * périodique (ici et dans utils/memoryGuard.js) qui doit couvrir TOUTES
 * les sessions, pas seulement celle en cours (il n'y a pas de session
 * "courante" dans un timer qui tourne hors d'un message entrant).
 */
function forEachSessionTempDir(fn) {
  try {
    if (!fs.existsSync(TEMP_DIR)) return;
    for (const entry of fs.readdirSync(TEMP_DIR, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue; // ignore d'éventuels résidus legacy à plat
      try { fn(path.join(TEMP_DIR, entry.name), entry.name); } catch (_) {}
    }
  } catch (_) {}
}

module.exports = {
  initializeTempSystem,
  getTempDir,
  createTempFilePath,
  deleteTempFile,
  deleteTempFiles,
  forEachSessionTempDir,
  TEMP_DIR
};


/**
 * [PERF] Purge automatique des fichiers temporaires expirés
 * Lance une purge toutes les 30 minutes
 * Supprime les fichiers de plus de MAX_AGE_MS (1 heure par défaut)
 * Parcourt maintenant CHAQUE sous-dossier de session (avant : fichiers
 * à plat directement sous temp/ — supposait un seul espace partagé).
 */
const MAX_TEMP_AGE_MS = 60 * 60 * 1000; // 1 heure

function _purgeOldTempFiles() {
  let totalDeleted = 0;
  forEachSessionTempDir((sessionDir) => {
    const now = Date.now();
    const files = fs.readdirSync(sessionDir);
    for (const file of files) {
      try {
        const filePath = path.join(sessionDir, file);
        const stat = fs.statSync(filePath);
        if (stat.isFile() && (now - stat.mtimeMs) > MAX_TEMP_AGE_MS) {
          fs.unlinkSync(filePath);
          totalDeleted++;
        }
      } catch (_) {}
    }
  });
  if (totalDeleted > 0) {
    console.log(`[tempManager] 🧹 Purge automatique : ${totalDeleted} fichier(s) supprimé(s)`);
  }
}

// Lancer la purge au démarrage + toutes les 30 minutes
_purgeOldTempFiles();
const _tempPurgeInterval = setInterval(_purgeOldTempFiles, 30 * 60 * 1000);
if (_tempPurgeInterval.unref) _tempPurgeInterval.unref();
