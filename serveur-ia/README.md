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
