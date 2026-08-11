'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const STYLE_URLS = {
  0: [],
  1: [
    'https://i.imgur.com/6F2V6eD.jpeg','https://i.imgur.com/nX1WVHH.jpeg','https://i.imgur.com/3z2ABPN.jpeg',
    'https://files.catbox.moe/km94ug.png','https://files.catbox.moe/mffape.png','https://files.catbox.moe/7xbk4p.png'
  ],
  2: [
    'https://i.imgur.com/UlDSoMy.jpeg','https://i.imgur.com/Q8jbvKo.jpeg','https://i.imgur.com/YK2BKBZ.jpeg',
    'https://files.catbox.moe/muab4m.jpg','https://files.catbox.moe/5b351a.jpg','https://files.catbox.moe/cnglhu.jpg',
    'https://files.catbox.moe/07lfop.jpg','https://files.catbox.moe/211w67.jpg','https://files.catbox.moe/dtj3s9.jpg',
    'https://files.catbox.moe/t4v076.jpg','https://files.catbox.moe/5yjazr.jpg'
  ],
  3: [
    'https://i.imgur.com/2v3YMYW.jpeg','https://i.imgur.com/YaFRkON.jpeg','https://i.imgur.com/wMqFGHH.jpeg',
    'https://files.catbox.moe/mwcq4j.jpg','https://files.catbox.moe/3ii420.jpg','https://files.catbox.moe/ak3hnu.jpg',
    'https://files.catbox.moe/vrz54q.jpg','https://files.catbox.moe/87aqe4.jpg','https://files.catbox.moe/h960vp.jpg',
    'https://files.catbox.moe/uaglet.jpg','https://files.catbox.moe/vpfs80.jpg','https://files.catbox.moe/9we55g.jpg',
    'https://files.catbox.moe/s2epgj.jpg'
  ],
  4: [
    'https://i.imgur.com/OhY9sTe.jpeg','https://i.imgur.com/dvGCVmo.jpeg','https://i.imgur.com/qS3c5dh.jpeg',
    'https://files.catbox.moe/xfb193.jpg','https://files.catbox.moe/6amjh9.jpg','https://files.catbox.moe/oouy96.jpg',
    'https://files.catbox.moe/vki01s.jpg','https://files.catbox.moe/11t5wk.jpg','https://files.catbox.moe/16vuqn.jpg',
    'https://files.catbox.moe/6p9lbk.jpg','https://files.catbox.moe/ir0g61.jpg','https://files.catbox.moe/lwcmlg.jpg',
    'https://files.catbox.moe/4tytog.jpg','https://files.catbox.moe/s2epgj.jpg'
  ],
  5: [
    'https://i.imgur.com/BJHbV2X.jpeg','https://i.imgur.com/YDGmsDN.jpeg','https://i.imgur.com/4jJukHR.jpeg',
    'https://files.catbox.moe/yp09dh.jpg','https://files.catbox.moe/qlv9rl.jpg','https://files.catbox.moe/7ewuua.jpg',
    'https://files.catbox.moe/awrwem.jpg','https://files.catbox.moe/sfvi8b.jpg','https://files.catbox.moe/eony8h.jpg','https://files.catbox.moe/zbvq7j.jpg'
  ],
  6: [
    'https://i.imgur.com/Rb0ZWOH.jpeg','https://i.imgur.com/7b4iuDP.jpeg','https://i.imgur.com/pHqnFmC.jpeg',
    'https://files.catbox.moe/5nddcl.jpg','https://files.catbox.moe/ndvf4k.jpg','https://files.catbox.moe/u7178f.jpg',
    'https://files.catbox.moe/gkek17.jpg','https://files.catbox.moe/9drm3j.jpg','https://files.catbox.moe/g3qybv.jpg','https://files.catbox.moe/em2859.jpg'
  ],
  7: [
    'https://i.imgur.com/zLaT5KT.jpeg','https://i.imgur.com/A5cMbwA.jpeg','https://i.imgur.com/mkrmEQf.jpeg',
    'https://files.catbox.moe/gqf5ba.jpg','https://files.catbox.moe/jfzlre.jpg','https://files.catbox.moe/whmaf8.jpg',
    'https://files.catbox.moe/rgbyxa.jpg','https://files.catbox.moe/61axnd.jpg'
  ],
  8: [
    'https://i.imgur.com/VgmhBaZ.jpeg','https://i.imgur.com/GwnNj7R.jpeg','https://i.imgur.com/wXsUEab.jpeg',
    'https://files.catbox.moe/xp5ypp.jpg','https://files.catbox.moe/pbzdh3.jpeg','https://files.catbox.moe/tf954v.jpg',
    'https://files.catbox.moe/eb9tg6.jpg','https://files.catbox.moe/rgbyxa.jpg'
  ],
  9: [
    'https://i.imgur.com/hIiPCsY.jpeg','https://i.imgur.com/mJqzPJl.jpeg','https://i.imgur.com/wXrNGFp.jpeg',
    'https://files.catbox.moe/brtvxo.jpg','https://files.catbox.moe/jtvqys.jpg','https://files.catbox.moe/8vh1vn.jpg',
    'https://files.catbox.moe/qddrjg.jpg','https://files.catbox.moe/zsmflt.jpg'
  ],
  10: [
    'https://i.imgur.com/4sMVZaB.jpeg','https://i.imgur.com/9t2i4VK.jpeg','https://i.imgur.com/v8BByTt.jpeg',
    'https://files.catbox.moe/xxgh2f.jpg','https://files.catbox.moe/w4kcey.jpg','https://files.catbox.moe/a7rh4y.jpg',
    'https://files.catbox.moe/oe68x7.jpg','https://files.catbox.moe/fabbon.jpg'
  ],
  11: [], 12: [], 13: [], 14: [],
  15: [
    'https://i.postimg.cc/3knR077m/31b765be4c48181ec71682f486b873d9-webp.webp',
    'https://i.postimg.cc/R3h0c8VW/352bcb0da908d8dd81e3ecffde24b93b-webp.webp',
    'https://i.postimg.cc/qtq78YMz/36c55390974344a553c0a945efa623ac-webp.webp',
    'https://i.postimg.cc/4Ky3zMNK/b05b777d4a18952d1e0063b6cafaf671-webp.webp',
    'https://i.postimg.cc/KKjYnVvk/ba5f8a3eeb37935c7b74300afcb15317-webp.webp'
  ],
  16: [
    'https://i.postimg.cc/B8SmNTdp/2fbea2e9c1b834f7e7f934ff519ee4db-webp.webp',
    'https://i.postimg.cc/94mL1dvs/4dccc61a0e6bd65a8360568d3f8e6326-webp.webp',
    'https://i.postimg.cc/QB8fSQRw/9228a68a15da2dbc1fecf45394c06c5b-webp.webp',
    'https://i.postimg.cc/WDN5SGQH/dcebed36d2df6a85b7289e605f285719-webp.webp',
    'https://i.postimg.cc/FfrTGy2q/fd1eea2f158fb77d35f90a92bb8f7416-webp.webp'
  ],
  17: [
    'https://i.postimg.cc/Z9vCG2tq/6b5d9409a1839236ca757092e036442e.jpg',
    'https://i.postimg.cc/674ykgJ3/987b4f12c55550b30a3a0736cbe0d67b.jpg',
    'https://i.postimg.cc/yJ3kMt4x/c915530748a8485093b4a285c3dde197.jpg',
    'https://i.postimg.cc/McfvCN2v/f4a8c086d431641edba1a9d4a7e2534b.jpg'
  ],
  18: [
    'https://i.postimg.cc/9zLwqGph/3369205534fe898c797e57d388cf4e2b-webp.webp',
    'https://i.postimg.cc/w3wRshVx/50514d86611161a207687d0afb1b7080-webp.webp',
    'https://i.postimg.cc/230LB4wC/52e2f0a4e24e91af65fd8d8abb8a4b4d-webp.webp',
    'https://i.postimg.cc/Z0wvyrc4/58b56dcca21314d648c1af71cfd2d0aa-webp.webp',
    'https://i.postimg.cc/jCMnJzXs/c806d58879926807151297a162228544-webp.webp',
    'https://i.postimg.cc/RqgJncRZ/f1c70b7e5e96f933da55ec9473520cd3-webp.webp'
  ],
  19: [
    'https://i.postimg.cc/T5KdbWRH/15fcf92720a3636cdfc7c1d15f149e70-webp.webp',
    'https://i.postimg.cc/7J5HzTxc/2a8941d66cd10223b1cbbdde25d4fa44.jpg',
    'https://i.postimg.cc/CnRh8fFX/7112ef664def03606bc7897f246781c0-webp.webp',
    'https://i.postimg.cc/LgJ9PZHr/9eaebc9d4cb8c98edfcdafce292cfcf7-webp.webp',
    'https://i.postimg.cc/fSVzd0wG/d7c0e935f8642655a9fa0cffeba53800.jpg'
  ],
  20: [
    'https://i.postimg.cc/bsYMmjks/12f5ce20e8e584016bdf0047f5b7460a.jpg',
    'https://i.postimg.cc/CzMtcVkZ/27183ac35cfa437734d23a8c953ed68d.jpg',
    'https://i.postimg.cc/9rXSLjZR/f72ba40ad2eef4af5e6f0e20f4f6d1f2.jpg'
  ]
};

