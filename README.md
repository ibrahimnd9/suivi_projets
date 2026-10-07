# SYNAP-SUIVI

Plateforme de suivi et de pilotage des projets — SYNAPSYS, Pôle Suivi-Évaluation.

Stack : Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · Prisma 7 · PostgreSQL · Docker.

## État d'avancement

| Étape | Contenu | État |
|---|---|---|
| 1. Socle | Connexion, rôles, utilisateurs, directions & pôles, référentiels, journal de traçabilité, Docker | ✅ |
| 2. Projets | Portefeuille (tableau et Kanban), création de projet, fiche projet à onglets, rubriques personnalisées | ✅ |
| 3. Planification | Phases, activités, tâches, jalons, dépendances, Gantt, retards, avancement calculé | ✅ |
| 4. Temps | Fiches de temps hebdomadaires, validation N+1, consolidation, analyse de charge | ✅ |
| 5. Suivi | Indicateurs (KPI), diligences, risques et problèmes, budget | ✅ |
| 6. Pilotage | Tableau de bord, score de santé, « Mes actions », alertes, rapports et exports | ✅ |
| Phase 2 — 2.1 | Référentiel stratégique : plan, axes, objectifs, résultats attendus | ✅ |
| Phase 2 — 2.2 à 2.6 | PTBA, liaison PTBA ↔ projets, KPI harmonisés, évaluations, tableau de bord DG/DGA | en cours |
| 7. Modules complémentaires | Livrables, documents (GED), réunions et décisions, RACI, calendrier, import CSV | ✅ |

## Lancer en développement (Windows)

Prérequis : Node.js 24.

```bash
npm install
npm run db:dev        # démarre PostgreSQL local (Prisma Dev) en arrière-plan
npx prisma migrate deploy
npm run db:seed       # référentiels par défaut + compte administrateur
npm run dev
```

Puis ouvrir http://localhost:3000 et se connecter avec le compte défini dans `.env`
(`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`). Un nouveau mot de passe est demandé à la première connexion.

Si la base locale est arrêtée (redémarrage du PC) : `npx prisma dev start synap-suivi`.
`SHADOW_DATABASE_URL` (port principal + 1) est nécessaire à `prisma migrate dev`.
L'adresse de connexion s'affiche avec `npx prisma dev ls` ; elle doit correspondre à `DATABASE_URL` dans `.env`.

Commandes utiles : `npm run typecheck`, `npm run lint`, `npm run db:migrate` (après modification du schéma),
`npm run db:studio` (explorateur de données).

## Déployer sur le serveur interne (Docker)

```bash
cp .env.production.example .env.production   # puis renseigner les mots de passe
docker compose --env-file .env.production up -d --build
```

