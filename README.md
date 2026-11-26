# HealthyRemake AI

Tes fast-foods préférés, revisités en version healthy.

Application web mobile-first : scanne ou importe la photo d'un plat, et l'app propose une recette healthy en 4 niveaux (Fidèle au goût, Équilibré, Fitness, Ultra protéiné), avec calories, macros, ingrédients, étapes et comparaison avec l'original.

- 125 plats, 500 recettes, 14 catégories
- Scan avec l'appareil photo du téléphone
- **Vraie reconnaissance des plats par IA** (facultatif, gratuit) : voir [serveur-ia/README.md](serveur-ia/README.md)
- Onglet vidéos avec les dernières recettes healthy des créateurs YouTube
- Thème clair / sombre

Tout tient dans un seul fichier `index.html` (HTML, CSS et JavaScript), sans serveur ni base de données. Sans serveur IA, l'analyse est simulée ; avec le serveur gratuit Cloudflare Workers AI (dossier `serveur-ia`), l'app reconnaît vraiment le plat photographié. Les valeurs nutritionnelles restent des estimations.

## En ligne

https://ewenbourges.github.io/HealthyRemake-AI-/

Dernière mise à jour : 26 novembre 2026 (nouvelle typographie)
