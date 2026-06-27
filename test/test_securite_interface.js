const { JSDOM } = require("jsdom");
const fs = require("fs");

const html = fs.readFileSync("../index.html", "utf-8");

async function testerScenario(nom, reponseSimulee, verifications) {
  let alerteDeclenchee = false;
  let requeteFetchInterceptee = null;

  const dom = new JSDOM(html, {
    runScripts: "dangerously",
    resources: "usable",
    url: "https://example.com/",
  });

  dom.window.alert = (msg) => {
    alerteDeclenchee = true;
    console.log("  ALERTE DÉCLENCHÉE :", msg);
  };

  // Interception de fetch pour simuler la réponse de l'API sans appel réseau réel.
  dom.window.fetch = async (url, options) => {
    requeteFetchInterceptee = { url, options };
    return {
      ok: true,
      json: async () => reponseSimulee,
    };
  };

  return new Promise((resolve) => {
    setTimeout(async () => {
      const document = dom.window.document;
      const champ = document.getElementById("champ-question");
      const bouton = document.getElementById("bouton-envoyer");

      champ.value = "Question de test";
      bouton.click();

      // Laisser le temps à la promesse async de se résoudre.
      await new Promise((r) => setTimeout(r, 200));

      const filConversation = document.getElementById("fil-conversation");
      const dernierMessage = filConversation.querySelector(".message.assistant:last-child .bulle, .message.erreur:last-child .bulle");

      console.log(`\n--- ${nom} ---`);
      console.log("HTML du dernier message:", dernierMessage ? dernierMessage.innerHTML.slice(0, 300) : "(aucun)");

      const resultat = verifications({ alerteDeclenchee, dernierMessage, document });
      console.log(resultat ? "OK" : "FAIL");
      resolve(resultat);
    }, 100);
  });
}

(async () => {
  let tousOk = true;

  // Scénario 1 : la réponse de l'API contient une balise <script> brute —
  // doit être affichée comme texte inerte, jamais exécutée.
  const ok1 = await testerScenario(
    "Réponse contenant <script>alert(1)</script>",
    { content: [{ type: "text", text: "Voici une piste <script>alert(1)</script> de financement." }] },
    ({ alerteDeclenchee, dernierMessage }) => {
      const contientBaliseScriptBrute = dernierMessage && dernierMessage.querySelector("script") !== null;
      return !alerteDeclenchee && !contientBaliseScriptBrute;
    },
  );
  tousOk = ok1 && tousOk;

  // Scénario 2 : la réponse contient un lien Markdown légitime — doit
  // devenir une vraie balise <a> cliquable.
  const ok2 = await testerScenario(
    "Réponse avec lien Markdown légitime",
    { content: [{ type: "text", text: "Voir [le dispositif FEADER](https://www.departement974.fr/aides-feader) pour plus d'infos." }] },
    ({ dernierMessage }) => {
      const lien = dernierMessage && dernierMessage.querySelector("a");
      return lien && lien.getAttribute("href") === "https://www.departement974.fr/aides-feader";
    },
  );
  tousOk = ok2 && tousOk;

  // Scénario 3 : tentative d'injection via une URL de lien Markdown malveillante
  // contenant un guillemet, pour échapper de l'attribut href.
  const ok3 = await testerScenario(
    "Lien Markdown avec tentative d'évasion d'attribut",
    { content: [{ type: "text", text: 'Voir [ce lien](https://example.com/x" onmouseover="alert(2)) pour plus.' }] },
    ({ alerteDeclenchee, dernierMessage }) => {
      const lien = dernierMessage && dernierMessage.querySelector("a");
      const onmouseoverPresent = lien ? lien.hasAttribute("onmouseover") : false;
      return !alerteDeclenchee && !onmouseoverPresent;
    },
  );
  tousOk = ok3 && tousOk;

  console.log("\n=== " + (tousOk ? "TOUS LES TESTS DE SÉCURITÉ PASSENT" : "ÉCHEC") + " ===");
  process.exit(tousOk ? 0 : 1);
})();
