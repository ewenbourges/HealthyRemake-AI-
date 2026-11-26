# Brancher la vraie IA sur HealthyRemake AI

L'app est hébergée sur GitHub Pages, qui ne sert que des fichiers. Elle ne peut donc pas contenir de clé secrète, puisque tout le monde peut lire son code. La solution est un petit serveur gratuit chez **Cloudflare**, un « Worker ». Il reçoit ta photo, la fait analyser par un modèle d'IA qui voit les images (**Mistral Small 3.1**, via Workers AI) et renvoie le résultat à l'app.

- **Prix :** 0 €, sans carte bancaire. L'offre gratuite donne 10 000 « neurones » par jour, soit environ 80 à 110 analyses selon mes calculs.
- **Clé d'API :** aucune. Le Worker utilise directement l'IA de ton compte Cloudflare.
- **Durée :** environ 10 minutes, une seule fois.

```
Téléphone (app sur GitHub Pages) ──photo──▶ Worker Cloudflare ──▶ Workers AI (Mistral Small 3.1)
                                 ◀─résultat JSON─┘
```

## 1. Créer le compte
Va sur https://dash.cloudflare.com/sign-up et crée un compte gratuit avec ton e-mail, puis confirme l'adresse.

## 2. Créer le Worker
1. Dans le menu de gauche, ouvre **Workers & Pages** (parfois appelé **Compute (Workers)**).
2. Clique sur **Create**, puis sur **Create Worker** (ou **Start with Hello World!**).
3. Nomme-le `healthyremake-ai`, puis clique sur **Deploy**.

## 3. Coller le code
1. Sur la page du Worker, clique sur **Edit code**.
2. Efface tout le code présent et colle le contenu du fichier [`worker.js`](worker.js) de ce dossier.
3. Clique sur **Deploy**.

## 4. Relier l'IA (étape obligatoire)
1. Retourne sur la page du Worker et ouvre l'onglet **Settings**, puis **Bindings**.
2. Clique sur **Add**, puis choisis **Workers AI**.
3. Dans **Variable name**, écris exactement `AI` (en majuscules).
4. Enregistre et déploie.

## 5. Code d'accès (facultatif, conseillé)
L'adresse du serveur se lit dans l'app, donc n'importe qui pourrait l'utiliser et consommer ton quota du jour. Ça ne te coûterait rien, mais tes propres analyses seraient bloquées.

Pour l'éviter :
1. Va dans **Settings**, puis **Variables and Secrets**, puis **Add**.
2. Choisis le type **Secret**.
3. Mets le nom `ACCESS_CODE` et la valeur de ton choix (par exemple `brocoli-2026`).
4. Déploie.

## 6. Récupérer l'adresse
L'adresse ressemble à `https://healthyremake-ai.ton-sous-domaine.workers.dev`. Elle s'affiche sur la page du Worker, rubrique **Domains & Routes**.

Ouvre-la dans ton navigateur. Tu dois voir une ligne qui commence par `{"ok":true,"service":"healthyremake-ai"`.

## 7. Activer l'IA dans l'app
1. Dans l'app, ouvre l'écran **Montre-nous ton plat**, puis touche le bouton **✦** en haut à droite.
2. Colle l'adresse du serveur, et ton code d'accès si tu en as créé un.
3. Touche **Tester** : le message « ✓ Serveur prêt » doit s'afficher.
4. Touche **Enregistrer**. Le point vert sur le bouton ✦ indique que l'IA est active.

Ces réglages sont gardés sur chaque appareil. Pour que l'IA soit active partout sans rien saisir, mets l'adresse dans `AI_DEFAULT_URL` en haut du code de l'IA dans `index.html`. Le code d'accès, lui, ne va jamais dans le dépôt.

## 8. Activer les comptes (onglet Compte)
L'onglet **Compte** permet de créer un compte avec un e-mail et un mot de passe. Les favoris, l'objectif et les réglages sont alors retrouvés sur tous les appareils. Les comptes sont gérés par ce même Worker et stockés dans **Cloudflare KV**, gratuit lui aussi.

