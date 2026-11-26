/* =====================================================================
   HealthyRemake AI — serveur d'analyse des plats
   ---------------------------------------------------------------------
   À coller dans un Cloudflare Worker (offre gratuite).
   Il reçoit la photo envoyée par l'app, la fait analyser par un modèle
   d'IA qui « voit » les images (Workers AI) et renvoie un JSON :
   plat reconnu, confiance, ingrédients repérés, calories estimées,
   et une recette healthy quand le plat n'est pas dans l'app.

   Réglages dans le tableau de bord Cloudflare (onglet Settings) :
   - Binding « Workers AI » nommé AI ........................ obligatoire
   - Secret ACCESS_CODE ..................................... facultatif
     (si tu le crées, l'app devra envoyer ce code pour analyser)
   - Variable MODEL ......................................... facultatif
     (pour forcer un autre modèle Workers AI qui accepte les images)
   - Binding « KV namespace » nommé USERS ................... pour les comptes
     (connexion e-mail + mot de passe, favoris et réglages synchronisés)
   ===================================================================== */

// Adresses autorisées à appeler le serveur depuis un navigateur.
// Ajoute la tienne si tu héberges l'app ailleurs que sur GitHub Pages.
const ALLOWED_ORIGINS = [
  'https://ewenbourges.github.io',
  'http://localhost',
  'http://127.0.0.1',
  'null' // fichier index.html ouvert directement sur l'appareil
];

// Modèles essayés dans l'ordre (le second sert de secours).
const MODELS = [
  { id: '@cf/mistralai/mistral-small-3.1-24b-instruct', name: 'Mistral Small 3.1', limit: 'max_tokens' },
  { id: '@cf/google/gemma-4-26b-a4b-it', name: 'Gemma 4', limit: 'max_completion_tokens' }
];

const MAX_IMAGE_CHARS = 2_000_000; // ≈ 1,5 Mo d'image : l'app envoie environ 100 Ko

const SYSTEM = `Tu es le moteur d'analyse de HealthyRemake AI, une app qui transforme les plats gourmands en versions healthy.
Tu regardes la photo d'un plat et tu réponds UNIQUEMENT avec un objet JSON valide : pas de texte avant ou après, pas de balises markdown.
Tout le texte est en français. Les valeurs nutritionnelles sont des estimations réalistes pour la portion visible.`;

