// api/chat.js
//
// Fonction serverless Vercel qui sert de proxy sécurisé vers l'API Claude.
//
// RÔLE DE CE FICHIER (voir ASSISTANT_FINANCEMENT.md pour le contexte complet) :
// La page web ne contient jamais la clé API Anthropic — elle envoie la
// question de l'élu à CETTE fonction, qui tourne sur les serveurs de Vercel,
// lit la clé API depuis une variable d'environnement (jamais visible dans le
// code source ni dans le navigateur), appelle l'API Claude, et renvoie la
// réponse. C'est le mécanisme standard de "proxy serverless" pour protéger
// une clé API dans une application web statique.
//
// IMPORTANT (transfert de paiement futur) : la clé API est lue UNIQUEMENT
// depuis process.env.ANTHROPIC_API_KEY, jamais codée en dur ici. Le jour où
// la mairie reprend le paiement (cf. cahier des charges), il suffit de
// remplacer la valeur de cette variable d'environnement dans les paramètres
// du projet Vercel — aucune ligne de ce fichier n'a besoin de changer.

export const config = {
  runtime: "nodejs",
};

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_API_VERSION = "2023-06-01";
const MODELE = "claude-sonnet-4-6";
const MAX_TOKENS = 4096;

// Limite de sécurité basique : évite qu'une requête malformée ou abusive ne
// consomme un volume de tokens disproportionné. Pas une vraie protection
// anti-abus (cf. limites documentées dans ASSISTANT_FINANCEMENT.md), juste
// un garde-fou simple.
const TAILLE_MAX_MESSAGE_CARACTERES = 8000;

export default async function handler(request) {
  // CORS : on n'autorise les requêtes que depuis notre propre page GitHub
  // Pages. Ajusté lors du déploiement réel avec le vrai domaine.
  const enTetesCommuns = {
    "Access-Control-Allow-Origin": process.env.ORIGINE_AUTORISEE || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: enTetesCommuns });
  }

  if (request.method !== "POST") {
    return new Response(
      JSON.stringify({ erreur: "Méthode non autorisée. Utiliser POST." }),
      { status: 405, headers: { ...enTetesCommuns, "Content-Type": "application/json" } },
    );
  }

  let corpsRequete;
  try {
    corpsRequete = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ erreur: "Corps de requête invalide (JSON attendu)." }),
      { status: 400, headers: { ...enTetesCommuns, "Content-Type": "application/json" } },
    );
  }

  const { messages, system } = corpsRequete;

  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response(
      JSON.stringify({ erreur: "Le champ 'messages' doit être un tableau non vide." }),
      { status: 400, headers: { ...enTetesCommuns, "Content-Type": "application/json" } },
    );
  }

  const tailleTotale = messages.reduce(
    (total, m) => total + (typeof m.content === "string" ? m.content.length : 0),
    0,
  );
  if (tailleTotale > TAILLE_MAX_MESSAGE_CARACTERES) {
    return new Response(
      JSON.stringify({ erreur: "Message trop long. Merci de raccourcir votre question." }),
      { status: 400, headers: { ...enTetesCommuns, "Content-Type": "application/json" } },
    );
  }

  // Vérification de la clé API APRÈS la validation du format de la requête.
  // CORRIGÉ après un test réel : l'ordre inverse faisait que toute requête
  // malformée (JSON invalide, champ manquant...) retombait sur le message
  // générique "service indisponible" plutôt que sur son vrai message
  // d'erreur — la validation du format doit toujours primer, indépendamment
  // de la disponibilité de la clé.
  const cleApi = process.env.ANTHROPIC_API_KEY;
  if (!cleApi) {
    // Ne JAMAIS révéler de détail technique au client final sur la cause
    // exacte (pas de stack trace, pas de nom de variable d'environnement) —
    // seulement logué côté serveur pour le diagnostic.
    console.error("ANTHROPIC_API_KEY n'est pas configurée sur ce déploiement Vercel.");
    return new Response(
      JSON.stringify({ erreur: "Service temporairement indisponible. Réessayez plus tard." }),
      { status: 500, headers: { ...enTetesCommuns, "Content-Type": "application/json" } },
    );
  }

  try {
    const reponseAnthropic = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": cleApi,
        "anthropic-version": ANTHROPIC_API_VERSION,
      },
      body: JSON.stringify({
        model: MODELE,
        max_tokens: MAX_TOKENS,
        system: system || undefined,
        messages: messages,
        tools: [
          {
            type: "web_search_20250305",
            name: "web_search",
          },
        ],
      }),
    });

    const donnees = await reponseAnthropic.json();

    if (!reponseAnthropic.ok) {
      console.error("Erreur API Anthropic :", reponseAnthropic.status, JSON.stringify(donnees));
      return new Response(
        JSON.stringify({ erreur: "Le service de réponse a rencontré une erreur. Réessayez." }),
        { status: 502, headers: { ...enTetesCommuns, "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify(donnees), {
      status: 200,
      headers: { ...enTetesCommuns, "Content-Type": "application/json" },
    });
  } catch (erreur) {
    console.error("Erreur réseau lors de l'appel à Anthropic :", erreur);
    return new Response(
      JSON.stringify({ erreur: "Impossible de contacter le service. Réessayez plus tard." }),
      { status: 502, headers: { ...enTetesCommuns, "Content-Type": "application/json" } },
    );
  }
}
