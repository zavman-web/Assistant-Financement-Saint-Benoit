# Assistant Financement — Mairie de Saint-Benoît

Assistant conversationnel destiné aux élus de la majorité, pour identifier
des pistes de cofinancement (local/national/européen) à partir d'un projet
ou d'une problématique décrite en langage naturel. Voir `CADRAGE_ASSISTANT.md`
pour le contenu exact du cadrage envoyé à Claude.

**Ce projet est distinct de VEILLE-FI** (l'outil de veille automatique des
appels à projets). Les deux outils répondent à des besoins différents — voir
la discussion du 27/06/2026 qui a mené à l'abandon de VEILLE-FI au profit de
celui-ci pour l'usage "analyse de projet par un élu".

---

## 1. Architecture

```
assistant-financement/
├── index.template.html      <- SOURCE du HTML (à éditer)
├── index.html                <- GÉNÉRÉ par build.mjs (ne pas éditer à la main)
├── build.mjs                  <- Script qui injecte CADRAGE_ASSISTANT.md dans index.html
├── CADRAGE_ASSISTANT.md       <- SOURCE DE VÉRITÉ du system prompt envoyé à Claude
├── api/
│   └── chat.js                <- Fonction serverless Vercel (proxy sécurisé vers l'API Claude)
└── test/
    ├── test_api_chat.mjs       <- Tests de la fonction serverless (cas d'erreur)
    └── test_securite_interface.js  <- Tests XSS de l'interface (jsdom)
```

**Principe de fonctionnement :**
1. L'élu ouvre `index.html` dans son navigateur (hébergé sur Vercel).
2. Il tape sa question. Le JavaScript de la page envoie la question +
   l'historique de la conversation à `/api/chat` (la fonction serverless).
3. `api/chat.js` lit la clé API Anthropic depuis une variable d'environnement
   (jamais visible côté navigateur), appelle l'API Claude avec le cadrage
   de `CADRAGE_ASSISTANT.md` en system prompt, et renvoie la réponse.
4. La page affiche la réponse, en échappant correctement tout contenu pour
   éviter une injection XSS (voir section Sécurité ci-dessous).

**Pourquoi cette architecture et pas un simple lien vers Claude.ai ?**
Le but est que l'élu n'ait jamais besoin de savoir ce qu'est Claude, ni de
copier-coller un texte de cadrage — il ouvre une page, il pose sa question,
il a sa réponse. Voir l'historique de discussion du 27/06/2026 pour le détail
des alternatives écartées (lien direct vers claude.ai, copier-coller manuel).

---

## 2. Avant de déployer : modifier le cadrage si besoin

Si le contenu de `CADRAGE_ASSISTANT.md` doit changer, **ne jamais éditer
`index.html` directement** — il sera écrasé au prochain build. Éditer
`CADRAGE_ASSISTANT.md`, puis relancer :

```bash
node build.mjs
```

Ça régénère `index.html` à partir de `index.template.html` + le cadrage à
jour.

---

## 3. Déploiement sur Vercel — étapes manuelles (à faire une fois)

### 3.1. Obtenir une clé API Anthropic

1. Aller sur https://platform.claude.com (ou console.anthropic.com, qui
   redirige vers le même endroit).
2. Créer un compte développeur (différent du compte claude.ai personnel —
   voir la discussion du 27/06/2026 sur la distinction entre abonnement
   claude.ai et API).
3. Ajouter un moyen de paiement (Settings → Billing). Sans ça, la clé créée
   ne fonctionnera pas. Définir une limite de dépense mensuelle pour éviter
   toute surprise (ex. 10€/mois, largement au-dessus de l'usage attendu de
   1 à 4€/mois estimé pour ce projet).
