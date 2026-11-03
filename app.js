
"use strict";

const $ = (selector) => document.querySelector(selector);
const STORAGE_KEYS = {
  favorites: "parrotworld_favorites_v1",
  journal: "parrotworld_journal_v1",
  language: "parrotworld_language_v1"
};

const SUPPORTED_LANGUAGES = ["it", "en", "es", "fr", "de"];
const WIKIPEDIA_LINK_LABELS = {
  it: "Consulta la scheda su Wikipedia",
  en: "View the Wikipedia article",
  es: "Consultar el artículo en Wikipedia",
  fr: "Consulter l’article sur Wikipédia",
  de: "Wikipedia-Artikel ansehen"
};
let currentLanguage = localStorage.getItem(STORAGE_KEYS.language) || "it";
if (!SUPPORTED_LANGUAGES.includes(currentLanguage)) currentLanguage = "it";
let currentSpeciesId = null;

let species = [];
let favorites = loadStorage(STORAGE_KEYS.favorites, []);
let journal = loadStorage(STORAGE_KEYS.journal, []);
let showFavoritesOnly = false;

function loadStorage(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function saveStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function parseDatabase(text) {
  return text.split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith("#"))
    .map(line => {
      const [
        id, common, scientific, category, origin, size, weight,
        lifespan, noise, sociability, talking, commitment,
        experience, housing, diet, care, source
      ] = line.split("|").map(value => value.trim());

      return {
        id, common, scientific, category, origin, size, weight,
        lifespan, noise, sociability, talking, commitment,
        experience, housing, diet, care, source
      };
    })
    .filter(item => item.id && item.common && item.scientific);
}

async function loadSpecies() {
  const grid = $("#speciesGrid");
  try {
    const response = await fetch("database.txt", { cache: "no-cache" });
    if (!response.ok) throw new Error("Impossibile caricare database.txt");
    species = parseDatabase(await response.text());

    if (!species.length) throw new Error("Il database non contiene specie valide.");

    $("#speciesCount").textContent = species.length;
    populateCategories();
    renderSpecies();
    renderWorldMap();
  } catch (error) {
    grid.innerHTML = `
      <div class="loading-state">
        <strong>Non riesco a caricare il catalogo.</strong>
        <p>${escapeHTML(error.message)}</p>
        <p>Controlla che database.txt sia nella stessa cartella di index.html.</p>
      </div>`;
    $("#resultsCount").textContent = "Catalogo non disponibile";
  }
}

function populateCategories() {
  const select = $("#categoryFilter");
  const categories = [...new Set(species.map(item => item.category))]
    .filter(Boolean).sort((a, b) => a.localeCompare(b, "it"));

  select.innerHTML = '<option value="">Tutte le categorie</option>';
  categories.forEach(category => {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    select.appendChild(option);
  });
}

function getFilteredSpecies() {
  const query = $("#searchInput").value.trim().toLocaleLowerCase("it");
  const category = $("#categoryFilter").value;
  const experience = $("#experienceFilter").value;
  const sort = $("#sortFilter").value;

  let result = species.filter(item => {
    const matchesSearch = !query ||
      `${item.common} ${item.scientific} ${item.origin} ${item.category}`
        .toLocaleLowerCase("it").includes(query);

    const matchesCategory = !category || item.category === category;
    const matchesExperience = !experience || item.experience === experience;
    const matchesFavorite = !showFavoritesOnly || favorites.includes(item.id);

    return matchesSearch && matchesCategory && matchesExperience && matchesFavorite;
  });

  result.sort((a, b) => {
    if (sort === "size") return sizeValue(a.size) - sizeValue(b.size);
    if (sort === "lifespan") return lifespanValue(b.lifespan) - lifespanValue(a.lifespan);
    return a.common.localeCompare(b.common, "it");
  });

  return result;
}

