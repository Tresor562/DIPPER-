/**
 * ╔══════════════════════════════════════════════════╗
 * ║         FANCY COMMAND — 𝐃𝐈𝐏𝐏𝐄𝐑 — ʟ'ᴏᴍʙʀᴇ ɪɴᴄᴀʀɴᴇ́         ║
 * ║     40+ styles de police Unicode & ésotériques   ║
 * ╚══════════════════════════════════════════════════╝
 */
const config = require('../../config.js');
const prefix = config.prefix || '.';

// ═══════════════════════════════════════════════════════════════
//                    BIBLIOTHÈQUE DE STYLES
// ═══════════════════════════════════════════════════════════════

const FONT_STYLES = {

  // ┌──────────────────────────────────────────────────────────┐
  // │                     CLASSIQUES                           │
  // └──────────────────────────────────────────────────────────┘

  smallcaps: {
    label: 'ꜱᴍᴀʟʟ ᴄᴀᴘꜱ',    category: 'Classiques',
    from: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ',
    to:   'ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘǫʀꜱᴛᴜᴠᴡxʏᴢᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘǫʀꜱᴛᴜᴠᴡxʏᴢ',
  },

  bold: {
    label: '𝐁𝐨𝐥𝐝',             category: 'Classiques',
    from: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
    to:   '𝐚𝐛𝐜𝐝𝐞𝐟𝐠𝐡𝐢𝐣𝐤𝐥𝐦𝐧𝐨𝐩𝐪𝐫𝐬𝐭𝐮𝐯𝐰𝐱𝐲𝐳𝐀𝐁𝐂𝐃𝐄𝐅𝐆𝐇𝐈𝐉𝐊𝐋𝐌𝐍𝐎𝐏𝐐𝐑𝐒𝐓𝐔𝐕𝐖𝐗𝐘𝐙𝟎𝟏𝟐𝟑𝟒𝟓𝟔𝟕𝟖𝟗',
  },

  italic: {
    label: '𝘐𝘵𝘢𝘭𝘪𝘤',           category: 'Classiques',
    from: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ',
    to:   '𝘢𝘣𝘤𝘥𝘦𝘧𝘨𝘩𝘪𝘫𝘬𝘭𝘮𝘯𝘰𝘱𝘲𝘳𝘴𝘵𝘶𝘷𝘸𝘹𝘺𝘻𝘈𝘉𝘊𝘋𝘌𝘍𝘎𝘏𝘐𝘑𝘒𝘓𝘔𝘕𝘖𝘗𝘘𝘙𝘚𝘛𝘜𝘝𝘞𝘟𝘠𝘡',
  },

  bolditalic: {
    label: '𝙱𝙤𝙡𝙙 𝙸𝙩𝙖𝙡𝙞𝙘',      category: 'Classiques',
    from: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ',
    to:   '𝙖𝙗𝙘𝙙𝙚𝙛𝙜𝙝𝙞𝙟𝙠𝙡𝙢𝙣𝙤𝙥𝙦𝙧𝙨𝙩𝙪𝙫𝙬𝙭𝙮𝙯𝘼𝘽𝘾𝘿𝙀𝙁𝙂𝙃𝙄𝙅𝙆𝙇𝙈𝙉𝙊𝙋𝙌𝙍𝙎𝙏𝙐𝙑𝙒𝙓𝙔𝙕',
  },

  mono: {
    label: '𝙼𝚘𝚗𝚘𝚜𝚙𝚊𝚌𝚎',        category: 'Classiques',
    from: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
    to:   '𝚊𝚋𝚌𝚍𝚎𝚏𝚐𝚑𝚒𝚓𝚔𝚕𝚖𝚗𝚘𝚙𝚚𝚛𝚜𝚝𝚞𝚟𝚠𝚡𝚢𝚣𝙰𝙱𝙲𝙳𝙴𝙵𝙶𝙷𝙸𝙹𝙺𝙻𝙼𝙽𝙾𝙿𝚀𝚁𝚂𝚃𝚄𝚅𝚆𝚇𝚈𝚉𝟶𝟷𝟸𝟹𝟺𝟻𝟼𝟽𝟾𝟿',
  },

  wide: {
    label: 'Ｗｉｄｅ',             category: 'Classiques',
    from: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ',
    to:   'ａｂｃｄｅｆｇｈｉｊｋｌｍｎｏｐｑｒｓｔｕｖｗｘｙｚＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺ０１２３４５６７８９　',
  },

  // ┌──────────────────────────────────────────────────────────┐
  // │                     SANS-SERIF                           │
  // └──────────────────────────────────────────────────────────┘

  sans: {
    label: '𝖲𝖺𝗇𝗌 𝖲𝖾𝗋𝗂𝖿',        category: 'Sans-Serif',
    from: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
    to:   '𝖺𝖻𝖼𝖽𝖾𝖿𝗀𝗁𝗂𝗃𝗄𝗅𝗆𝗇𝗈𝗉𝗊𝗋𝗌𝗍𝗎𝗏𝗐𝗑𝗒𝗓𝖠𝖡𝖢𝖣𝖤𝖥𝖦𝖧𝖨𝖩𝖪𝖫𝖬𝖭𝖮𝖯𝖰𝖱𝖲𝖳𝖴𝖵𝖶𝖷𝖸𝖹𝟢𝟣𝟤𝟥𝟦𝟧𝟨𝟩𝟪𝟫',
  },

  sansbold: {
    label: '𝗦𝗮𝗻𝘀 𝗕𝗼𝗹𝗱',          category: 'Sans-Serif',
    from: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
    to:   '𝗮𝗯𝗰𝗱𝗲𝗳𝗴𝗵𝗶𝗷𝗸𝗹𝗺𝗻𝗼𝗽𝗾𝗿𝘀𝘁𝘂𝘃𝘄𝘅𝘆𝘇𝗔𝗕𝗖𝗗𝗘𝗙𝗚𝗛𝗜𝗝𝗞𝗟𝗠𝗡𝗢𝗣𝗤𝗥𝗦𝗧𝗨𝗩𝗪𝗫𝗬𝗭𝟬𝟭𝟮𝟯𝟰𝟱𝟲𝟳𝟴𝟵',
  },

  sansitalic: {
    label: '𝘚𝘢𝘯𝘴 𝘐𝘵𝘢𝘭𝘪𝘤',       category: 'Sans-Serif',
    from: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ',
    to:   '𝘢𝘣𝘤𝘥𝘦𝘧𝘨𝘩𝘪𝘫𝘬𝘭𝘮𝘯𝘰𝘱𝘲𝘳𝘴𝘵𝘶𝘷𝘸𝘹𝘺𝘻𝘈𝘉𝘊𝘋𝘌𝘍𝘎𝘏𝘐𝘑𝘒𝘓𝘔𝘕𝘖𝘗𝘘𝘙𝘚𝘛𝘜𝘝𝘞𝘟𝘠𝘡',
  },

  sansbolditalic: {
    label: '𝙎𝙖𝙣𝙨 𝘽𝙤𝙡𝙙 𝙄𝙩𝙖𝙡𝙞𝙘', category: 'Sans-Serif',
    from: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ',
    to:   '𝙖𝙗𝙘𝙙𝙚𝙛𝙜𝙝𝙞𝙟𝙠𝙡𝙢𝙣𝙤𝙥𝙦𝙧𝙨𝙩𝙪𝙫𝙬𝙭𝙮𝙯𝘼𝘽𝘾𝘿𝙀𝙁𝙂𝙃𝙄𝙅𝙆𝙇𝙈𝙉𝙊𝙋𝙌𝙍𝙎𝙏𝙐𝙑𝙒𝙓𝙔𝙕',
  },

  // ┌──────────────────────────────────────────────────────────┐
  // │                    CALLIGRAPHIE                          │
  // └──────────────────────────────────────────────────────────┘

  script: {
    label: '𝓢𝓬𝓻𝓲𝓹𝓽 𝓑𝓸𝓵𝓭',    category: 'Calligraphie',
    from: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ',
    to:   '𝓪𝓫𝓬𝓭𝓮𝓯𝓰𝓱𝓲𝓳𝓴𝓵𝓶𝓷𝓸𝓹𝓺𝓻𝓼𝓽𝓾𝓿𝔀𝔁𝔂𝔃𝓐𝓑𝓒𝓓𝓔𝓕𝓖𝓗𝓘𝓙𝓚𝓛𝓜𝓝𝓞𝓟𝓠𝓡𝓢𝓣𝓤𝓥𝓦𝓧𝓨𝓩',
  },

  scriptlight: {
    label: '𝒮𝒸𝓇𝒾𝓅𝓉 𝐿𝒾𝑔𝒽𝓉',  category: 'Calligraphie',
    from: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ',
    to:   '𝒶𝒷𝒸𝒹ℯ𝒻ℊ𝒽𝒾𝒿𝓀𝓁𝓂𝓃ℴ𝓅𝓆𝓇𝓈𝓉𝓊𝓋𝓌𝓍𝓎𝓏𝒜ℬ𝒞𝒟ℰℱ𝒢ℋℐ𝒥𝒦ℒℳ𝒩𝒪𝒫𝒬ℛ𝒮𝒯𝒰𝒱𝒲𝒳𝒴𝒵',
  },

  fraktur: {
    label: '𝔉𝔯𝔞𝔨𝔱𝔲𝔯',          category: 'Calligraphie',
    from: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ',
    to:   '𝔞𝔟𝔠𝔡𝔢𝔣𝔤𝔥𝔦𝔧𝔨𝔩𝔪𝔫𝔬𝔭𝔮𝔯𝔰𝔱𝔲𝔳𝔴𝔵𝔶𝔷𝔄𝔅ℭ𝔇𝔈𝔉𝔊ℌℑ𝔍𝔎𝔏𝔐𝔑𝔒𝔓𝔔ℜ𝔖𝔗𝔘𝔙𝔚𝔛𝔜ℨ',
  },

  frakturbold: {
    label: '𝕱𝖗𝖆𝖐𝖙𝖚𝖗 𝕭𝖔𝖑𝖉',  category: 'Calligraphie',
    from: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ',
    to:   '𝖆𝖇𝖈𝖉𝖊𝖋𝖌𝖍𝖎𝖏𝖐𝖑𝖒𝖓𝖔𝖕𝖖𝖗𝖘𝖙𝖚𝖛𝖜𝖝𝖞𝖟𝕬𝕭𝕮𝕯𝕰𝕱𝕲𝕳𝕴𝕵𝕶𝕷𝕸𝕹𝕺𝕻𝕼𝕽𝕾𝕿𝖀𝖁𝖂𝖃𝖄𝖅',
  },

  // ┌──────────────────────────────────────────────────────────┐
  // │                    MATHÉMATIQUES                         │
  // └──────────────────────────────────────────────────────────┘

  double: {
    label: '𝔻𝕠𝕦𝕓𝕝𝕖 𝕊𝕥𝕣𝕦𝕔𝕜',  category: 'Mathematiques',
    from: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
    to:   '𝕒𝕓𝕔𝕕𝕖𝕗𝕘𝕙𝕚𝕛𝕜𝕝𝕞𝕟𝕠𝕡𝕢𝕣𝕤𝕥𝕦𝕧𝕨𝕩𝕪𝕫𝔸𝔹ℂ𝔻𝔼𝔽𝔾ℍ𝕀𝕁𝕂𝕃𝕄ℕ𝕆ℙℚℝ𝕊𝕋𝕌𝕍𝕎𝕏𝕐ℤ𝟘𝟙𝟚𝟛𝟜𝟝𝟞𝟟𝟠𝟡',
  },

  // ┌──────────────────────────────────────────────────────────┐
  // │                 EXPOSANTS / INDICES                      │
  // └──────────────────────────────────────────────────────────┘

  superscript: {
    label: 'ˢᵘᵖᵉʳˢᶜʳⁱᵖᵗ',       category: 'Exposants',
    from: 'abcdefghijklmnopqrstuvwxyz0123456789',
    to:   'ᵃᵇᶜᵈᵉᶠᵍʰⁱʲᵏˡᵐⁿᵒᵖᵠʳˢᵗᵘᵛʷˣʸᶻ⁰¹²³⁴⁵⁶⁷⁸⁹',
  },

  subscript: {
    label: 'ₛᵤᵦₛ꜀ᵣᵢₚₜ',           category: 'Exposants',
    from: 'aeiouvxhklmnpst0123456789',
    to:   'ₐₑᵢₒᵤᵥₓₕₖₗₘₙₚₛₜ₀₁₂₃₄₅₆₇₈₉',
  },

  // ┌──────────────────────────────────────────────────────────┐
  // │                     DECORATIFS                           │
  // └──────────────────────────────────────────────────────────┘

  circled: {
    label: 'Ⓒⓘⓡⓒⓛⓔⓓ',          category: 'Decoratifs',
    from: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
    to:   'ⓐⓑⓒⓓⓔⓕⓖⓗⓘⓙⓚⓛⓜⓝⓞⓟⓠⓡⓢⓣⓤⓥⓦⓧⓨⓩⒶⒷⒸⒹⒺⒻⒼⒽⒾⒿⓀⓁⓂⓃⓄⓅⓆⓇⓈⓉⓊⓋⓌⓍⓎⓏ⓪①②③④⑤⑥⑦⑧⑨',
  },

  circledblack: {
    label: '🅒🅘🅡🅒🅛🅔🅓 🅑🅛🅐🅒🅚', category: 'Decoratifs',
    from: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ',
    to:   '🅐🅑🅒🅓🅔🅕🅖🅗🅘🅙🅚🅛🅜🅝🅞🅟🅠🅡🅢🅣🅤🅥🅦🅧🅨🅩🅐🅑🅒🅓🅔🅕🅖🅗🅘🅙🅚🅛🅜🅝🅞🅟🅠🅡🅢🅣🅤🅥🅦🅧🅨🅩',
  },

  squared: {
    label: '🄰🄱🄲 Squared',        category: 'Decoratifs',
    from: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ',
    to:   '🄰🄱🄲🄳🄴🄵🄶🄷🄸🄹🄺🄻🄼🄽🄾🄿🅀🅁🅂🅃🅄🅅🅆🅇🅈🅉🄰🄱🄲🄳🄴🄵🄶🄷🄸🄹🄺🄻🄼🄽🄾🄿🅀🅁🅂🅃🅄🅅🅆🅇🅈🅉',
  },

  squaredblack: {
    label: '🅰🅱🅲 Squared Black',  category: 'Decoratifs',
    from: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ',
    to:   '🅰🅱🅲🅳🅴🅵🅶🅷🅸🅹🅺🅻🅼🅽🅾🅿🆀🆁🆂🆃🆄🆅🆆🆇🆈🆉🅰🅱🅲🅳🅴🅵🅶🅷🅸🅹🅺🅻🅼🅽🅾🅿🆀🆁🆂🆃🆄🆅🆆🆇🆈🆉',
  },

  parenthesized: {
    label: '⒜⒝⒞ Parenthesized',   category: 'Decoratifs',
    from: 'abcdefghijklmnopqrstuvwxyz',
    to:   '⒜⒝⒞⒟⒠⒡⒢⒣⒤⒥⒦⒧⒨⒩⒪⒫⒬⒭⒮⒯⒰⒱⒲⒳⒴⒵',
  },

  // ┌──────────────────────────────────────────────────────────┐
  // │                     FANTAISIE                            │
  // └──────────────────────────────────────────────────────────┘

  upsidedown: {
    label: 'upsidedown',            category: 'Fantaisie',
    from: '', to: '',
    transform: (text) => {
      const f = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ.,!?';
      const t = 'ɐqɔpǝɟƃɥıɾʞlɯuodbɹsʇnʌʍxʎzɐqɔpǝɟƃɥıɾʞlɯuodbɹsʇnʌʍxʎz,\'ibf';
      const map = {};
      [...f].forEach((c, i) => map[c] = [...t][i]);
      return [...text].map(c => map[c] ?? c).reverse().join('');
    },
  },

  medieval: {
    label: 'Medieval',              category: 'Fantaisie',
    from: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ',
    to:   'ค๒ς๔єŦﻮђเןкlๆภ๏קợгรtยשฬхуzค๒ς๔єŦﻮђเןкlๆภ๏קợгรtยשฬхуz',
  },

  cursive: {
    label: 'Cursive',               category: 'Fantaisie',
    from: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ',
    to:   'αв¢∂єƒﻭнιנкℓмησρqяѕтυνωχуzαв¢∂єƒﻭнιנкℓмησρqяѕтυνωχуz',
  },

  hacker: {
    label: '1337 H4ck3r',           category: 'Fantaisie',
    from: 'aAbBcCdDeEfFgGhHiIjJkKlLmMnNoOpPqQrRsStTuUvVwWxXyYzZ',
    to:   '4A8BcCdD3EfFgGhH1IjJkK1LmMnNo0OpPqQrR5S7TuUvVwWxXyYzZ',
  },

  glitch: {
    label: 'Glitch',                category: 'Fantaisie',
    from: '', to: '',
    transform: (text) => [...text].map(c => c + '\u0337').join(''),
  },

  zalgo: {
    label: 'Zalgo',                 category: 'Fantaisie',
    from: '', to: '',
    transform: (text) => {
      const above = ['\u0300','\u0301','\u0302','\u0303','\u0306','\u0307','\u0308','\u030A','\u030B','\u030D'];
      const below = ['\u0316','\u0317','\u0318','\u0319','\u031C','\u031D','\u031E','\u031F','\u0320','\u0324'];
      return [...text].map(c => {
        if (c === ' ') return c;
        return c + above[Math.floor(Math.random() * above.length)]
                 + above[Math.floor(Math.random() * above.length)]
                 + below[Math.floor(Math.random() * below.length)];
      }).join('');
    },
  },

  strikethrough: {
    label: 'Strikethrough',         category: 'Fantaisie',
    from: '', to: '',
    transform: (text) => [...text].map(c => c + '\u0336').join(''),
  },

  underline: {
    label: 'Underline',             category: 'Fantaisie',
    from: '', to: '',
    transform: (text) => [...text].map(c => c + '\u0332').join(''),
  },

  doublestrike: {
    label: 'Double Strike',         category: 'Fantaisie',
    from: '', to: '',
    transform: (text) => [...text].map(c => c + '\u0346').join(''),
  },

  dotabove: {
    label: 'Dot Above',             category: 'Fantaisie',
    from: '', to: '',
    transform: (text) => [...text].map(c => c + '\u0307').join(''),
  },

  shadow: {
    label: 'Shadow',                category: 'Fantaisie',
    from: '', to: '',
    transform: (text) => [...text].map(c => c + '\u0489').join(''),
  },

  // ┌──────────────────────────────────────────────────────────┐
  // │                    ESTHETIQUE                            │
  // └──────────────────────────────────────────────────────────┘

  ghost: {
    label: 'Ghost Style',           category: 'Esthetique',
    from: '', to: '',
    transform: (text) => `\u300e ${[...text].join(' ')} \u300f`,
  },

  aesthetic: {
    label: 'Aesthetic',             category: 'Esthetique',
    from: '', to: '',
    transform: (text) => [...text].map(c => c === ' ' ? ' · ' : c).join(''),
  },

  wave: {
    label: 'wAvE',                  category: 'Esthetique',
    from: '', to: '',
    transform: (text) => [...text].map((c, i) => i % 2 === 0 ? c.toUpperCase() : c.toLowerCase()).join(''),
  },

  sparkles: {
    label: 'Sparkles',              category: 'Esthetique',
    from: '', to: '',
    transform: (text) => `\u2728 ${text} \u2728`,
  },

  stars: {
    label: 'Stars',                 category: 'Esthetique',
    from: '', to: '',
    transform: (text) => [...text].map(c => c === ' ' ? ' \u2605 ' : c).join(''),
  },

  diamond: {
    label: 'Diamond',               category: 'Esthetique',
    from: '', to: '',
    transform: (text) => [...text].map(c => c === ' ' ? ' \u25C6 ' : c).join(''),
  },

  arrows: {
    label: 'Arrows',                category: 'Esthetique',
    from: '', to: '',
    transform: (text) => [...text].map(c => c === ' ' ? ' \u27A4 ' : c).join(''),
  },

  brackets: {
    label: 'Brackets',              category: 'Esthetique',
    from: '', to: '',
    transform: (text) => [...text].map(c => c === ' ' ? '  ' : `\u3010${c}\u3011`).join(''),
  },

  tildes: {
    label: 'Tildes',                category: 'Esthetique',
    from: '', to: '',
    transform: (text) => [...text].join('~'),
  },

  dotspace: {
    label: 'Dot Space',             category: 'Esthetique',
    from: '', to: '',
    transform: (text) => [...text].join('\u00B7'),
  },

  heartspace: {
    label: 'Heart Space',           category: 'Esthetique',
    from: '', to: '',
    transform: (text) => [...text].join('\u2665'),
  },

  snowflake: {
    label: 'Snowflake',             category: 'Esthetique',
    from: '', to: '',
    transform: (text) => [...text].map(c => c === ' ' ? ' \u2744 ' : c).join(''),
  },

  bubble: {
    label: 'Bubble',                category: 'Esthetique',
    from: '', to: '',
    transform: (text) => `\u00B7\u00B0\u00B0\u00B7 ${text} \u00B7\u00B0\u00B0\u00B7`,
  },

  // ┌──────────────────────────────────────────────────────────┐
  // │                     SYMBOLES                             │
  // └──────────────────────────────────────────────────────────┘

  greek: {
    label: 'Greek',                 category: 'Symboles',
    from: 'abcdefghijklmnopqrstuvwxyz',
    to:   '\u03B1\u03B2\u03C8\u03B4\u03B5\u03C6\u03B3\u03B7\u03B9\u03BE\u03BA\u03BB\u03BC\u03BD\u03BF\u03C0\u03B8\u03C1\u03C3\u03C4\u03C5\u03C9\u03C9\u03C7\u03C5\u03B6',
  },

  runes: {
    label: 'Runes',                 category: 'Symboles',
    from: 'abcdefghijklmnopqrstuvwxyz',
    to:   '\u16A8\u16D2\u16B2\u16DE\u16D6\u16A0\u16B7\u16BA\u16C1\u16C3\u16B2\u16DA\u16D7\u16BE\u16DF\u16C8\u16C9\u16BC\u16CA\u16CF\u16A2\u16D9\u16D9\u16EA\u16C3\u16C9',
  },

  tifinagh: {
    label: 'Tifinagh',              category: 'Symboles',
    from: 'abcdefghijklmnopqrstuvwxyz',
    to:   '\u2D30\u2D31\u2D5B\u2D37\u2D3B\u2D3C\u2D43\u2D40\u2D49\u2D4A\u2D3E\u2D4D\u2D4E\u2D4F\u2D53\u2D43\u2D47\u2D54\u2D59\u2D5C\u2D53\u2D61\u2D61\u2D5D\u2D62\u2D63',
  },

  phonetic: {
    label: 'Phonetic IPA',          category: 'Symboles',
    from: 'abcdefghijklmnopqrstuvwxyz',
    to:   '\u00E6b\u029Cd\u025Bf\u0261x\u026Aj\u029Fl\u006Dn\u0252p\u0071\u0279\u0283t\u028Av\u0077ks\u026Az',
  },

  wingdings: {
    label: 'Wingdings Style',       category: 'Symboles',
    from: 'abcdefghijklmnopqrstuvwxyz',
    to:   '\u270C\u263A\u264B\u263B\u266A\u266B\u266F\u266E\u267C\u2602\u2660\u2663\u2665\u2666\u2605\u2606\u229B\u2295\u2297\u2730\u2724\u2726\u2727\u2729\u272B\u272D',
  },

  // ┌──────────────────────────────────────────────────────────┐
  // │                  STYLES ASIATIQUES                       │
  // └──────────────────────────────────────────────────────────┘

  katakana: {
    label: 'Katakana Style',        category: 'Asiatique',
    from: 'abcdefghijklmnopqrstuvwxyz',
    to:   '\uA4B2\uA4B7\uA4B2\uA4B9\uA4B3\uA4B4\uA4B8\uA4B5\uA4B3\uA4B9\uA4B2\uA4B0\uA4B7\uA4B8\uA4B7\uA4BA\uA4B9\uA4B8\uA4B9\uA4B5\uA4B9\uA4B7\uA4B7\uA4B9\uA4B9\uA4B8',
  },

  // ┌──────────────────────────────────────────────────────────┐
  // │                  STYLES CRYPTES                          │
  // └──────────────────────────────────────────────────────────┘

  cyber: {
    label: 'Cyber L33t',            category: 'Cryptes',
    from: '', to: '',
    transform: (text) => {
      const m = { a:'4',e:'3',i:'1',o:'0',u:'u',s:'5',t:'7',b:'8',g:'9',l:'1',
                  A:'4',E:'3',I:'1',O:'0',U:'U',S:'5',T:'7',B:'8',G:'9',L:'1' };
      return [...text].map(c => m[c] ?? c).join('');
    },
  },

  morse: {
    label: 'Morse Code',            category: 'Cryptes',
    from: '', to: '',
    transform: (text) => {
      const m = {
        a:'.-',b:'-...',c:'-.-.',d:'-..',e:'.',f:'..-.',g:'--.',h:'....',
        i:'..',j:'.---',k:'-.-',l:'.-..',m:'--',n:'-.',o:'---',p:'.--.',
        q:'--.-',r:'.-.',s:'...',t:'-',u:'..-',v:'...-',w:'.--',x:'-..-',
        y:'-.--',z:'--..',
        '0':'-----','1':'.----','2':'..---','3':'...--','4':'....-',
        '5':'.....','6':'-....','7':'--...','8':'---..','9':'----.',
      };
      return [...text.toLowerCase()].map(c => c === ' ' ? '/' : (m[c] || c)).join(' ');
    },
  },

  binary: {
    label: 'Binary',                category: 'Cryptes',
    from: '', to: '',
    transform: (text) => [...text].map(c => c === ' ' ? ' ' : c.charCodeAt(0).toString(2).padStart(8,'0')).join(' '),
  },

  reverse: {
    label: 'Reverse',               category: 'Cryptes',
    from: '', to: '',
    transform: (text) => [...text].reverse().join(''),
  },

  pig_latin: {
    label: 'Pig Latin',             category: 'Cryptes',
    from: '', to: '',
    transform: (text) => text.split(' ').map(w => {
      if (!w) return w;
      const vowels = 'aeiouAEIOU';
      if (vowels.includes(w[0])) return w + 'yay';
      const idx = [...w].findIndex(c => vowels.includes(c));
      return idx === -1 ? w + 'ay' : w.slice(idx) + w.slice(0, idx) + 'ay';
    }).join(' '),
  },

  nato: {
    label: 'NATO Phonetic',         category: 'Cryptes',
    from: '', to: '',
    transform: (text) => {
      const n = {
        a:'Alpha',b:'Bravo',c:'Charlie',d:'Delta',e:'Echo',f:'Foxtrot',
        g:'Golf',h:'Hotel',i:'India',j:'Juliett',k:'Kilo',l:'Lima',
        m:'Mike',n:'November',o:'Oscar',p:'Papa',q:'Quebec',r:'Romeo',
        s:'Sierra',t:'Tango',u:'Uniform',v:'Victor',w:'Whiskey',x:'X-ray',
        y:'Yankee',z:'Zulu'
      };
      return [...text.toLowerCase()].map(c => c === ' ' ? '| ' : (n[c] ? n[c]+' ' : c)).join('').trim();
    },
  },

};