4. Aller dans API Keys → Create Key. **Copier la clé immédiatement** — elle
   ne sera plus jamais affichée en clair après cet écran. La coller dans un
   endroit sûr temporairement (elle sera collée dans Vercel à l'étape 3.3).

### 3.2. Créer le projet sur Vercel

1. Aller sur https://vercel.com et se connecter avec le compte GitHub
   existant (`zavman-web`, déjà utilisé pour VEILLE-FI) — pas besoin de
   créer un nouveau compte séparé.
2. Pousser ce dossier `assistant-financement/` dans un nouveau dépôt GitHub
   (séparé du dépôt VEILLE-FI `Assistant-Financement` — vérifier le nom
   exact pour ne pas créer de confusion entre les deux projets malgré la
   ressemblance de nom).
3. Dans Vercel, cliquer "Add New" → "Project", puis sélectionner ce nouveau
   dépôt GitHub.
4. Vercel devrait détecter automatiquement la structure (pas de framework,
   juste `index.html` + `api/`) — aucune configuration de build n'est
   nécessaire (pas de `vercel.json` dans ce projet, volontairement, voir
   section Architecture).

### 3.3. Configurer la clé API comme variable d'environnement

**Ne jamais mettre la clé API directement dans le code.** Dans le tableau
de bord Vercel du projet :
1. Settings → Environment Variables.
2. Ajouter une variable nommée exactement `ANTHROPIC_API_KEY`, valeur = la
   clé copiée à l'étape 3.1.
3. Optionnel mais recommandé : ajouter aussi `ORIGINE_AUTORISEE` avec la
   future URL Vercel du projet (ex. `https://assistant-financement-xxx.vercel.app`)
   pour restreindre les requêtes CORS à cette seule origine.
4. Redéployer le projet pour que la variable soit prise en compte (Vercel
   le propose automatiquement après l'ajout d'une variable).

### 3.4. Vérifier le déploiement

1. Ouvrir l'URL fournie par Vercel après déploiement.
2. Cliquer sur l'un des exemples de question proposés sur la page, ou taper
   une question test simple.
3. Vérifier qu'une réponse arrive (peut prendre quelques secondes, surtout
   si l'assistant fait une recherche web).
4. Si une erreur apparaît, voir la section Dépannage ci-dessous.

---

## 4. Transfert de paiement futur (mairie reprend le financement)

Voir la discussion du 27/06/2026. Deux options, la plus simple étant :
1. Remplacer le moyen de paiement enregistré sur le compte
   platform.claude.com existant (pas de changement de code).
2. Alternative plus propre administrativement : créer un nouveau compte au
   nom de la mairie, générer une nouvelle clé API, et la remplacer dans
   Vercel (Settings → Environment Variables → modifier `ANTHROPIC_API_KEY`).
   Aucune ligne de code n'a besoin de changer dans les deux cas — c'est
   précisément pour ça que la clé n'est jamais codée en dur dans `api/chat.js`.

---

## 5. Sécurité — points vérifiés

- **Clé API jamais exposée côté navigateur** : uniquement lue côté serveur
  (`api/chat.js`) depuis une variable d'environnement.
- **Échappement XSS testé avec un vrai DOM (jsdom)**, pas seulement une
  relecture de code — voir `test/test_securite_interface.js`. Deux types de
  vulnérabilité ont été spécifiquement testés (suite aux leçons apprises sur
  VEILLE-FI/generer_html.py) :
  - Une réponse de l'assistant contenant une balise `<script>` brute (par
    exemple si une recherche web ramène du contenu piégé) est affichée comme
    texte inerte, jamais exécutée.
  - Un lien Markdown malveillant tentant de s'échapper de l'attribut `href`
    via un guillemet est neutralisé, pas transformé en lien cliquable.
- **Validation du format de requête côté serveur** avant tout appel à l'API
  Anthropic (taille de message, présence du champ `messages`) — voir
  `test/test_api_chat.mjs`.
- **CORS restreint** (variable `ORIGINE_AUTORISEE`) pour limiter qui peut
  appeler la fonction serverless depuis un navigateur.

## 6. Limites connues et points de vigilance

- **Pas de limite d'usage par utilisateur** : n'importe qui ayant l'URL de
  la page peut poser des questions, sans authentification. C'est un choix
  délibéré (cohérent avec la décision sur la confidentialité de VEILLE-FI :
  ces informations n'ont pas besoin d'être protégées), mais ça veut dire
  qu'un usage abusif (volontaire ou non) ferait grimper la facture API. Si
  ça devient un problème réel, ajouter une limite de débit (rate limiting)
  dans `api/chat.js` serait la prochaine étape — pas fait dans cette V1 par
  souci de simplicité, conformément au principe "ne pas construire une
  usine à gaz" acté le 27/06/2026.
- **Pas de persistance de l'historique** : chaque rechargement de page perd
  la conversation en cours. C'est volontaire pour rester simple (pas de
  base de données), mais à signaler aux élus.
- **Le cadrage n'a pas encore été testé avec un vrai usage répété** — les
  mots-clés et l'ordre de recherche recommandés dans
  `CADRAGE_ASSISTANT.md` sont une première version, à affiner après les
  premiers retours réels d'élus (même logique que les corrections
  successives faites sur VEILLE-FI après son premier vrai usage).

## 7. Dépannage

| Symptôme | Cause probable | Action |
|---|---|---|
| "Service temporairement indisponible" | `ANTHROPIC_API_KEY` non configurée ou invalide sur Vercel | Vérifier Settings → Environment Variables, redéployer |
| "Le service de réponse a rencontré une erreur" | Erreur côté API Anthropic (quota dépassé, modèle indisponible) | Vérifier les logs Vercel (`vercel logs`) et le tableau de bord platform.claude.com |
| Aucune réponse, page bloquée sur l'indicateur de chargement | Erreur réseau ou timeout | Vérifier la console du navigateur (F12), vérifier les logs de la fonction sur Vercel |
| Réponse étrange ou hors-sujet | Le modèle n'a pas bien suivi le cadrage | Revoir `CADRAGE_ASSISTANT.md`, relancer `node build.mjs`, redéployer |