function userPrompt(dishes) {
  return `Analyse cette photo et remplis ce JSON.

1. is_food : true si la photo montre un plat, une boisson ou un aliment, sinon false.
2. dish : le nom précis du plat en français ; emoji : un emoji qui le représente ; confidence : ta confiance de 0 à 100.
3. match : si le plat correspond clairement à l'un des plats de l'app ci-dessous, sa clé (le texte avant le « = »), sinon null.
4. portion : la portion visible (ex. « 1 burger, environ 280 g ») ; original : kcal, p (protéines g), c (glucides g), f (lipides g) de cette portion.
5. detected : 4 à 8 ingrédients que tu repères sur la photo.
6. healthy : SEULEMENT si match est null, une version healthy réaliste et gourmande du même plat (au moins 30 % de calories en moins, au moins autant de protéines). Si match n'est pas null, healthy vaut null.

Plats de l'app : ${dishes.length ? dishes.join(' ; ') : '(aucun)'}

Format exact :
{"is_food":true,"dish":"…","emoji":"🍔","confidence":85,"match":null,"portion":"…","original":{"kcal":0,"p":0,"c":0,"f":0},"detected":["…"],"healthy":{"name":"… version healthy","desc":"une phrase","time":"25 min","diff":"Facile","serv":"1 pers.","kcal":0,"p":0,"c":0,"f":0,"ing":[["🥬","ingrédient","quantité"]],"steps":[["Titre court","Instruction claire","5 min"]],"swaps":[["ingrédient d'origine","remplacement healthy"]],"tip":"une astuce"}}

Pour healthy : 5 à 9 ingrédients avec quantités précises, 3 à 5 étapes, exactement 3 swaps.`;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const allowed = !origin || ALLOWED_ORIGINS.some(o => origin === o || origin.startsWith(o + ':'));
    const cors = {
      'Access-Control-Allow-Origin': origin && allowed ? origin : ALLOWED_ORIGINS[0],
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Access-Code, Authorization',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin'
    };
    const reply = (data, status = 200) => new Response(JSON.stringify(data), {
      status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
    });

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (!allowed) return reply({ ok: false, error: 'origin', detail: "Cette adresse n'est pas autorisée (ALLOWED_ORIGINS)." }, 403);

    // Comptes : /auth/...
    const path = new URL(request.url).pathname.replace(/\/+$/, '');
    if (path.startsWith('/auth')) return handleAuth(request, env, path, reply);

    const ready = !!(env && env.AI);
    const codeOk = !env.ACCESS_CODE || request.headers.get('X-Access-Code') === env.ACCESS_CODE;

    // Test de connexion depuis l'app
    if (request.method === 'GET') {
      return reply({ ok: ready, service: 'healthyremake-ai', ready, protected: !!env.ACCESS_CODE, code_ok: codeOk,
        models: MODELS.map(m => m.name), accounts: !!(env && env.USERS), error: ready ? undefined : 'binding' });
    }
    if (request.method !== 'POST') return reply({ ok: false, error: 'method' }, 405);
    if (!ready) return reply({ ok: false, error: 'binding', detail: "Ajoute le binding Workers AI nommé AI dans les réglages du Worker." }, 500);
    if (!codeOk) return reply({ ok: false, error: 'code', detail: "Code d'accès manquant ou incorrect." }, 401);

    let body;
    try { body = await request.json(); } catch { return reply({ ok: false, error: 'json' }, 400); }
    const image = typeof body.image === 'string' ? body.image : '';
    if (!/^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(image)) return reply({ ok: false, error: 'image', detail: 'Image absente ou format non pris en charge.' }, 400);
    if (image.length > MAX_IMAGE_CHARS) return reply({ ok: false, error: 'size', detail: 'Image trop lourde.' }, 413);
    const dishes = (Array.isArray(body.dishes) ? body.dishes : []).slice(0, 250)
      .map(d => String(d).replace(/[;\n\r]/g, ' ').slice(0, 60)).filter(d => /^[a-z0-9_]+=/.test(d));
    const keys = dishes.map(d => d.split('=')[0]);

    const messages = [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: [
        { type: 'text', text: userPrompt(dishes) },
        { type: 'image_url', image_url: { url: image } }
      ] }
    ];

    const models = env.MODEL ? [{ id: env.MODEL, name: env.MODEL, limit: 'max_tokens' }] : MODELS;
    let lastError = null;
    for (const model of models) {
      try {
        const out = await env.AI.run(model.id, { messages, temperature: 0.2, [model.limit]: 1500 });
        const data = parseJSON(textOf(out));
        if (!data) throw new Error('Réponse illisible du modèle');
        return reply({ ok: true, model: model.name, result: clean(data, keys) });
      } catch (e) {
        lastError = e;
      }
    }
    const detail = String((lastError && lastError.message) || lastError || 'erreur inconnue').slice(0, 300);
    const quota = /limit|quota|neuron|exceed|4006|429|daily/i.test(detail);
    return reply({ ok: false, error: quota ? 'quota' : 'ai', detail }, quota ? 429 : 502);
  }
};

/* ---------- Lecture de la réponse du modèle ---------- */
function textOf(out) {
  if (out == null) return '';
  if (typeof out === 'string') return out;
  if (out.response != null) return typeof out.response === 'string' ? out.response : JSON.stringify(out.response);
  const c = out.choices && out.choices[0];
  if (c && c.message) return typeof c.message.content === 'string' ? c.message.content : JSON.stringify(c.message.content);
  if (out.result) return textOf(out.result);
  return JSON.stringify(out);
}