function sizeValue(value = "") {
  const match = value.match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function lifespanValue(value = "") {
  const match = value.match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function renderSpecies() {
  const grid = $("#speciesGrid");
  const results = getFilteredSpecies();

  $("#resultsCount").textContent =
    `${results.length} ${results.length === 1 ? "specie trovata" : "specie trovate"}`;

  $("#emptyState").classList.toggle("hidden", results.length !== 0);

  if (!results.length) {
    grid.innerHTML = "";
    return;
  }

  grid.innerHTML = results.map(item => `
    <article class="species-card">
      <div class="species-media" data-image-id="${escapeHTML(item.id)}">
        <div class="species-image-fallback" role="img"
             aria-label="Immagine non ancora disponibile per ${escapeHTML(item.common)}">🦜</div>
      </div>
      <div class="species-card-body">
        <div class="card-topline">
          <span class="species-category">${escapeHTML(item.category)}</span>
          <button class="favorite-button ${favorites.includes(item.id) ? "is-favorite" : ""}"
            data-favorite="${escapeHTML(item.id)}"
            aria-label="${favorites.includes(item.id) ? "Rimuovi dai preferiti" : "Aggiungi ai preferiti"}">
            ${favorites.includes(item.id) ? "♥" : "♡"}
          </button>
        </div>
        <h3>${escapeHTML(item.common)}</h3>
        <div class="scientific-name">${escapeHTML(item.scientific)}</div>
        <div class="species-tags">
          <span>↔ ${escapeHTML(item.size)}</span>
          <span>◷ ${escapeHTML(item.lifespan)}</span>
          <span>Impegno: ${escapeHTML(item.commitment)}</span>
        </div>
        <div class="card-bottom">
          <span>${escapeHTML(item.experience)}</span>
          <button data-detail="${escapeHTML(item.id)}">Scopri di più ↗</button>
        </div>
      </div>
    </article>
  `).join("");

  grid.querySelectorAll("[data-favorite]").forEach(button => {
    button.addEventListener("click", () => toggleFavorite(button.dataset.favorite));
  });

  grid.querySelectorAll("[data-detail]").forEach(button => {
    button.addEventListener("click", () => openSpecies(button.dataset.detail));
  });

  results.forEach(item => loadSpeciesImage(item));
}

async function loadSpeciesImage(item) {
  const container = document.querySelector(`[data-image-id="${CSS.escape(item.id)}"]`);
  if (!container || container.dataset.loaded === "true") return;
  container.dataset.loaded = "true";

  try {
    const endpoint = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(item.scientific.replaceAll(" ", "_"))}`;
    const response = await fetch(endpoint);
    if (!response.ok) throw new Error("Immagine non disponibile");

    const data = await response.json();
    const imageUrl = data.thumbnail?.source || data.originalimage?.source;
    if (!imageUrl) throw new Error("Nessuna immagine");

    const image = document.createElement("img");
    image.className = "species-image";
    image.loading = "lazy";
    image.alt = `${item.common} (${item.scientific})`;
    image.src = imageUrl;
    image.referrerPolicy = "no-referrer";
    image.onerror = () => {
      container.innerHTML = `<div class="species-image-fallback" role="img" aria-label="Immagine non disponibile">🦜</div>`;
    };

    container.replaceChildren(image);
  } catch {
    // Mantiene l'illustrazione segnaposto se Wikipedia non restituisce una foto.
  }
}

function toggleFavorite(id) {
  favorites = favorites.includes(id)
    ? favorites.filter(value => value !== id)
    : [...favorites, id];

  saveStorage(STORAGE_KEYS.favorites, favorites);
  renderSpecies();
}

function openSpecies(id) {
  const item = species.find(entry => entry.id === id);
  if (!item) return;
  currentSpeciesId = id;

  const detail = $("#speciesDetail");
  detail.innerHTML = `
    <div class="section-kicker">${escapeHTML(item.category)}</div>
    <h2 style="margin:12px 0 5px">${escapeHTML(item.common)}</h2>
    <p class="scientific-name">${escapeHTML(item.scientific)}</p>
    <div class="dialog-image species-image-fallback">🦜</div>
    <div class="detail-meta">
      ${detailCell("Origine", item.origin)}
      ${detailCell("Dimensioni", item.size)}
      ${detailCell("Peso indicativo", item.weight)}
      ${detailCell("Longevità indicativa", item.lifespan)}
      ${detailCell("Rumorosità", item.noise)}
      ${detailCell("Socialità", item.sociability)}
      ${detailCell("Capacità vocale", item.talking)}
      ${detailCell("Impegno", item.commitment)}
      ${detailCell("Esperienza", item.experience)}
      ${detailCell("Alloggio", item.housing)}
    </div>
    <h3>Alimentazione</h3>
    <p class="detail-text">${escapeHTML(item.diet)}</p>
    <h3>Cura e comportamento</h3>
    <p class="detail-text">${escapeHTML(item.care)}</p>
    <p class="detail-text"><strong>Nota:</strong> dimensioni, peso e longevità sono valori orientativi, variabili tra individui e sottospecie. Verifica sempre le informazioni con fonti specialistiche.</p>
    <a class="sound-link" href="https://xeno-canto.org/explore?query=${encodeURIComponent(item.scientific)}" target="_blank" rel="noopener noreferrer">♫ Cerca e ascolta registrazioni del verso su Xeno-canto ↗</a>
    <p class="audio-note">Si apre l'archivio di registrazioni naturalistiche: la disponibilità dipende dalla specie e i file sono pubblicati dai contributori.</p>
    <a class="source-link" href="${wikipediaSearchUrl(item)}" target="_blank" rel="noopener noreferrer">${WIKIPEDIA_LINK_LABELS[currentLanguage]} ↗</a>
  `;

  const dialog = $("#speciesDialog");
  const dialogImage = detail.querySelector(".dialog-image");

  loadDetailImage(item, dialogImage);
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
}

function detailCell(label, value) {
  return `<div><span>${escapeHTML(label)}</span><strong>${escapeHTML(value || "Dato non disponibile")}</strong></div>`;
}

async function loadDetailImage(item, container) {
  try {
    const endpoint = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(item.scientific.replaceAll(" ", "_"))}`;
    const response = await fetch(endpoint);
    if (!response.ok) return;
    const data = await response.json();
    const imageUrl = data.thumbnail?.source || data.originalimage?.source;
    if (!imageUrl) return;

    const img = document.createElement("img");
    img.className = "dialog-image";
    img.alt = `${item.common} (${item.scientific})`;
    img.src = imageUrl;
    img.onerror = () => { container.textContent = "🦜"; };
    container.replaceWith(img);
  } catch {
    // Il segnaposto resta visibile.
  }
}

function wikipediaSearchUrl(item) {
  const language = SUPPORTED_LANGUAGES.includes(currentLanguage) ? currentLanguage : "it";
  const query = `${item.common} ${item.scientific}`.trim();
  return `https://${language}.wikipedia.org/w/index.php?search=${encodeURIComponent(query)}`;
}

function setupLanguageSelector() {
  const selector = $("#languageSelect");
  if (!selector) return;
  selector.value = currentLanguage;
  document.documentElement.lang = currentLanguage;
  selector.addEventListener("change", () => {
    currentLanguage = SUPPORTED_LANGUAGES.includes(selector.value) ? selector.value : "it";
    localStorage.setItem(STORAGE_KEYS.language, currentLanguage);
    document.documentElement.lang = currentLanguage;
    if (currentSpeciesId) openSpecies(currentSpeciesId);
  });
}

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

function setupFilters() {
  ["searchInput", "categoryFilter", "experienceFilter", "sortFilter"].forEach(id => {
    $("#" + id).addEventListener(id === "searchInput" ? "input" : "change", renderSpecies);
  });

  $("#resetFilters").addEventListener("click", () => {
    $("#searchInput").value = "";
    $("#categoryFilter").value = "";
    $("#experienceFilter").value = "";
    $("#sortFilter").value = "name";
    showFavoritesOnly = false;
    $("#favoritesOnly").classList.remove("active");
    renderSpecies();
  });

  $("#favoritesOnly").addEventListener("click", () => {
    showFavoritesOnly = !showFavoritesOnly;
    $("#favoritesOnly").classList.toggle("active", showFavoritesOnly);
    renderSpecies();
  });
}

function setupDialog() {
  const dialog = $("#speciesDialog");
  $("#dialogClose").addEventListener("click", () => dialog.close());

  dialog.addEventListener("click", event => {
    if (event.target === dialog) dialog.close();
  });

  document.addEventListener("keydown", event => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      $("#searchInput").focus();
      document.querySelector("#esplora").scrollIntoView({ behavior: "smooth" });
    }
  });
}

