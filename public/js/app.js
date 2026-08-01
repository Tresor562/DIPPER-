/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║   DIPPER — Pairing web frontend                               ║
 * ║   js/app.js                                                   ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * Ce fichier NE contient AUCUNE logique de pairing. Il appelle
 * uniquement l'API HTTP du projet WhatsApp (POST /pair) et affiche
 * le résultat. Toute décision (numéro valide, anti-doublon, cooldown,
 * reconnexion...) reste côté serveur, dans pairingService.js.
 *
 * Ce projet est maintenant indépendant du projet WhatsApp et du bot
 * Telegram — voir README.md.
 *
 * CONFIGURATION DE L'API :
 *   Par défaut, les requêtes partent en relatif ("/pair") — ça marche
 *   sans rien configurer si ce site est servi depuis la même origine
 *   que l'API (même domaine, ou un reverse-proxy qui route /pair vers
 *   le backend). Si l'API est ailleurs, définir avant ce script :
 *     <script>window.DIPPER_API_BASE_URL = 'https://api.mondomaine.com';</script>
 */
(function () {
  'use strict';

  var API_BASE_URL = window.DIPPER_API_BASE_URL || '';
  if (!API_BASE_URL) {
    console.warn('[DIPPER] window.DIPPER_API_BASE_URL is not set — /pair requests will go to this site\u2019s own origin. ' +
      'If your bot API runs on a different domain (the usual setup when this site is deployed separately, e.g. on Vercel), ' +
      'every pairing request will fail. See README \u2192 "Configuring the API address".');
  }

  // ── Friendly error messages (jamais de JSON brut affiché) ───────────
  var ERROR_MESSAGES = {
    MISSING_PHONE_NUMBER: 'Please enter your phone number.',
    INVALID_NUMBER: 'That number doesn\u2019t look right. Please check and try again.',
    COOLDOWN: 'Please wait a little before requesting another code.',
    ALREADY_ACTIVE: 'This number is already connected and online.',
    NO_MONGODB: 'Pairing is temporarily unavailable. Please try again shortly.',
    DB_UNAVAILABLE: 'Pairing is temporarily unavailable. Please try again shortly.',
    CODE_FAILED: 'We couldn\u2019t generate a code right now. Please try again.',
    BAD_REQUEST: 'Something about that request didn\u2019t go through. Please try again.',
    // [Audit chantier "Something went wrong"] Cas distinct et beaucoup plus
    // actionnable que INTERNAL_ERROR : la réponse reçue n'était pas du JSON
    // valide (typiquement une page 404 HTML) — signe quasi certain que la
    // requête n'a jamais atteint la vraie API (DIPPER_API_BASE_URL absent
    // ou incorrect, site et API sur des domaines différents). Voir README.
    BAD_RESPONSE: 'Can\u2019t reach the pairing service at this address. If you just deployed this site, make sure DIPPER_API_BASE_URL points to your bot\u2019s API (see README).',
    INTERNAL_ERROR: 'Something went wrong on our end. Please try again.',
    NETWORK: 'Can\u2019t reach the server. Check your connection and try again.',
  };

  function friendlyMessage(errorCode, fallback) {
    return ERROR_MESSAGES[errorCode] || fallback || ERROR_MESSAGES.INTERNAL_ERROR;
  }

  // ══════════════════════════════════════════════════════════════════
  // Toasts
  // ══════════════════════════════════════════════════════════════════
  var toastStack = document.getElementById('toast-stack');

  var TOAST_DURATION_MS = 4200;
  function showToast(message) {
    var el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'alert');

    var icon = document.createElement('span');
    icon.className = 'toast__icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6"/><path d="M12 8v5M12 16h.01" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';

    var text = document.createElement('span');
    text.className = 'toast__text';
    text.textContent = message;

    var progress = document.createElement('span');
    progress.className = 'toast__progress';
    progress.style.animationDuration = TOAST_DURATION_MS + 'ms';

    el.appendChild(icon);
    el.appendChild(text);
    el.appendChild(progress);
    toastStack.appendChild(el);

    var timer = setTimeout(function () { dismiss(); }, TOAST_DURATION_MS);

    function dismiss() {
      clearTimeout(timer);
      el.classList.add('is-leaving');
      el.addEventListener('animationend', function () { el.remove(); }, { once: true });
    }
    el.addEventListener('click', dismiss);
  }

  // ══════════════════════════════════════════════════════════════════
  // Phone input — intl-tel-input (professional country selector)
  // ══════════════════════════════════════════════════════════════════
  // Chosen over a hand-rolled <select> (see README): ships every country
  // WhatsApp-style apps support, with flags, instant search by name AND
  // dial code, a fullscreen picker on mobile, and per-country validation
  // backed by Google's libphonenumber — all things that are impractical
  // to reimplement reliably by hand.
  //
  // Loaded via CDN in index.html. If that fails (blocked network,
  // offline mirror...), we degrade to a plain, still-usable input rather
  // than a broken page — see the `else` branch below.
  var phoneInputEl = document.getElementById('phone-number');
  var fallbackNotice = document.getElementById('fallback-notice');
  var iti = null;

  var VALIDATION_ERROR_MESSAGES = {
    INVALID_COUNTRY_CODE: 'Please choose a country.',
    TOO_SHORT: 'That number looks too short.',
    TOO_LONG: 'That number looks too long.',
    IS_POSSIBLE_LOCAL_ONLY: 'Please include the full number, not just the local part.',
    INVALID_LENGTH: 'That number doesn\u2019t look right for this country.',
  };

  if (window.intlTelInput) {
    iti = window.intlTelInput(phoneInputEl, {
      // Best-effort IP lookup for a sensible starting country; if it
      // fails or the quota is exhausted, the input simply starts in the
      // empty/globe state — never blocks the user.
      initialCountryLookup: function () {
        return fetch('https://ipapi.co/json')
          .then(function (r) { return r.json(); })
          .then(function (d) { return d.country_code; });
      },
      countrySearch: true,          // search by name, iso2, AND dial code
      countrySelectorMode: 'AUTO',  // fullscreen on mobile, dropdown on desktop
      separateDialCode: true,       // dial code shown, matches the WhatsApp linking screen
      strictMode: true,             // blocks non-numeric keystrokes as you type
      formatAsYouType: true,
      loadUtils: function () {
        return import('https://cdn.jsdelivr.net/npm/intl-tel-input@29.1.2/dist/js/utils.js');
      },
    });

    // strictMode already prevents most bad input; this just gives a
    // precise, elegant explanation instead of the built-in shake alone.
    phoneInputEl.addEventListener('strict:reject', function (e) {
      var reason = e.detail && e.detail.reason;
      phoneError.textContent = reason === 'max-length'
        ? 'That\u2019s the maximum length for this country.'
        : 'Only digits are allowed here.';
    });
    phoneInputEl.addEventListener('countrychange', function () {
      phoneError.textContent = '';
    });
  } else {
    fallbackNotice.hidden = false;
    phoneInputEl.placeholder = '+229 XX XX XX XX';
  }

  // ══════════════════════════════════════════════════════════════════
  // Form + states
  // ══════════════════════════════════════════════════════════════════
  var form = document.getElementById('pair-form');
  var phoneError = document.getElementById('phone-error');
  var submitBtn = document.getElementById('submit-btn');

  var stateForm = document.getElementById('state-form');
  var stateCode = document.getElementById('state-code');
  var stateReconnected = document.getElementById('state-reconnected');

  var codeValueEl = document.getElementById('code-value');
  var copyBtn = document.getElementById('copy-btn');
  var copyToast = document.getElementById('copy-toast');

  function showState(name) {
    stateForm.hidden = name !== 'form';
    stateCode.hidden = name !== 'code';
    stateReconnected.hidden = name !== 'reconnected';
  }

  function setLoading(isLoading) {
    submitBtn.disabled = isLoading;
    submitBtn.classList.toggle('is-loading', isLoading);
  }

  function resetToForm() {
    showState('form');
    phoneInputEl.value = '';
    phoneError.textContent = '';
    phoneInputEl.focus();
  }

  document.getElementById('restart-btn').addEventListener('click', resetToForm);
  document.getElementById('restart-btn-2').addEventListener('click', resetToForm);

  function formatCode(code) {
    // pairingService renvoie déjà un code formaté ("ABCD-1234") — on
    // l'affiche tel quel, sans réinterpréter le format côté client.
    return code || '';
  }

  form.addEventListener('submit', function (evt) {
    evt.preventDefault();
    phoneError.textContent = '';

    getSubmittablePhoneNumber().then(function (result) {
      if (result.error) {
        phoneError.textContent = result.error;
        phoneInputEl.focus();
        return;
      }
      submitPairingRequest(result.phoneNumber);
    });
  });

  /**
   * Resolves to { phoneNumber } or { error }. When intl-tel-input is
   * available, this is a UX-level pre-check (fewer wasted round trips,
   * clearer errors) — it does NOT replace server-side validation, which
   * stays the single source of truth in pairingService.js.
   */
  function getSubmittablePhoneNumber() {
    if (!iti) {
      var digitsOnly = phoneInputEl.value.trim().replace(/[^\d+]/g, '');
      if (!digitsOnly) return Promise.resolve({ error: 'Please enter your phone number.' });
      return Promise.resolve({ phoneNumber: digitsOnly });
    }

    return iti.promise.then(function () {
      if (!phoneInputEl.value.trim()) {
        return { error: 'Please enter your phone number.' };
      }
      if (!iti.isValidNumber()) {
        var code = iti.getValidationError();
        return { error: VALIDATION_ERROR_MESSAGES[code] || 'That number doesn\u2019t look right. Please check and try again.' };
      }
      return { phoneNumber: iti.getNumber() }; // E.164 by default
    }).catch(function () {
      // Utils script failed to load (e.g. CDN unreachable) — fall back to
      // whatever the user typed rather than blocking submission entirely.
      var raw = phoneInputEl.value.trim().replace(/[^\d+]/g, '');
      return raw ? { phoneNumber: raw } : { error: 'Please enter your phone number.' };
    });
  }

  function submitPairingRequest(phoneNumber) {
    setLoading(true);

    fetch(API_BASE_URL + '/pair', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber: phoneNumber }),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, status: res.status, data: data, parsed: true };
        }).catch(function () {
          // Réponse reçue mais pas du JSON (typiquement une page HTML 404) :
          // presque toujours le signe que la requête n'a pas atteint la
          // vraie API — cas distinct de INTERNAL_ERROR, voir ERROR_MESSAGES.
          return { ok: res.ok, status: res.status, data: null, parsed: false };
        });
      })
      .then(function (result) {
        if (!result.parsed) {
          showToast(friendlyMessage('BAD_RESPONSE'));
          return;
        }
        if (!result.ok || !result.data) {
          var code = result.data && result.data.error;
          var msg = result.data && result.data.message;
          showToast(friendlyMessage(code, msg));
          return;
        }

        var data = result.data;
        if (data.reconnected) {
          showState('reconnected');
        } else {
          codeValueEl.textContent = formatCode(data.pairingCode);
          showState('code');
        }
      })
      .catch(function () {
        showToast(friendlyMessage('NETWORK'));
      })
      .finally(function () {
        setLoading(false);
      });
  }

  // ══════════════════════════════════════════════════════════════════
  // Copy to clipboard — no alert(), no browser popup
  // ══════════════════════════════════════════════════════════════════
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    // Fallback pour contextes non sécurisés / navigateurs anciens
    return new Promise(function (resolve, reject) {
      try {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  }

  copyBtn.addEventListener('click', function () {
    var code = codeValueEl.textContent;
    copyText(code).then(function () {
      copyBtn.classList.add('is-copied');
      copyToast.classList.add('is-visible');
      setTimeout(function () {
        copyBtn.classList.remove('is-copied');
        copyToast.classList.remove('is-visible');
      }, 1200);
    }).catch(function () {
      showToast('Couldn\u2019t copy automatically \u2014 please select the code manually.');
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // Logo — round image before the brand name. No temporary placeholder:
  // if img/logo.png hasn't been dropped in yet, the element is simply
  // hidden (see README for path/filename/format).
  // ══════════════════════════════════════════════════════════════════
  var brandLogo = document.getElementById('brand-logo');
  if (brandLogo) {
    brandLogo.addEventListener('error', function () {
      // Not silent: this is expected until the asset is added, and it's
      // logged so a real broken-path bug (wrong filename later) is still
      // visible in the console instead of just disappearing.
      console.info('[DIPPER] img/logo.png not found yet \u2014 logo hidden until it is added (see README).');
      brandLogo.style.display = 'none';
    }, { once: true });
  }

  // ══════════════════════════════════════════════════════════════════
  // Ambient music — opt-in only. Browsers block audible autoplay without
  // a user gesture, so the toggle button stays hidden until the audio
  // file has actually loaded, and playback only ever starts on click.
  // ══════════════════════════════════════════════════════════════════
  var audioToggle = document.getElementById('audio-toggle');
  var ambientAudio = document.getElementById('ambient-audio');
  var ambientReady = false;

  if (audioToggle && ambientAudio) {
    ambientAudio.addEventListener('error', function () {
      console.info('[DIPPER] audio/ambient.mp3 not found yet \u2014 music toggle hidden until it is added (see README).');
    }, { once: true });

    ambientAudio.addEventListener('loadedmetadata', function () {
      ambientReady = true;
      audioToggle.hidden = false;
    }, { once: true });

    audioToggle.addEventListener('click', function () {
      if (!ambientReady) return;
      if (ambientAudio.paused) {
        ambientAudio.play().catch(function (err) {
          console.info('[DIPPER] Ambient audio playback was blocked:', err && err.message);
        });
        audioToggle.classList.add('is-playing');
        audioToggle.setAttribute('aria-pressed', 'true');
      } else {
        ambientAudio.pause();
        audioToggle.classList.remove('is-playing');
        audioToggle.setAttribute('aria-pressed', 'false');
      }
    });
  }

  // ══════════════════════════════════════════════════════════════════
  // Scroll reveal for the sections below the pairing card
  // ══════════════════════════════════════════════════════════════════
  var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var revealEls = document.querySelectorAll('.reveal');

  if (prefersReducedMotion || !('IntersectionObserver' in window)) {
    revealEls.forEach(function (el) { el.classList.add('is-visible'); });
  } else {
    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });
    revealEls.forEach(function (el) { revealObserver.observe(el); });
  }

  // ══════════════════════════════════════════════════════════════════
  // [Phase B — premium] Parallax léger au scroll pour les nébuleuses —
  // sensation de profondeur. Purement décoratif (aria-hidden, pointer-
  // events:none déjà sur .nebula), throttlé via requestAnimationFrame
  // pour ne jamais bloquer le scroll, désactivé si prefers-reduced-motion.
  // ══════════════════════════════════════════════════════════════════
  if (!prefersReducedMotion) {
    var nebulaA = document.querySelector('.nebula--a');
    var nebulaB = document.querySelector('.nebula--b');
    var parallaxTicking = false;
    function applyParallax() {
      var y = window.scrollY || window.pageYOffset || 0;
      // margin-top (pas transform) : driftA/driftB animent déjà `transform`
      // en CSS, qui écraserait sinon toute valeur inline sur la même
      // propriété à chaque frame d'animation — les deux effets se
      // combinent proprement en utilisant une propriété différente.
      if (nebulaA) nebulaA.style.marginTop = (y * 0.06) + 'px';
      if (nebulaB) nebulaB.style.marginTop = (y * -0.08) + 'px';
      parallaxTicking = false;
    }
    window.addEventListener('scroll', function () {
      if (!parallaxTicking) {
        requestAnimationFrame(applyParallax);
        parallaxTicking = true;
      }
    }, { passive: true });
  }

  // ══════════════════════════════════════════════════════════════════
  // Background — starfield + The Big Dipper asterism (signature element)
  // ══════════════════════════════════════════════════════════════════
  (function sky() {
    var canvas = document.getElementById('sky');
    var ctx = canvas.getContext('2d');
    var reduceMotion = prefersReducedMotion;
    var w, h, dpr;
    var stars = [];
    var dipper = [];

    // Coordonnées relatives (0..1) formant la Grande Ourse (plough),
    // positionnée dans le tiers supérieur droit de l'écran.
    var DIPPER_SHAPE = [
      [0.60, 0.14], [0.66, 0.10], [0.735, 0.115], [0.79, 0.16],
      [0.855, 0.145], [0.90, 0.19], [0.865, 0.235]
    ];

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
    }

    function seed() {
      stars = [];
      var count = Math.round((w * h) / 9000);
      for (var i = 0; i < count; i++) {
        stars.push({
          x: Math.random() * w,
          y: Math.random() * h,
          r: Math.random() * 1.2 + 0.3,
          phase: Math.random() * Math.PI * 2,
          speed: 0.6 + Math.random() * 1.1,
        });
      }
      dipper = DIPPER_SHAPE.map(function (p) {
        return { x: p[0] * w, y: p[1] * h, phase: Math.random() * Math.PI * 2 };
      });
      // [Optimisation performance] Les gradients radiaux du halo de chaque
      // étoile de la Grande Ourse sont désormais créés UNE SEULE FOIS ici
      // (au lieu de 7 par frame, ~420/seconde auparavant) — le "pulse" est
      // simulé via globalAlpha au lieu de recréer le gradient à chaque
      // frame, ce qui donne un effet visuel quasi identique pour un coût
      // CPU/GC bien moindre (notable sur Android bas/moyen de gamme).
      dipper.forEach(function (p) {
        p.glowGradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 10);
        p.glowGradient.addColorStop(0, 'rgba(180, 190, 255, 0.9)');
        p.glowGradient.addColorStop(1, 'rgba(180, 190, 255, 0)');
      });
    }

    function drawStatic() {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#eef2ff';
      stars.forEach(function (s) {
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      });
      drawDipper(1);
    }

    function drawDipper(glowPulse) {
      ctx.save();
      ctx.strokeStyle = 'rgba(124, 92, 255, 0.55)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      dipper.forEach(function (p, i) {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();

      dipper.forEach(function (p) {
        var r = 2.1 * glowPulse;
        ctx.globalAlpha = Math.min(1, glowPulse);
        ctx.fillStyle = p.glowGradient;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 10 * glowPulse, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#eef2ff';
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();
    }

    var t = 0;
    function tick() {
      t += 0.016;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#eef2ff';
      stars.forEach(function (s) {
        var tw = 0.35 + 0.35 * (0.5 + 0.5 * Math.sin(t * s.speed + s.phase));
        ctx.globalAlpha = tw;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      });
      var pulse = 0.85 + 0.15 * Math.sin(t * 0.6);
      drawDipper(pulse);
      requestAnimationFrame(tick);
    }

    resize();
    window.addEventListener('resize', resize);

    if (reduceMotion) {
      drawStatic();
    } else {
      requestAnimationFrame(tick);
    }
  })();
})();