function parseJSON(text) {
  if (!text) return null;
  let t = String(text).replace(/```(?:json)?/gi, '').trim();
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  t = t.slice(a, b + 1);
  try { return JSON.parse(t); } catch {}
  try { return JSON.parse(t.replace(/,\s*([}\]])/g, '$1')); } catch {}
  return null;
}

/* ---------- Nettoyage : l'app ne reçoit que des valeurs sûres ---------- */
function clean(d, keys) {
  const num = (v, max) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(max, Math.max(0, n)) : 0; };
  const str = (v, n) => (v == null ? '' : String(v)).replace(/\s+/g, ' ').trim().slice(0, n);
  const list = v => (Array.isArray(v) ? v : []);
  const o = d.original || {};
  const match = keys.includes(d.match) ? d.match : null;
  const out = {
    is_food: d.is_food !== false && d.is_food !== 'false',
    dish: str(d.dish, 80),
    emoji: str(d.emoji, 8),
    confidence: num(d.confidence, 100),
    match,
    portion: str(d.portion, 90),
    original: { kcal: num(o.kcal, 4000), p: num(o.p, 400), c: num(o.c, 600), f: num(o.f, 300) },
    detected: list(d.detected).map(x => str(typeof x === 'object' && x ? x.name : x, 40)).filter(Boolean).slice(0, 10),
    healthy: null
  };
  const h = d.healthy;
  if (!match && h && typeof h === 'object') {
    const ing = list(h.ing).map(x => Array.isArray(x) ? x : [x && x.emoji, x && (x.name || x.nom), x && (x.qty || x.quantite || x.quantity)])
      .map(([e, n, q]) => [str(e, 8) || '🥄', str(n, 60), str(q, 30) || 'selon goût']).filter(x => x[1]).slice(0, 12);
    const steps = list(h.steps).map(x => Array.isArray(x) ? x : typeof x === 'string' ? ['', x, ''] : [x && (x.title || x.titre), x && (x.text || x.texte), x && (x.time || x.duree)])
      .map(([t, p, tm], i) => [str(t, 50) || `Étape ${i + 1}`, str(p, 400), str(tm, 20) || '5 min']).filter(x => x[1]).slice(0, 8);
    const swaps = list(h.swaps).map(x => Array.isArray(x) ? x : [x && (x.from || x.avant), x && (x.to || x.apres)])
      .map(([a, b]) => [str(a, 50), str(b, 60)]).filter(x => x[0] && x[1]).slice(0, 3);
    if (ing.length >= 2 && steps.length >= 1) {
      out.healthy = {
        name: str(h.name, 90) || `${out.dish}, version healthy`,
        desc: str(h.desc, 200), time: str(h.time, 20) || '25 min', diff: str(h.diff, 20) || 'Facile', serv: str(h.serv, 20) || '1 pers.',
        kcal: num(h.kcal, 4000), p: num(h.p, 400), c: num(h.c, 600), f: num(h.f, 300),
        ing, steps, swaps, tip: str(h.tip, 240)
      };
    }
  }
  return out;
}

/* =====================================================================
   Comptes utilisateurs (e-mail + mot de passe)
   ---------------------------------------------------------------------
   Stockage : Cloudflare KV (binding USERS).
   - user:<email>   → profil, sel et empreinte du mot de passe, données synchronisées
   - sess:<jeton>   → e-mail du compte (expire tout seul au bout de 30 jours)
   - rl:<clé>       → compteur anti-force brute (expire au bout de 15 minutes)
   Les mots de passe ne sont jamais stockés : seulement une empreinte
   PBKDF2-SHA256 (100 000 itérations) avec un sel aléatoire par compte.
   ===================================================================== */
const SESSION_TTL = 60 * 60 * 24 * 30;   // 30 jours
const PBKDF2_ITER = 100000;               // maximum accepté par les Workers
const MAX_ATTEMPTS = 8;                   // essais ratés autorisés par 15 minutes
const MAX_DATA_CHARS = 60000;             // favoris + réglages synchronisés

async function handleAuth(request, env, path, reply) {
  const kv = env && env.USERS;
  if (!kv) return reply({ ok: false, error: 'accounts_off', detail: 'Ajoute le binding KV nommé USERS dans les réglages du Worker.' }, 503);
  const route = request.method + ' ' + path;
  let body = {};
  if (request.method === 'POST' || request.method === 'PUT' || request.method === 'DELETE') {
    try { body = await request.json(); } catch { body = {}; }
    if (!body || typeof body !== 'object') body = {};
  }
  const ip = request.headers.get('CF-Connecting-IP') || 'local';

  try {
    if (route === 'POST /auth/signup') {
      const email = normEmail(body.email), password = String(body.password || ''), name = cleanName(body.name);
      if (!email) return reply({ ok: false, error: 'email', detail: 'Adresse e-mail invalide.' }, 400);
      const pwErr = checkPassword(password);
      if (pwErr) return reply({ ok: false, error: 'password', detail: pwErr }, 400);
      if (await limited(kv, 'signup:' + ip, 10)) return reply({ ok: false, error: 'rate', detail: 'Trop de tentatives. Réessaie dans quelques minutes.' }, 429);
      await hit(kv, 'signup:' + ip);
      if (await kv.get('user:' + email)) return reply({ ok: false, error: 'exists', detail: 'Un compte existe déjà avec cette adresse.' }, 409);
      const salt = randomHex(16);
      const user = { id: randomHex(12), email, name, salt, hash: await hashPassword(password, salt), created: Date.now(), data: null };
      await kv.put('user:' + email, JSON.stringify(user));
      const token = await newSession(kv, email);
      return reply({ ok: true, token, user: publicUser(user) });
    }

    if (route === 'POST /auth/login') {
      const email = normEmail(body.email), password = String(body.password || '');
      if (!email || !password) return reply({ ok: false, error: 'invalid', detail: 'E-mail ou mot de passe incorrect.' }, 401);
      if (await limited(kv, 'login:' + email, MAX_ATTEMPTS) || await limited(kv, 'ip:' + ip, MAX_ATTEMPTS * 4))
        return reply({ ok: false, error: 'rate', detail: 'Trop de tentatives. Réessaie dans 15 minutes.' }, 429);
      const user = await getUser(kv, email);
      const ok = user ? safeEqual(await hashPassword(password, user.salt), user.hash) : (await hashPassword(password, 'x'), false);
      if (!ok) {
        await hit(kv, 'login:' + email); await hit(kv, 'ip:' + ip);
        return reply({ ok: false, error: 'invalid', detail: 'E-mail ou mot de passe incorrect.' }, 401);
      }
      const token = await newSession(kv, email);
      return reply({ ok: true, token, user: publicUser(user), data: user.data || null });
    }

    // Routes qui demandent d'être connecté
    const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
    const email = /^[a-f0-9]{64}$/.test(token) ? await kv.get('sess:' + token) : null;
    const user = email ? await getUser(kv, email) : null;
    if (!user) return reply({ ok: false, error: 'session', detail: 'Session expirée, reconnecte-toi.' }, 401);

    if (route === 'GET /auth/me') return reply({ ok: true, user: publicUser(user), data: user.data || null });

    if (route === 'PUT /auth/data') {
      const data = body.data && typeof body.data === 'object' ? body.data : null;
      const raw = JSON.stringify(data);
      if (!data || raw.length > MAX_DATA_CHARS) return reply({ ok: false, error: 'data', detail: 'Données invalides ou trop lourdes.' }, 400);
      user.data = { ...data, savedAt: Date.now() };
      await kv.put('user:' + user.email, JSON.stringify(user));
      return reply({ ok: true, savedAt: user.data.savedAt });
    }

    if (route === 'PUT /auth/profile') {
      user.name = cleanName(body.name);
      await kv.put('user:' + user.email, JSON.stringify(user));
      return reply({ ok: true, user: publicUser(user) });
    }

    if (route === 'POST /auth/password') {
      if (await limited(kv, 'login:' + user.email, MAX_ATTEMPTS)) return reply({ ok: false, error: 'rate', detail: 'Trop de tentatives. Réessaie dans 15 minutes.' }, 429);
      if (!safeEqual(await hashPassword(String(body.current || ''), user.salt), user.hash)) {
        await hit(kv, 'login:' + user.email);
        return reply({ ok: false, error: 'invalid', detail: 'Mot de passe actuel incorrect.' }, 401);
      }
      const pwErr = checkPassword(String(body.password || ''));
      if (pwErr) return reply({ ok: false, error: 'password', detail: pwErr }, 400);
      user.salt = randomHex(16);
      user.hash = await hashPassword(String(body.password), user.salt);
      await kv.put('user:' + user.email, JSON.stringify(user));
      return reply({ ok: true });
    }

    if (route === 'POST /auth/logout') { await kv.delete('sess:' + token); return reply({ ok: true }); }

    if (route === 'DELETE /auth/account') {
      if (!safeEqual(await hashPassword(String(body.password || ''), user.salt), user.hash)) {
        await hit(kv, 'login:' + user.email);
        return reply({ ok: false, error: 'invalid', detail: 'Mot de passe incorrect.' }, 401);
      }
      await kv.delete('user:' + user.email);
      await kv.delete('sess:' + token);
      return reply({ ok: true });
    }

    return reply({ ok: false, error: 'route' }, 404);
  } catch (e) {
    const detail = String((e && e.message) || e).slice(0, 200);
    const quota = /limit|quota|exceed|429/i.test(detail);
    return reply({ ok: false, error: quota ? 'quota' : 'server', detail: quota ? 'Limite gratuite du jour atteinte, réessaie demain.' : detail }, quota ? 429 : 500);
  }
}

function normEmail(v) {
  const e = String(v || '').trim().toLowerCase();
  return e.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) ? e : '';
}
function cleanName(v) { return String(v || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40); }
function checkPassword(p) {
  if (p.length < 8) return 'Le mot de passe doit faire au moins 8 caractères.';
  if (p.length > 200) return 'Mot de passe trop long.';
  if (!/[A-Za-z]/.test(p) || !/[0-9]/.test(p)) return 'Le mot de passe doit contenir au moins une lettre et un chiffre.';
  return '';
}
function publicUser(u) { return { email: u.email, name: u.name || '', created: u.created }; }
async function getUser(kv, email) { const raw = await kv.get('user:' + email); return raw ? JSON.parse(raw) : null; }
async function newSession(kv, email) {
  const token = randomHex(32);
  await kv.put('sess:' + token, email, { expirationTtl: SESSION_TTL });
  return token;
}
function randomHex(bytes) { const a = new Uint8Array(bytes); crypto.getRandomValues(a); return [...a].map(b => b.toString(16).padStart(2, '0')).join(''); }
async function hashPassword(password, saltHex) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const salt = enc.encode(saltHex);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITER }, key, 256);
  return [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, '0')).join('');
}
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
async function limited(kv, key, max) { return (+(await kv.get('rl:' + key)) || 0) >= max; }
async function hit(kv, key) {
  const n = (+(await kv.get('rl:' + key)) || 0) + 1;
  await kv.put('rl:' + key, String(n), { expirationTtl: 900 });
}
