
"use strict";

const $ = (selector) => document.querySelector(selector);
const STORAGE_KEYS = {
  favorites: "parrotworld_favorites_v1",
  journal: "parrotworld_journal_v1"
};

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
    <a class="source-link" href="${safeWikipediaUrl(item.source)}" target="_blank" rel="noopener noreferrer">Consulta la scheda di Wikipedia ↗</a>
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

function safeWikipediaUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname === "en.wikipedia.org"
      ? parsed.href : "https://en.wikipedia.org/";
  } catch {
    return "https://en.wikipedia.org/";
  }
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
  });

  nav.querySelectorAll("a").forEach(link => {
    link.addEventListener("click", () => nav.classList.remove("open"));
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
  "I pappagalli usano spesso il becco anche come una terza mano per arrampicarsi.",
  "In molte specie il piumaggio colorato dipende anche da strutture microscopiche delle penne, non solo dai pigmenti.",
  "I pappagalli sono animali sociali: in natura molte specie vivono in coppie o gruppi.",
  "Alcune specie possono imitare suoni e voci, ma la capacità varia molto da individuo a individuo.",
  "Il becco continua a crescere durante la vita e si consuma con l'uso naturale.",
  "La ricerca del cibo e i giochi di problem solving sono importanti forme di arricchimento."
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

function init() {
  $("#currentYear").textContent = new Date().getFullYear();
  setupFilters();
  setupDialog();
  setupMenu();
  setupWeightCalculator();
  setupQuiz();
  setupJournal();
  setupCuriosita();
  loadSpecies();
}

document.addEventListener("DOMContentLoaded", init);