// ═══════════════════════════════════════════════════════════════
//                    FONCTION DE CONVERSION
// ═══════════════════════════════════════════════════════════════

function convertText(text, styleKey) {
  const style = FONT_STYLES[styleKey];
  if (!style) return text;

  if (typeof style.transform === 'function') {
    return style.transform(text);
  }

  const fromChars = [...style.from];
  const toChars   = [...style.to];
  const map = new Map();
  fromChars.forEach((ch, i) => {
    if (toChars[i] !== undefined) map.set(ch, toChars[i]);
  });

  return [...text].map(ch => map.get(ch) ?? ch).join('');
}

// ═══════════════════════════════════════════════════════════════
//                  ICÔNES PAR CATÉGORIE
// ═══════════════════════════════════════════════════════════════

const CATEGORY_ICONS = {
  'Classiques':     '🔡',
  'Sans-Serif':     '🔤',
  'Calligraphie':   '✍️',
  'Mathematiques':  '🔢',
  'Exposants':      '🔼',
  'Decoratifs':     '🎨',
  'Fantaisie':      '🌀',
  'Esthetique':     '✨',
  'Symboles':       '🔣',
  'Asiatique':      '🈯',
  'Cryptes':        '🔐',
};

// Numéros Unicode superbes (cerclés)
const CIRCLED_NUMS = [
  '①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩',
  '⑪','⑫','⑬','⑭','⑮','⑯','⑰','⑱','⑲','⑳',
  '㉑','㉒','㉓','㉔','㉕','㉖','㉗','㉘','㉙','㉚',
  '㉛','㉜','㉝','㉞','㉟','㊱','㊲','㊳','㊴','㊵',
  '㊶','㊷','㊸','㊹','㊺','㊻','㊼','㊽','㊾','㊿',
];