1. Mets à jour le code du Worker : **Edit code**, remplace tout par le nouveau [`worker.js`](worker.js), puis **Deploy**.
2. Dans le menu de gauche, ouvre **Storage & Databases**, puis **KV** (parfois **Workers KV**).
3. Clique sur **Create** (ou **Create a namespace**), nomme-le `healthyremake-users`, puis valide.
4. Retourne sur la page du Worker : **Settings**, puis **Bindings**, puis **Add** et choisis **KV namespace**.
5. Dans **Variable name**, écris exactement `USERS` (en majuscules) et choisis `healthyremake-users`. Enregistre et déploie.
6. Ouvre l'adresse du Worker dans ton navigateur : la ligne doit maintenant contenir `"accounts":true`.

Bon à savoir sur les comptes :
- **Sécurité :** les mots de passe ne sont jamais stockés. Le serveur garde seulement une empreinte PBKDF2-SHA256 (100 000 itérations, sel aléatoire par compte). Après 8 essais ratés, la connexion est bloquée 15 minutes.
- **Sessions :** on reste connecté 30 jours sur chaque appareil. « Se déconnecter » ferme la session sur le serveur.
- **Quota gratuit KV :** 100 000 lectures et 1 000 écritures par jour. Une connexion ou une synchronisation coûte 1 à 3 écritures, c'est largement assez pour un petit groupe d'utilisateurs.
- **Mot de passe oublié :** la réinitialisation par e-mail n'existe pas encore, car il faudrait un service d'envoi d'e-mails. Un utilisateur connecté peut changer son mot de passe depuis **Compte**.

| Message dans l'onglet Compte | Solution |
|---|---|
| Le serveur Cloudflare doit être mis à jour | Refais l'étape 1 de cette section (avec la dernière version de `worker.js`). |
| Il manque le stockage KV « USERS » | Refais les étapes 2 à 5. |

## 9. « Mot de passe oublié » par e-mail (facultatif)
Sans ce réglage, le bouton « Mot de passe oublié » affiche que l'envoi d'e-mails n'est pas activé. Pour l'activer, on utilise **Resend**, gratuit jusqu'à 100 e-mails par jour :
1. Crée un compte sur https://resend.com, puis ouvre **API Keys** → **Create API Key** et copie la clé (elle commence par `re_`).
2. Sur la page du Worker : **Settings** → **Variables and Secrets** → **Add** → type **Secret**, nom `RESEND_API_KEY`, colle la clé. Déploie.
3. **Expéditeur :**
   - Sans nom de domaine, Resend n'envoie qu'à **l'adresse de ton propre compte Resend** : pratique pour tester, mais pas pour les autres utilisateurs.
   - Pour écrire à tout le monde, ajoute ton domaine dans Resend (**Domains** → **Add Domain**, puis les enregistrements DNS indiqués). Crée ensuite une variable `MAIL_FROM` dans le Worker, par exemple `HealthyRemake <bonjour@ton-domaine.fr>`.

L'utilisateur reçoit un code à 6 chiffres valable 15 minutes. Changer ou réinitialiser le mot de passe déconnecte automatiquement les autres appareils.

## 10. « Continuer avec Google » (facultatif)
1. Va sur https://console.cloud.google.com, crée un projet, puis ouvre **API et services** → **Écran de consentement OAuth** : type **Externe**, nom de l'app, ton e-mail. Enregistre.
2. **Identifiants** → **Créer des identifiants** → **ID client OAuth** → type **Application Web**.
3. Dans **Origines JavaScript autorisées**, ajoute `https://ewenbourges.github.io`, puis crée et copie l'**ID client** (il finit par `.apps.googleusercontent.com`).
4. Sur la page du Worker : **Settings** → **Variables and Secrets** → **Add** → type **Text**, nom `GOOGLE_CLIENT_ID`, colle l'ID. Déploie.
5. Dans `index.html`, colle le même ID dans `const GOOGLE_CLIENT_ID = '';` puis publie : le bouton apparaît dans l'onglet Compte.

« Continuer avec Apple » n'est pas proposé : il exige un compte développeur Apple payant (99 $ par an).