function setupMenu() {
  const toggle = $("#menuToggle");
  const nav = $("#mainNav");

  toggle.addEventListener("click", () => {
    const isOpen = nav.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(isOpen));
    toggle.setAttribute("aria-label", isOpen ? "Chiudi menu" : "Apri menu");
  });

  nav.querySelectorAll("a").forEach(link => {
    link.addEventListener("click", () => {
      nav.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
      toggle.setAttribute("aria-label", "Apri menu");
    });
  });
}

function setupWeightCalculator() {
  $("#calculateWeight").addEventListener("click", () => {
    const oldWeight = Number($("#oldWeight").value);
    const newWeight = Number($("#newWeight").value);
    const output = $("#weightResult");

    if (!(oldWeight > 0) || !(newWeight > 0)) {
      output.textContent = "Inserisci entrambi i pesi, maggiori di zero.";
      return;
    }

    const difference = newWeight - oldWeight;
    const percentage = difference / oldWeight * 100;
    const direction = difference > 0 ? "aumento" : difference < 0 ? "diminuzione" : "nessuna variazione";

    output.textContent =
      `${direction}: ${Math.abs(difference).toFixed(1)} g (${Math.abs(percentage).toFixed(1)}%).`;
  });
}

const quiz = [
  {
    question: "Qual è il nome dell'ordine a cui appartengono i pappagalli?",
    answers: ["Passeriformi", "Psittaciformi", "Galliformi"],
    correct: 1,
    explanation: "I pappagalli appartengono all'ordine degli Psittaciformi."
  },
  {
    question: "Quale aspetto è fondamentale per il benessere di un pappagallo?",
    answers: ["Solo una gabbia decorativa", "Stimoli, spazio e interazione", "Un'alimentazione composta solo da semi"],
    correct: 1,
    explanation: "Arricchimento ambientale, movimento e interazione sono importanti per il benessere."
  },
  {
    question: "A chi rivolgersi per un problema di salute?",
    answers: ["A un veterinario esperto in animali esotici", "A un forum online", "A un negozio di animali"],
    correct: 0,
    explanation: "La valutazione sanitaria deve essere affidata a un professionista qualificato."
  },
  {
    question: "Che cosa bisogna verificare prima di detenere una specie protetta?",
    answers: ["Il colore del piumaggio", "La normativa e gli eventuali documenti CITES", "La popolarità sui social"],
    correct: 1,
    explanation: "Per molte specie possono essere necessari documenti e verifiche secondo la normativa applicabile."
  }
];

