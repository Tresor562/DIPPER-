# 🛠️ DARK BOT — TOOLS AUDIT COMPLET

## ✅ RÉSUMÉ DU CONTRÔLE

| Catégorie        | Fichiers | Statut       |
|------------------|----------|--------------|
| Commandes TOOLS  | 183      | ✅ 0 erreur  |
| Nouvelles cmds   | 16       | ✅ Créées    |
| Bugs corrigés    | 4        | ✅ Fixés     |

---

## 📋 COMMANDES TOOLS — ÉTAT FINAL

### ✅ Existantes & corrigées

| Commande     | Fichier                          | Fix appliqué |
|--------------|----------------------------------|--------------|
| .calculate   | group_guardians/calc.js          | Aucun bug    |
| .fancy       | group_guardians/fancy.js         | Aucun bug    |
| .getpp       | general_tools/getpp.js           | Footer hardcodé → phrases.footer() |
| .qrcode      | general_tools/qr.js              | Aucun bug    |
| .say         | general_tools/tts.js             | Aucun bug    |
| .ssweb       | general_tools/ssweb.js           | API cascade + screenshotApi.js |
| .sticker     | general_tools/sticker.js         | Aucun bug    |
| .take        | general_tools/usurper.js         | Aucun bug    |
| .tourl       | general_tools/url.js             | Aucun bug    |

### ✅ Nouvelles commandes créées

| Commande      | Fichier                           | Description                          |
|---------------|-----------------------------------|--------------------------------------|
| .browse       | general_tools/browse.js           | Recherche web DuckDuckGo JSON        |
| .device       | general_tools/device.js           | Détection appareil via JID Baileys   |
| .emojimix     | general_tools/emojimix.js         | Google Emoji Kitchen (cascade URLs)  |
| .filtervcf    | general_tools/filtervcf.js        | Tri/nettoyage fichiers VCF           |
| .fliptext     | general_tools/fliptext.js         | Texte retourné (upside-down)         |
| .genpass      | general_tools/genpass.js          | Générateur mots de passe (crypto)    |
| .getabout     | general_tools/getabout.js         | Bio WhatsApp via Baileys             |
| .gsmarena     | general_tools/gsmarena.js         | Specs téléphone (cascade 2 APIs)     |
| .obfuscate    | general_tools/obfuscate.js        | Obfuscation JS [👑 OWNER ONLY]       |
| .runeval      | general_tools/runeval.js          | Exec JS sécurisé [👑 OWNER ONLY]     |
| .sswebpc      | general_tools/sswebpc.js          | Screenshot version bureau            |
| .sswebtab     | general_tools/sswebpc.js          | Screenshot version tablette          |
| .texttopdf    | general_tools/texttopdf.js        | Texte → PDF (pdfkit + fallback API)  |
| .tinyurl      | general_tools/tinyurl.js          | Raccourcisseur URL (cascade 3 APIs)  |
| .toimage      | general_tools/toimage.js          | Sticker → Image (WebP → JPEG)        |
| .vcc          | general_tools/vcc.js              | Cartes test Luhn [👑 OWNER ONLY]     |

### 🔧 Autres bugs corrigés (projet global)

| Fichier                           | Bug                                           |
|-----------------------------------|-----------------------------------------------|
| general_tools/menu.js             | Guillemet non fermé ligne 266 + `.jpgi` typos |
| group_management/add.js           | Virgule manquante après `groupOnly: true`     |

---

## 🔒 COMMANDES OWNER ONLY

- `.runeval` — exécution JS avec timeout 5s et blacklist
- `.obfuscate` — obfuscation JS (local ou API)
- `.vcc` — générateur cartes test (algorithme Luhn)

---

## 📦 NOUVELLES DÉPENDANCES NPM

```bash
npm install pdfkit javascript-obfuscator
```

- `pdfkit` → .texttopdf (génération PDF locale, sans réseau)
- `javascript-obfuscator` → .obfuscate (optionnel, fallback API si absent)

---

## 🗂️ NOUVEAU FICHIER UTILITAIRE

`utils/screenshotApi.js` — Cascade 3 APIs screenshots :
1. **ScreenshotMachine** (gratuit, JSON, supporte mobile/pc/tablet)
2. **Thum.io** (CDN direct, desktop)
3. **S-Shot.ru** (paramétrable par largeur)

Utilisé par `.ssweb`, `.sswebpc`, `.sswebtab`

---

## ⚡ TOUTES LES APIs UTILISÉES (gratuites, sans clé)

| Commande     | API                              |
|--------------|----------------------------------|
| .browse      | api.duckduckgo.com               |
| .emojimix    | gstatic.com (Google Emoji Kitchen)|
| .gsmarena    | gsmarena-api.vercel.app          |
| .ssweb/pc/tab| screenshotmachine + thumio + sshot|
| .texttopdf   | pdfkit local + html2pdf.app      |
| .tinyurl     | tinyurl.com + is.gd + v.gd       |
