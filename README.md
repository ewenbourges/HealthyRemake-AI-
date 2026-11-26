# HealthyRemake AI

Tes fast-foods préférés, revisités en version healthy.

Application web mobile-first : scanne ou importe la photo d'un plat, et l'app propose une recette healthy en 4 niveaux (Fidèle au goût, Équilibré, Fitness, Ultra protéiné), avec calories, macros, ingrédients, étapes et comparaison avec l'original.

- 125 plats, 500 recettes, 14 catégories
- Scan avec l'appareil photo du téléphone, et **vraie reconnaissance des plats par IA** (facultatif, gratuit) : voir [serveur-ia/README.md](serveur-ia/README.md)
- **Recettes :** nombre de portions réglable, mode cuisine pas à pas avec minuteurs, partage en image, avis et notes
- **Organisation :** liste de courses rangée par rayon, planning des repas de la semaine, recettes perso avec calcul automatique des macros
- **Suivi :** besoins du jour (profil nutritionnel), journal des repas, séries, badges, calories économisées
- **Trouver quoi manger :** filtres (calories, protéines, temps, régime), régime et allergies, recette au hasard, scan du frigo
- **Compte :** connexion par e-mail et mot de passe (ou Google), tout est synchronisé entre appareils, mot de passe oublié par e-mail
- **App installable**, utilisable hors ligne, mise à jour automatique, notifications (nouvelles vidéos, minuteurs)
- Onglet vidéos avec les dernières recettes healthy des créateurs YouTube
- Thème clair / sombre, mentions légales et politique de confidentialité

L'app tient dans `index.html` (HTML, CSS et JavaScript). À côté : `sw.js` (hors ligne et mises à jour), `manifest.webmanifest` et les icônes (installation sur l'écran d'accueil). Sans serveur, tout fonctionne sur l'appareil et l'analyse photo est simulée. Le serveur gratuit Cloudflare (dossier `serveur-ia`) ajoute la vraie IA, les comptes et les avis publics. Les valeurs nutritionnelles restent des estimations.

## En ligne

https://ewenbourges.github.io/HealthyRemake-AI-/

Dernière mise à jour : 26 novembre 2026 (20 nouvelles fonctionnalités)