Services : `db` (PostgreSQL 17), `migrate` (migrations + seed, puis s'arrête), `app` (port 3000),
`backup` (sauvegarde quotidienne dans `./backups`, conservée 14 jours).

Restauration d'une sauvegarde :

```bash
docker compose exec -T db pg_restore -U synap -d synap_suivi --clean < backups/<fichier>.dump
```

L'application doit être servie en HTTPS derrière un proxy (IIS, Nginx, Traefik…). Les cookies de session
sont marqués `Secure` en production ; pour un test en HTTP pur, mettre `INSECURE_COOKIES=true`.

## Règles de calcul (étape 3)

- **Avancement d'un projet** : moyenne des éléments de planning pondérée par leur durée prévue,
  recalculée à chaque modification. Une tâche sans sous-élément garde l'avancement saisi.
- **Retard** : date de fin dépassée alors que l'élément n'est ni terminé ni annulé.
- **Dépendances** : Fin → Début, Début → Début, Fin → Fin, avec décalage en jours. Les boucles sont refusées.
  Les liens non respectés sont signalés et « Replanifier automatiquement » décale les éléments concernés
  en conservant leur durée.
- **Fiche de temps** : une fiche par personne et par semaine (lundi → dimanche). Saisie au quart d'heure,
  24 h maximum par jour, temps hors projet possible. Cycle Brouillon → Soumise → Validée / Rejetée ;
  la fiche est verrouillée dès la soumission, un rejet motivé la rouvre, et le valideur peut rouvrir une fiche validée.
- **Validation** : par le supérieur hiérarchique (N+1) uniquement, ou par l'administrateur.
- **Charge d'un projet** : temps prévu = la valeur la plus élevée entre les charges de l'équipe et celles du planning.
  Une dérive est signalée quand le taux de consommation dépasse l'avancement de plus de 15 points.
- **Taux de réalisation d'un KPI** : `(actuelle − référence) / (cible − référence) × 100`. Sans référence :
  `actuelle / cible` à la hausse, `cible / actuelle` à la baisse. Deux seuils par indicateur (alerte 80 %,
  atteinte 95 % par défaut) donnent l'état : atteint, en alerte ou non atteint.
- **Criticité d'un risque** : probabilité × impact, échelles de 1 à 5. Faible jusqu'à 6, moyen de 8 à 12,
  critique à partir de 15, avec une matrice 5 × 5.
- **Diligence en retard** : échéance dépassée et action ni réalisée ni annulée. Passer au statut « Réalisée »
  renseigne automatiquement la date de clôture.
- **Budget** : taux de consommation = dépenses réalisées ÷ budget révisé × 100 ; reste disponible = budget révisé
  − engagements − dépenses. Alerte au-delà de 90 % de consommation.
- **Score de santé (0 à 100)** : moyenne pondérée de six composantes — planning, budget, avancement, risques,
  indicateurs, ressources. Les poids et les seuils de couleur (vert ≥ 75, rouge < 50) se règlent dans
  Administration → Paramètres. Une composante sans donnée est ignorée et son poids réparti sur les autres.
- **Alertes** : recalculées au maximum toutes les 30 minutes à l'ouverture de l'application, et dédupliquées.
  Couvrent les tâches et jalons en retard ou proches, les diligences en retard, les risques critiques, le seuil
  budgétaire, la fin de projet proche, les fiches de temps non soumises et celles à valider.
- **Jalons** : état calculé (à venir, échéance proche à 7 jours, dépassé, atteint, atteint en retard).

## Sécurité (étape 1)

- Mots de passe hachés (bcrypt, coût 12) ; politique : 10 caractères, majuscule, minuscule, chiffre, caractère spécial.
- Mot de passe temporaire généré par l'administrateur, changement obligatoire à la première connexion.
- Verrouillage du compte 15 min après 5 échecs de connexion.
- Sessions stockées en base (seule l'empreinte SHA-256 du jeton est conservée), cookie `HttpOnly`,
  expiration glissante (`SESSION_TTL_MINUTES`, 8 h par défaut), révoquées à la désactivation du compte.
- Contrôle des droits côté serveur sur chaque page et chaque action.
- Journal : connexions, échecs, créations et modifications champ par champ (ancienne → nouvelle valeur).

## Gestion documentaire

Les fichiers sont stockés hors base, dans le dossier `UPLOAD_DIR` (`./uploads` en développement, volume Docker
`uploads` en production, inclus dans la sauvegarde quotidienne). Formats acceptés : PDF, Word, Excel, PowerPoint,
texte, CSV, images et ZIP ; 20 Mo maximum par fichier (`MAX_UPLOAD_MB`). Chaque téléchargement vérifie les droits
sur le projet. Déposer une nouvelle version conserve l'ancienne dans l'historique.

## Rapports et exports

- Rapport de projet et rapport de portefeuille en page imprimable (« Imprimer » puis « Enregistrer au format PDF »).
- Sept exports CSV lisibles par Excel (séparateur point-virgule, accents et virgule décimale) : projets, planning,
  temps, indicateurs, diligences, risques, budget. Chaque export est limité aux projets visibles par l'utilisateur.
- L'envoi des notifications par email et l'intégration Microsoft Teams restent à brancher sur un serveur SMTP.

## Structure

```
prisma/                 schéma, migrations, seed
src/app/login           connexion
src/app/(app)           pages authentifiées (accueil, compte, administration)
src/app/(app)/portefeuille  liste des projets et création
src/app/(app)/projets/[id]  fiche projet (synthèse, informations, équipe, rubriques)
src/lib/auth            sessions, mots de passe, permissions
src/lib/projects.ts     visibilité, code projet, rubriques applicables
src/lib/planning.ts     arborescence, avancement calculé, retards, dépendances
src/lib/timesheets.ts   fiches de temps, consolidation, charge et dérive
src/lib/monitoring.ts   KPI, criticité des risques, retards de diligence, budget
src/lib/health.ts       score de santé pondéré d'un projet
src/lib/alerts.ts       analyse automatique et génération des notifications
src/lib/settings.ts     pondérations et seuils paramétrables
src/lib/storage.ts      stockage des pièces jointes (contrôles de type et de taille)
src/lib/ptba.ts         activités PTBA : avancement consolidé, budget, indicateurs
src/lib/strategy-labels.ts libellés de la chaîne stratégique et du PTBA
src/lib/custom-fields.ts types de rubriques, validation et affichage
src/lib/audit.ts        journal de traçabilité
src/components          composants d'interface partagés
public/brand            logos SYNAP-SUIVI
```