let quizIndex = 0;

function setupQuiz() {
  renderQuiz();

  $("#nextQuestion").addEventListener("click", () => {
    quizIndex = (quizIndex + 1) % quiz.length;
    renderQuiz();
  });
}

function renderQuiz() {
  const question = quiz[quizIndex];
  $("#quizQuestion").textContent = question.question;
  $("#quizResult").textContent = "";
  $("#nextQuestion").classList.add("hidden");

  const options = $("#quizOptions");
  options.innerHTML = "";

  question.answers.forEach((answer, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = answer;
    button.addEventListener("click", () => {
      [...options.children].forEach((option, optionIndex) => {
        option.disabled = true;
        if (optionIndex === question.correct) option.classList.add("correct");
        else if (optionIndex === index) option.classList.add("wrong");
      });

      const correct = index === question.correct;
      $("#quizResult").textContent =
        `${correct ? "✓ Esatto! " : "Non proprio. "}${question.explanation}`;
      $("#nextQuestion").classList.remove("hidden");
    });
    options.appendChild(button);
  });
}

function setupComparison() {
  const first = $("#compareFirst");
  const second = $("#compareSecond");
  const output = $("#comparisonResult");
  if (!first || !second || !output) return;

  const fields = [
    ["Categoria", "category"], ["Origine", "origin"], ["Dimensioni", "size"],
    ["Peso", "weight"], ["Longevità", "lifespan"], ["Rumorosità", "noise"],
    ["Socialità", "sociability"], ["Capacità vocale", "talking"],
    ["Impegno", "commitment"], ["Esperienza", "experience"]
  ];

  function fillSelect(select) {
    select.innerHTML = species.map(item =>
      `<option value="${escapeHTML(item.id)}">${escapeHTML(item.common)}</option>`
    ).join("");
  }

  function render() {
    const a = species.find(item => item.id === first.value);
    const b = species.find(item => item.id === second.value);
    if (!a || !b) {
      output.textContent = "Il catalogo è in caricamento.";
      return;
    }
    output.innerHTML = `
      <div class="comparison-head"><strong>${escapeHTML(a.common)}</strong><strong>${escapeHTML(b.common)}</strong></div>
      ${fields.map(([label, key]) => `
        <div class="comparison-row"><span>${label}</span><span>${escapeHTML(a[key] || "Dato non disponibile")}</span><span>${escapeHTML(b[key] || "Dato non disponibile")}</span></div>
      `).join("")}
    `;
  }

  const populate = () => {
    if (!species.length || first.options.length) return;
    fillSelect(first);
    fillSelect(second);
    if (species.length > 1) second.selectedIndex = 1;
    render();
  };
  first.addEventListener("change", render);
  second.addEventListener("change", render);
  // La funzione viene richiamata dopo il caricamento del catalogo.
  populate();
  if (!species.length) {
    const grid = $("#speciesGrid");
    const observer = new MutationObserver(() => {
      if (species.length) { populate(); observer.disconnect(); }
    });
    observer.observe(grid, { childList: true, subtree: true });
  }
}

