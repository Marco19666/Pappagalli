/**
 * Paco AI - Cloudflare Worker
 * Modello verificato nel progetto: gemini-3.5-flash-lite
 *
 * NOTA: copia di riferimento ricostruita per il repository.
 * Prima di usarla per sostituire il Worker pubblicato, confrontarla con
 * il codice attualmente presente nella dashboard Cloudflare.
 *
 * Segreto richiesto in Cloudflare:
 *   GEMINI_API_KEY
 *
 * Non inserire mai la chiave API in questo file o nel frontend.
 */

const MODEL = "gemini-3.5-flash-lite";
const ALLOWED_ORIGIN = "*"; // Da restringere al dominio ufficiale prima del lancio pubblico.
const MAX_MESSAGE_LENGTH = 1000;
const REQUEST_TIMEOUT_MS = 20000;

const SYSTEM_INSTRUCTION = `
Sei Paco, l'assistente di ParrotWorld.
Rispondi esclusivamente a domande pertinenti ai pappagalli:
specie, comportamento, habitat, alimentazione, benessere, salute generale,
conservazione e informazioni scientifiche.

Se la domanda non riguarda i pappagalli, spiega gentilmente che puoi aiutare
solo su questo argomento.

Rispondi nella lingua indicata dalla richiesta. Se non è riconosciuta,
usa l'italiano. Usa un tono amichevole, chiaro e prudente.
Non formulare diagnosi veterinarie e non sostituire il parere di un
veterinario esperto in animali esotici. In caso di possibili problemi di
salute, consiglia di contattare un veterinario.
`.trim();

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json; charset=utf-8"
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: corsHeaders()
  });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (request.method === "GET") {
      return jsonResponse({
        status: "online",
        service: "Paco AI",
        message: "Ciao! Sono Paco. Sono pronto a parlare di pappagalli!"
      });
    }

    if (request.method !== "POST") {
      return jsonResponse({ error: "Metodo non supportato." }, 405);
    }

    if (!env.GEMINI_API_KEY) {
      return jsonResponse({ error: "Configurazione API mancante." }, 500);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: "Richiesta JSON non valida." }, 400);
    }

    const message = typeof body.message === "string" ? body.message.trim() : "";
    const language = typeof body.language === "string" ? body.language : "it";

    if (!message) {
      return jsonResponse({ error: "Scrivi una domanda." }, 400);
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
      return jsonResponse({ error: "La domanda è troppo lunga." }, 400);
    }

    const prompt = `Lingua della risposta: ${language}.
Domanda dell'utente: ${message}`;

    const endpoint =
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${env.GEMINI_API_KEY}`;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      let response;
      try {
        response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            system_instruction: {
              parts: [{ text: SYSTEM_INSTRUCTION }]
            },
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 700
            }
          }),
          signal: controller.signal
        });
      } finally {
        clearTimeout(timeout);
      }

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        return jsonResponse({
          error: "Il servizio AI non è al momento disponibile.",
          details: result.error?.message || `Errore Gemini (${response.status}).`
        }, response.status >= 500 ? 503 : response.status);
      }

      const answer = result.candidates?.[0]?.content?.parts
        ?.map(part => part.text || "")
        .join("\n")
        .trim();

      if (!answer) {
        return jsonResponse({ error: "Non ho ricevuto una risposta valida da Gemini." }, 502);
      }

      return jsonResponse({ answer });
    } catch (error) {
      const timedOut = error?.name === "AbortError";
      return jsonResponse({
        error: timedOut ? "La risposta sta impiegando troppo tempo." : "Errore di comunicazione con il servizio AI.",
        details: timedOut ? "Timeout della richiesta." : (error?.message || "Errore sconosciuto.")
      }, timedOut ? 504 : 502);
    }
  }
};
