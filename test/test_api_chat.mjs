import handler from '../api/chat.js';

// Petit polyfill minimal pour simuler une Request Web Standard, comme le
// fait l'environnement Vercel réel.
function creerRequete(method, body, headers = {}) {
  return new Request("https://example.com/api/chat", {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

async function test(nom, requete, statutAttendu) {
  const reponse = await handler(requete);
  const corps = await reponse.json().catch(() => null);
  const ok = reponse.status === statutAttendu;
  console.log(`${ok ? "OK" : "FAIL"}: ${nom} -> statut ${reponse.status} (attendu ${statutAttendu})`, corps);
  return ok;
}

(async () => {
  let tousOk = true;

  // Cas 1 : méthode GET non autorisée
  tousOk = await test("Méthode GET refusée", creerRequete("GET"), 405) && tousOk;

  // Cas 2 : OPTIONS (CORS preflight) accepté
  const reponseOptions = await handler(creerRequete("OPTIONS"));
  const okOptions = reponseOptions.status === 204;
  console.log(okOptions ? "OK" : "FAIL", ": OPTIONS preflight -> statut", reponseOptions.status, "(attendu 204)");
  tousOk = okOptions && tousOk;

  // Cas 3 : JSON invalide
  const requeteJsonInvalide = new Request("https://example.com/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "ceci n'est pas du JSON valide {{{",
  });
  tousOk = await test("JSON invalide", requeteJsonInvalide, 400) && tousOk;

  // Cas 4 : champ messages manquant
  tousOk = await test("Champ messages manquant", creerRequete("POST", { system: "test" }), 400) && tousOk;

  // Cas 5 : messages vide
  tousOk = await test("Messages vide", creerRequete("POST", { messages: [] }), 400) && tousOk;

  // Cas 6 : message trop long
  const messageTropLong = "a".repeat(9000);
  tousOk = await test(
    "Message trop long",
    creerRequete("POST", { messages: [{ role: "user", content: messageTropLong }] }),
    400,
  ) && tousOk;

  // Cas 7 : pas de clé API configurée (cas réel attendu dans cet environnement de test)
  tousOk = await test(
    "Clé API manquante (ANTHROPIC_API_KEY non définie)",
    creerRequete("POST", { messages: [{ role: "user", content: "Bonjour" }] }),
    500,
  ) && tousOk;

  console.log("\n=== " + (tousOk ? "TOUS LES TESTS PASSENT" : "ÉCHEC") + " ===");
  process.exit(tousOk ? 0 : 1);
})();