const photoQuizState = { answer: null, score: 0, answered: false };

async function setupPhotoQuiz() {
  const imageBox = $("#photoQuizImage");
  const optionsBox = $("#photoQuizOptions");
  const result = $("#photoQuizResult");
  const next = $("#nextPhotoQuestion");
  if (!imageBox || !optionsBox || !result || !next) return;

  async function loadQuestion() {
    if (species.length < 4) {
      imageBox.textContent = "Il catalogo non è ancora pronto.";
      return;
    }
    photoQuizState.answered = false;
    photoQuizState.answer = null;
    result.textContent = "";
    next.classList.add("hidden");
    optionsBox.innerHTML = "";
    imageBox.textContent = "Caricamento fotografia…";

    const shuffled = [...species].sort(() => Math.random() - 0.5);
    let target = null;
    let imageUrl = "";
    for (const candidate of shuffled.slice(0, 12)) {
      try {
        const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(candidate.scientific.replaceAll(" ", "_"))}`;
        const response = await fetch(url);
        if (!response.ok) continue;
        const data = await response.json();
        imageUrl = data.thumbnail?.source || data.originalimage?.source || "";
        if (imageUrl) { target = candidate; break; }
      } catch { /* Prova la specie successiva. */ }
    }

    if (!target) {
      imageBox.textContent = "Per questa sfida non è stata trovata una fotografia. Riprova.";
      next.classList.remove("hidden");
      return;
    }

    photoQuizState.answer = target.id;
    const img = document.createElement("img");
    img.src = imageUrl;
    img.alt = "Fotografia da identificare";
    img.loading = "lazy";
    imageBox.replaceChildren(img);

    const choices = [target, ...shuffled.filter(item => item.id !== target.id).slice(0, 3)]
      .sort(() => Math.random() - 0.5);
    choices.forEach(item => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = item.common;
      button.addEventListener("click", () => {
        if (photoQuizState.answered) return;
        photoQuizState.answered = true;
        [...optionsBox.children].forEach(option => {
          option.disabled = true;
          if (option.dataset.id === target.id) option.classList.add("correct");
          else if (option === button) option.classList.add("wrong");
        });
        const correct = item.id === target.id;
        result.textContent = correct
          ? `✓ Esatto! ${target.common} (${target.scientific}).`
          : `La risposta corretta era ${target.common} (${target.scientific}).`;
        next.classList.remove("hidden");
      });
      button.dataset.id = item.id;
      optionsBox.appendChild(button);
    });
  }

  next.addEventListener("click", loadQuestion);
  const observer = new MutationObserver(() => {
    if (species.length) { observer.disconnect(); loadQuestion(); }
  });
  observer.observe($("#speciesGrid"), { childList: true, subtree: true });
  if (species.length) { observer.disconnect(); loadQuestion(); }
}

function setupJournal() {
  $("#entryDate").value = new Date().toISOString().slice(0, 10);
  renderJournal();

  $("#journalForm").addEventListener("submit", event => {
    event.preventDefault();

    const name = $("#birdName").value.trim();
    const date = $("#entryDate").value;
    const weightText = $("#entryWeight").value.trim();
    const notes = $("#entryNotes").value.trim();

    if (!name || !date) return;

    const weight = weightText === "" ? "" : Number(weightText);
    if (weightText !== "" && (!(weight > 0) || !Number.isFinite(weight))) {
      $("#journalMessage").textContent = "Inserisci un peso valido.";
      return;
    }

    journal.unshift({
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      name, date, weight, notes
    });

    saveStorage(STORAGE_KEYS.journal, journal);
    $("#entryWeight").value = "";
    $("#entryNotes").value = "";
    $("#journalMessage").textContent = "Annotazione salvata sul dispositivo.";
    renderJournal();
  });

  $("#exportJournal").addEventListener("click", exportJournal);
}

function renderJournal() {
  const container = $("#journalEntries");

  if (!journal.length) {
    container.innerHTML = '<p class="muted">Non hai ancora annotazioni.</p>';
    return;
  }

  container.innerHTML = journal.map(entry => `
    <article class="journal-entry">
      <strong>${escapeHTML(entry.name)}</strong>
      <span> · ${escapeHTML(entry.date)}</span>
      ${entry.weight !== "" ? `<span> · ${escapeHTML(entry.weight)} g</span>` : ""}
      ${entry.notes ? `<p>${escapeHTML(entry.notes)}</p>` : ""}
    </article>
  `).join("");
}

function exportJournal() {
  if (!journal.length) {
    $("#journalMessage").textContent = "Non ci sono annotazioni da esportare.";
    return;
  }

  const rows = [
    ["Nome", "Data", "Peso (g)", "Osservazioni"],
    ...journal.map(entry => [entry.name, entry.date, entry.weight, entry.notes])
  ];

  const csv = rows.map(row =>
    row.map(value => `"${String(value ?? "").replaceAll('"', '""')}"`).join(";")
  ).join("\r\n");

  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "diario-pappagalli.csv";
  link.click();
  URL.revokeObjectURL(url);
}


const curiosities = [
  "Molti pappagalli usano il becco come un appoggio aggiuntivo durante l'arrampicata.",
  "Le zampe zigodattili hanno due dita rivolte in avanti e due all'indietro: una presa molto efficace.",
  "In diverse specie la coppia mantiene legami sociali duraturi, ma i comportamenti variano tra specie e individui.",
  "Alcuni pappagalli imparano a distinguere suoni e richiami del proprio gruppo.",
  "L'imitazione della voce umana non è una capacità uguale per tutti i pappagalli.",
  "Il becco è uno strumento per manipolare il cibo, esplorare e arrampicarsi.",
  "Molte specie dedicano una parte importante della giornata alla ricerca e alla manipolazione del cibo.",
  "Le penne non servono solo per volare: contribuiscono anche all'isolamento e alla comunicazione visiva.",
  "La muta è un processo naturale di rinnovo del piumaggio e può avvenire in modo graduale.",
  "Non tutti i pappagalli vivono nelle foreste: alcune specie abitano savane, zone aride e ambienti aperti.",
  "Il lorichetto arcobaleno ha una lingua specializzata con una punta a spazzola, utile per raccogliere nettare e polline.",
  "Il kakapo della Nuova Zelanda è un pappagallo notturno e incapace di volare.",
  "Il kea vive nelle regioni montuose della Nuova Zelanda ed è noto per la sua curiosità.",
  "Il cenerino è noto per le sue capacità cognitive, ma ogni individuo ha carattere e abilità propri.",
  "Le vocalizzazioni possono avere funzioni diverse: contatto, allarme, coordinamento e interazione sociale.",
  "I pappagalli hanno bisogno di opportunità di scelta e di attività: la sola presenza di giochi non basta se non vengono variati.",
  "La dieta corretta cambia molto tra gruppi: i lorichetti, per esempio, hanno esigenze diverse da ara e amazzoni.",
  "Gli alimenti ricchi di grassi non dovrebbero diventare la base della dieta: il piano alimentare va definito per la specie.",
  "La conservazione dei pappagalli dipende anche dalla tutela degli habitat e dal contrasto al commercio illegale.",
  "Una foto o un colore del piumaggio non bastano sempre per identificare una specie: età e sottospecie possono influire sull'aspetto."
];
function setupCuriosita() {
  const button = $("#newCuriosity");
  const text = $("#curiosityText");
  if (!button || !text) return;
  let previous = -1;
  button.addEventListener("click", () => {
    let next = Math.floor(Math.random() * curiosities.length);
    if (curiosities.length > 1) while (next === previous) next = Math.floor(Math.random() * curiosities.length);
    previous = next;
    text.textContent = curiosities[next];
  });
  text.textContent = curiosities[0];
}


const mapRegions = [
  { id: "sud-america", name: "Sud America", lat: -8, lng: -60, test: /sud america|bacino amazzonico|bolivia|brasile|paraguay|ecuador|perù|nord-est del sud america|america settentrionale del sud america/i },
  { id: "america-centrale", name: "America centrale e Messico", lat: 17, lng: -89, test: /america centrale|messico/i },
  { id: "africa-occidentale", name: "Africa occidentale", lat: 7, lng: -5, test: /africa occidentale|africa centrale e occidentale|africa sud-occidentale/i },
  { id: "africa-centrale", name: "Africa centrale", lat: 0, lng: 20, test: /africa centrale/i },
  { id: "africa-orientale", name: "Africa orientale e meridionale", lat: -5, lng: 35, test: /africa orientale|tanzania|africa meridionale/i },
  { id: "asia", name: "Asia meridionale e sud-orientale", lat: 20, lng: 95, test: /asia|himalaya|cina|indonesia/i },
  { id: "madagascar", name: "Madagascar", lat: -19, lng: 47, test: /madagascar/i },
  { id: "nuova-guinea", name: "Nuova Guinea e isole vicine", lat: -5, lng: 145, test: /nuova guinea/i },
  { id: "australia", name: "Australia", lat: -25, lng: 134, test: /australia/i },
  { id: "nuova-zelanda", name: "Nuova Zelanda", lat: -42, lng: 173, test: /nuova zelanda/i }
];
let worldMap = null;
let worldMapMarkers = {};

function regionForOrigin(origin = "") {
  const normalized = origin.toLocaleLowerCase("it");
  // Le aree oceaniche specifiche hanno precedenza sulle etichette più generiche.
  if (/nuova zelanda/.test(normalized)) return mapRegions.find(r => r.id === "nuova-zelanda");
  if (/madagascar/.test(normalized)) return mapRegions.find(r => r.id === "madagascar");
  if (/nuova guinea/.test(normalized)) return mapRegions.find(r => r.id === "nuova-guinea");
  if (/australia/.test(normalized)) return mapRegions.find(r => r.id === "australia");
  if (/america centrale|messico/.test(normalized)) return mapRegions.find(r => r.id === "america-centrale");
  if (/sud america|bacino amazzonico|bolivia|brasile|paraguay|ecuador|perù|nord-est del sud america/.test(normalized)) return mapRegions.find(r => r.id === "sud-america");
  if (/africa orientale|tanzania|africa meridionale/.test(normalized)) return mapRegions.find(r => r.id === "africa-orientale");
  if (/africa occidentale|africa sud-occidentale/.test(normalized)) return mapRegions.find(r => r.id === "africa-occidentale");
  if (/africa centrale/.test(normalized)) return mapRegions.find(r => r.id === "africa-centrale");
  if (/asia|himalaya|cina|indonesia/.test(normalized)) return mapRegions.find(r => r.id === "asia");
  return null;
}

function renderWorldMap() {
  const mapElement = $("#parrotWorldMap");
  const listElement = $("#mapRegionList");
  if (!mapElement || !listElement || !species.length) return;

  const grouped = new Map();
  species.forEach(item => {
    const region = regionForOrigin(item.origin);
    if (!region) return;
    if (!grouped.has(region.id)) grouped.set(region.id, { region, species: [] });
    grouped.get(region.id).species.push(item);
  });

  listElement.innerHTML = [...grouped.values()].sort((a,b) => a.region.name.localeCompare(b.region.name, "it")).map(group => `
    <button type="button" class="map-region-button" data-map-region="${group.region.id}">
      <span>${escapeHTML(group.region.name)}</span><strong>${group.species.length}</strong>
    </button>`).join("");

  if (!window.L) {
    mapElement.innerHTML = '<p class="map-loading">La mappa non è disponibile in questo momento. Controlla la connessione e ricarica la pagina.</p>';
    return;
  }

  if (!worldMap) {
    mapElement.innerHTML = "";
    worldMap = L.map(mapElement, { scrollWheelZoom: false, minZoom: 2 }).setView([8, 8], 2);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
      maxZoom: 8
    }).addTo(worldMap);
    worldMap.on("focus", () => worldMap.scrollWheelZoom.enable());
    worldMap.on("blur", () => worldMap.scrollWheelZoom.disable());
  }

  Object.values(worldMapMarkers).forEach(marker => worldMap.removeLayer(marker));
  worldMapMarkers = {};
  grouped.forEach(({region, species: entries}, id) => {
    const names = entries.map(item => `<li><button type="button" class="map-species-link" data-map-species="${escapeHTML(item.id)}">${escapeHTML(item.common)} <em>(${escapeHTML(item.scientific)})</em></button></li>`).join("");
    const popup = `<div class="map-popup"><strong>${escapeHTML(region.name)}</strong><p>${entries.length} ${entries.length === 1 ? "specie" : "specie"} nel catalogo</p><ul>${names}</ul></div>`;
    const countIcon = L.divIcon({
      className: "map-count-marker",
      html: `<span>${entries.length}</span>`,
      iconSize: [38, 38],
      iconAnchor: [19, 19]
    });
    worldMapMarkers[id] = L.marker([region.lat, region.lng], { icon: countIcon }).addTo(worldMap).bindPopup(popup);
  });

  mapElement.addEventListener("click", event => {
    const speciesButton = event.target.closest("[data-map-species]");
    if (speciesButton) openSpecies(speciesButton.dataset.mapSpecies);
  });

  const showWorldButton = $("#mapShowWorld");
  if (showWorldButton) {
    showWorldButton.addEventListener("click", () => {
      worldMap.flyTo([8, 8], 2, { duration: 0.8 });
      listElement.querySelectorAll(".map-region-button").forEach(item => item.classList.remove("active"));
      worldMap.closePopup();
    });
  }

  listElement.querySelectorAll("[data-map-region]").forEach(button => {
    button.addEventListener("click", () => {
      const marker = worldMapMarkers[button.dataset.mapRegion];
      if (!marker) return;
      worldMap.flyTo(marker.getLatLng(), 4, { duration: 0.8 });
      marker.openPopup();
      listElement.querySelectorAll(".map-region-button").forEach(item => item.classList.toggle("active", item === button));
    });
  });

  setTimeout(() => worldMap.invalidateSize(), 100);
}