## 11. Parler au coach dans l'app installée
Safari et Chrome ont leur propre reconnaissance vocale. Ce n'est pas le cas de l'app ajoutée à l'écran d'accueil d'un iPhone (ni de Firefox) : là, l'app enregistre ta phrase et le Worker la transcrit avec **Whisper** (Workers AI, inclus dans l'offre gratuite).
- Rien à configurer : il suffit que le Worker ait le dernier `worker.js`. Le binding `AI` sert déjà pour l'analyse des photos.
- Raccourci dans l'app : touche 🎙️ dans le coach. Si le serveur n'est pas à jour, l'app propose **Copier le code du serveur**, puis il ne reste qu'à le coller dans **Edit code** et à faire **Deploy**.
- L'adresse du Worker doit afficher `"transcribe":true`.

## 12. Coach IA complet
Le coach de l'app utilise un vrai modèle de langage sur le Worker (route `/coach`) : **Mistral Small 3.1**, avec **Llama 3.3 70B** en secours.
- L'app lui envoie la conversation, ton suivi du jour (déjà mangé, reste à manger, objectif, profil), ton régime, ton frigo et le catalogue de ses 125 recettes.
- Il répond à toutes les questions de nutrition, propose les recettes de l'app qui conviennent et invente une recette complète si besoin, qu'on peut garder dans « Mes recettes ».
- Rien à configurer en plus du binding `AI`. L'adresse du Worker doit afficher `"coach":true`.
- Il utilise le même quota gratuit Workers AI que l'analyse des photos, soit environ une centaine de questions par jour en plus des analyses. Sans serveur à jour, le coach répond avec son moteur simplifié intégré à l'app.

## Ce que la mise à jour du Worker ajoute aussi
- **Scan du frigo** (`/fridge`) : l'IA liste les aliments visibles sur la photo, puis l'app propose les recettes faisables. Il utilise le même quota Workers AI que l'analyse des plats.
- **Transcription de la voix** (`/transcribe`) : Whisper, pour le coach et le mode cuisine dans l'app installée.
- **Avis publics** (`/reviews`) : les notes et commentaires des membres connectés, stockés dans le même KV `USERS`.
- Ouvre l'adresse du Worker pour vérifier : la ligne affiche `"accounts":true`, `"mail":true/false`, `"google":true/false`, `"fridge":true`.

## Ce que fait l'analyse
- **Plat présent dans l'app** (125 plats) : l'app affiche sa recette healthy en 4 niveaux. Une carte « Analyse IA réelle » donne le plat reconnu, la confiance, la portion, les calories estimées et les ingrédients repérés.
- **Plat absent de l'app** : l'IA écrit une recette healthy complète (ingrédients, étapes, remplacements, astuce).
- **Pas de plat sur la photo** : l'app te le signale.
- **Plat choisi à la main** dans les puces : pas d'appel à l'IA, ce qui économise le quota.
- **Panne ou quota atteint** : l'app passe automatiquement à l'analyse simulée et explique pourquoi.

## En cas de souci
| Message dans l'app | Solution |
|---|---|
| Serveur injoignable | Vérifie l'adresse : elle finit par `.workers.dev`. |
| Le binding Workers AI « AI » manque | Refais l'étape 4. |
| Code d'accès incorrect | Saisis le même code que le secret `ACCESS_CODE`. |
| Le serveur refuse l'adresse de l'app | Ajoute l'adresse de ton site dans `ALLOWED_ORIGINS`, en haut de `worker.js`. |
| Quota gratuit du jour épuisé | Il se recharge à minuit UTC, soit 1 h du matin en France l'hiver et 2 h l'été. |

## Bon à savoir
- Si Mistral Small 3.1 n'est plus disponible un jour, le serveur essaie automatiquement **Gemma 4**. Tu peux aussi imposer un autre modèle Workers AI qui accepte les images, avec une variable `MODEL`.
- Tes photos sont envoyées à ton serveur Cloudflare uniquement pour l'analyse, réduites à 640 px.
- Les calories et macros sont des estimations à partir d'une photo : elles restent indicatives.
