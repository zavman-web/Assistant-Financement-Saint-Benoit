#!/usr/bin/env node
// build.mjs
//
// Injecte le contenu de CADRAGE_ASSISTANT.md dans index.html, en remplaçant
// le placeholder CADRAGE_SYSTEME_PLACEHOLDER par le texte réel, sérialisé en
// chaîne JavaScript sûre (JSON.stringify échappe correctement guillemets,
// retours à ligne, etc. — pas de risque de casser la syntaxe JS comme on
// l'a appris avec generer_html.py dans VEILLE-FI).
//
// Usage : node build.mjs
// Produit : index.html est modifié en place avec le cadrage injecté.
// Ne PAS committer le résultat de cette injection comme étant la source de
// vérité du cadrage — CADRAGE_ASSISTANT.md reste la source, ce script doit
// être relancé après toute modification de ce fichier.

import { readFileSync, writeFileSync } from "node:fs";

const CHEMIN_CADRAGE = "./CADRAGE_ASSISTANT.md";
const CHEMIN_HTML_SOURCE = "./index.template.html";
const CHEMIN_HTML_SORTIE = "./index.html";
const PLACEHOLDER = "/* CADRAGE_SYSTEME_PLACEHOLDER */ \"\"";

function construire() {
  const cadrage = readFileSync(CHEMIN_CADRAGE, "utf-8");
  const htmlSource = readFileSync(CHEMIN_HTML_SOURCE, "utf-8");

  if (!htmlSource.includes(PLACEHOLDER)) {
    console.error(
      `ERREUR : le placeholder "${PLACEHOLDER}" n'a pas été trouvé dans ${CHEMIN_HTML_SOURCE}. ` +
      "Le fichier source a peut-être été modifié sans mettre à jour ce script.",
    );
    process.exit(1);
  }

  // JSON.stringify produit une chaîne JS valide et correctement échappée
  // (guillemets, retours à ligne, etc.) — bien plus sûr qu'une concaténation
  // manuelle, qui avait causé un bug réel dans generer_html.py (VEILLE-FI)
  // avec des échappements en cascade Python/JS.
  const cadrageSerialise = JSON.stringify(cadrage);
  const htmlFinal = htmlSource.replace(PLACEHOLDER, cadrageSerialise);

  writeFileSync(CHEMIN_HTML_SORTIE, htmlFinal, "utf-8");
  console.log(`OK : ${CHEMIN_HTML_SORTIE} généré avec le cadrage de ${CHEMIN_CADRAGE} (${cadrage.length} caractères).`);
}

construire();