function getNum(n) {
  return CIRCLED_NUMS[n - 1] || `${n}.`;
}

// ═══════════════════════════════════════════════════════════════
//                       MODULE PRINCIPAL
// ═══════════════════════════════════════════════════════════════

module.exports = {
  name: 'ғᴀɴᴄʏ',
  aliases: ['fancy', 'font', 'style', 'police', 'smallcaps', 'scaps', 'unicode'],
  category: '🛠️ Outils généraux',
  description: `『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ${Object.keys(FONT_STYLES).length} sᴛʏʟᴇs ᴅᴇ ᴘᴏʟɪᴄᴇ ᴜɴɪᴄᴏᴅᴇ`,
  usage: `${prefix}fancy <style> <texte>  |  ${prefix}fancy list  |  ${prefix}fancy <texte>`,

  async execute(sock, msg, args, extra) {
    const { reply } = extra;

    try {
      const ALL_KEYS = Object.keys(FONT_STYLES);
      const TOTAL    = ALL_KEYS.length;

      // ══════════════════════════════════════════════
      // 1. FANCY LIST — numéros + exemples par catégorie
      // ══════════════════════════════════════════════
      if (args[0]?.toLowerCase() === 'list' || args[0]?.toLowerCase() === 'styles') {
        const SAMPLE = '𝐃𝐈𝐏𝐏𝐄𝐑';

        const grouped = {};
        let globalIndex = 1;
        for (const [key, s] of Object.entries(FONT_STYLES)) {
          const cat = s.category || 'Autres';
          if (!grouped[cat]) grouped[cat] = [];
          const example = convertText(SAMPLE, key);
          grouped[cat].push(`${getNum(globalIndex++)} *${key}*\n${example}`);
        }

        const styleList = Object.entries(grouped)
          .map(([cat, items]) => {
            const icon = CATEGORY_ICONS[cat] || '▸';
            return `╔═『 ${icon} *${cat.toUpperCase()}* 』\n║\n${items.map(i => '║ ' + i.replace('\n', '\n║   ')).join('\n║\n')}\n╚══════════════`;
          })
          .join('\n\n');

        return reply(
          `┏━━━━━━━━━━━━━━━━━━━━━━━━┓\n` +
          `┃  🎨 *ғᴀɴᴄʏ* — ${TOTAL} sᴛʏʟᴇs  ┃\n` +
          `┗━━━━━━━━━━━━━━━━━━━━━━━━┛\n\n` +
          `${styleList}\n\n` +
          `▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔\n` +
          `📌 *${prefix}fancy <style> <texte>*\n` +
          `📌 *${prefix}fancy <texte>* → aperçu\n` +
          `💡 Réponds à un message pour le convertir`
        );
      }

      // ══════════════════════════════════════════════
      // 2. APERÇU GLOBAL — aucun style reconnu
      // ══════════════════════════════════════════════
      const styleKey = args[0]?.toLowerCase();

      if (!styleKey || !FONT_STYLES[styleKey]) {
        const rawText = args.join(' ').trim() || '𝐃𝐈𝐏𝐏𝐄𝐑';

        const grouped = {};
        let globalIndex = 1;
        for (const [key, s] of Object.entries(FONT_STYLES)) {
          const cat = s.category || 'Autres';
          if (!grouped[cat]) grouped[cat] = [];
          const example = convertText(rawText, key);
          grouped[cat].push(`${getNum(globalIndex++)} *${key}*\n${example}`);
        }

        const preview = Object.entries(grouped)
          .map(([cat, items]) => {
            const icon = CATEGORY_ICONS[cat] || '▸';
            return `╔═『 ${icon} *${cat.toUpperCase()}* 』\n║\n${items.map(i => '║ ' + i.replace('\n', '\n║   ')).join('\n║\n')}\n╚══════════════`;
          })
          .join('\n\n');

        return reply(
          `┏━━━━━━━━━━━━━━━━━━━━━━━━┓\n` +
          `┃  🎨 *${TOTAL} sᴛʏʟᴇs ᴘᴏᴜʀ :*  ┃\n` +
          `┃  _"${rawText}"_\n` +
          `┗━━━━━━━━━━━━━━━━━━━━━━━━┛\n\n` +
          `${preview}\n\n` +
          `▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔\n` +
          `📌 *${prefix}fancy <style> <texte>*\n` +
          `📌 *${prefix}fancy list* → liste complète`
        );
      }

      // ══════════════════════════════════════════════
      // 3. RÉCUPÉRATION DU TEXTE
      // ══════════════════════════════════════════════
      let textToConvert = '';

      const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      if (quotedMsg) {
        textToConvert =
          quotedMsg.conversation ||
          quotedMsg.extendedTextMessage?.text ||
          quotedMsg.imageMessage?.caption ||
          quotedMsg.videoMessage?.caption ||
          '';
      }

      if (!textToConvert || args.length > 1) {
        const fromArgs = args.slice(1).join(' ').trim();
        if (fromArgs) textToConvert = fromArgs;
      }

      textToConvert = textToConvert.trim();

      if (!textToConvert) {
        return reply(
          `┏━━━━━━━━━━━━━━━━━━━━━━━━┓\n` +
          `┃  ⚠️  *Aucun texte fourni*  ┃\n` +
          `┗━━━━━━━━━━━━━━━━━━━━━━━━┛\n\n` +
          `📌 _${prefix}fancy ${styleKey} <ton texte>_\n` +
          `📌 Ou réponds à un message`
        );
      }

      // ══════════════════════════════════════════════
      // 4. CONVERSION & ENVOI — design épuré, texte en gras
      // ══════════════════════════════════════════════
      const converted  = convertText(textToConvert, styleKey);
      const style      = FONT_STYLES[styleKey];
      const icon       = CATEGORY_ICONS[style.category] || '✦';
      const styleIndex = ALL_KEYS.indexOf(styleKey) + 1;

      await reply(
        `┏━『 ${icon} ${style.label} 』\n` +
        `┃\n` +
        `*${converted}*\n` +
        `┃\n` +
        `┗━ ${getNum(styleIndex)} *${styleKey}* · ${style.category}`
      );

    } catch (error) {
      console.error('[fancy] ERROR:', error);
      await reply(
        `┏━━━━━━━━━━━━━━━━━━━━━━━━┓\n` +
        `┃  ❌ *Erreur inattendue*  ┃\n` +
        `┗━━━━━━━━━━━━━━━━━━━━━━━━┛\n\n` +
        `_${error.message}_`
      );
    }
  }
};
