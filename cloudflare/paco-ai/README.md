# Paco AI — Cloudflare Worker

Questa cartella contiene una **copia di riferimento** del codice del Worker Paco AI, conservata insieme al progetto ParrotWorld.

## Importante: natura della copia

Il file `worker.js` è una versione di riferimento ricostruita sulla base della configurazione e dei test effettuati nel progetto. Non è un'esportazione verificata direttamente dalla dashboard Cloudflare: prima di usarlo per ripristinare o sostituire il Worker online, confrontalo con il codice pubblicato su Cloudflare.

## Configurazione

- Worker: `paco-ai`
- Endpoint attualmente usato dal sito: `https://paco-ai.chiccovision.workers.dev/`
- Modello Gemini configurato nel codice: `gemini-3.5-flash-lite`
- Variabile segreta richiesta: `GEMINI_API_KEY`

## Sicurezza

1. La chiave `GEMINI_API_KEY` va salvata nei **Secrets** del Worker su Cloudflare.
2. Non inserirla mai in `worker.js`, in `app.js`, nell'HTML o in altri file del repository.
3. Il valore CORS è attualmente `*` nella copia di riferimento: prima del lancio pubblico va sostituito con il dominio effettivo di ParrotWorld.
4. Questa copia non implementa un limite di richieste lato server. Il limite di tre domande per visita è gestito dal browser nel file principale `app.js`.

## Ripristino

Apri il Worker `paco-ai` nella dashboard Cloudflare, confronta il codice online con `worker.js`, verifica il nome del modello e i parametri, quindi configura nuovamente il secret `GEMINI_API_KEY` senza copiarlo nel repository.

## Test

Una richiesta GET all'indirizzo del Worker restituisce lo stato del servizio. Una richiesta POST accetta JSON nel formato:

```json
{
  "message": "Qual è il pappagallo più grande del mondo?",
  "language": "it"
}
```

La risposta positiva contiene il campo `answer`.