const PACO_WORKER_URL = "https://paco-ai.chiccovision.workers.dev/";
const PACO_VISIT_LIMIT = 3;
const PACO_SESSION_KEY = "parrotworld_paco_questions_v1";

function setupPaco() {
  const launcher = $("#pacoLauncher");
  const panel = $("#pacoPanel");
  const close = $("#pacoClose");
  const form = $("#pacoForm");
  const input = $("#pacoInput");
  const messages = $("#pacoMessages");
  const send = $("#pacoSend");
  if (!launcher || !panel || !form) return;

  let questionsUsed = Number(sessionStorage.getItem(PACO_SESSION_KEY) || 0);
  if (!Number.isFinite(questionsUsed) || questionsUsed < 0) questionsUsed = 0;

  function setOpen(open) {
    panel.hidden = !open;
    launcher.setAttribute("aria-expanded", String(open));
    if (open) input.focus();
  }

  function addMessage(text, kind) {
    const bubble = document.createElement("div");
    bubble.className = "paco-message " + kind;
    bubble.textContent = text;
    messages.appendChild(bubble);
    messages.scrollTop = messages.scrollHeight;
    return bubble;
  }

  function showVisitLimit() {
    addMessage("Squawk! Per questa visita abbiamo già fatto tre belle chiacchierate. Torna a trovarmi in una nuova visita per altre domande! 🦜", "paco-message-bot");
  }

  launcher.addEventListener("click", () => setOpen(panel.hidden));
  close.addEventListener("click", () => setOpen(false));

  form.addEventListener("submit", async event => {
    event.preventDefault();
    const question = input.value.trim();
    if (!question || send.disabled) return;

    if (questionsUsed >= PACO_VISIT_LIMIT) {
      input.value = "";
      showVisitLimit();
      return;
    }

    addMessage(question, "paco-message-user");
    input.value = "";
    send.disabled = true;
    input.disabled = true;
    const waiting = addMessage("Paco sta pensando…", "paco-message-status");
    let answered = false;

    try {
      const response = await fetch(PACO_WORKER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: question, language: "it" })
      });
      const data = await response.json().catch(() => ({}));
      waiting.remove();
      if (!response.ok) {
        throw new Error(data.details || data.error || "Il servizio non è disponibile.");
      }
      addMessage(data.answer || "Squawk! Non ho ricevuto una risposta. Riprova!", "paco-message-bot");
      questionsUsed += 1;
      sessionStorage.setItem(PACO_SESSION_KEY, String(questionsUsed));
      answered = true;
    } catch (error) {
      waiting.remove();
      addMessage("Ops! In questo momento non riesco a rispondere. Riprova tra poco. (" + error.message + ")", "paco-message-bot");
    } finally {
      send.disabled = false;
      input.disabled = false;
      input.focus();
    }
  });
}

function init() {
  $("#currentYear").textContent = new Date().getFullYear();
  setupLanguageSelector();
  setupFilters();
  setupDialog();
  setupMenu();
  setupWeightCalculator();
  setupQuiz();
  setupComparison();
  setupPhotoQuiz();
  setupJournal();
  setupCuriosita();
  setupPaco();
  loadSpecies();
}

document.addEventListener("DOMContentLoaded", init);