async function checkUrl(style, url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 THE-BIG-DIPPER-image-audit' }
    });
    const type = response.headers.get('content-type') || '';
    const data = await response.arrayBuffer();
    const bytes = data.byteLength;
    const ok = response.ok && bytes > 1000 && (/^image\//i.test(type) || /\.(jpe?g|png|webp|gif)(?:$|\?)/i.test(url));
    return { style, url, ok, status: response.status, contentType: type, bytes, finalUrl: response.url };
  } catch (err) {
    return { style, url, ok: false, status: null, contentType: '', bytes: 0, error: err.name === 'AbortError' ? 'timeout' : err.message };
  } finally {
    clearTimeout(timer);
  }
}

(async () => {
  const results = [];
  for (const [styleText, urls] of Object.entries(STYLE_URLS)) {
    const style = Number(styleText);
    if (!urls.length) {
      console.log(`[menu-images] Style ${style}: NON CONFIGURÉ`);
      continue;
    }
    for (const url of urls) {
      const r = await checkUrl(style, url);
      results.push(r);
      console.log(`[menu-images] Style ${style} ${r.ok ? 'OK' : 'KO'} | ${url} | HTTP=${r.status ?? '-'} | ${r.bytes} octets | ${r.contentType || r.error || '-'}`);
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    unconfiguredStyles: Object.entries(STYLE_URLS).filter(([, urls]) => !urls.length).map(([style]) => Number(style)),
    total: results.length,
    ok: results.filter(r => r.ok).length,
    ko: results.filter(r => !r.ok).length,
    results
  };
  fs.writeFileSync(path.join(ROOT, 'menu-image-audit.json'), JSON.stringify(report, null, 2));
  console.log(`[menu-images] TOTAL=${report.total} OK=${report.ok} KO=${report.ko} NON_CONFIGURÉS=${report.unconfiguredStyles.join(',')}`);
  process.exit(0);
})().catch(err => {
  console.error('[menu-images] audit fatal:', err);
  process.exit(1);
});
