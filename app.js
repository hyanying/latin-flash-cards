/* ============================================================
   LATIN FLASH CARDS — app.js
   Pure vanilla JS, no dependencies. All data in localStorage.
   ============================================================ */

'use strict';

/* ------------------------------------------------------------------ */
/*  STORAGE HELPERS                                                     */
/* ------------------------------------------------------------------ */

const STORAGE_KEYS = {
  CARDS:      'latinfc_cards',
  CATEGORIES: 'latinfc_categories',
  AUDIO:      'latinfc_audio_',   // prefix — key = prefix + cardId
};

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (_) {
    return fallback;
  }
}

function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    // Quota exceeded or similar
    showToast('Storage error: ' + e.message, 'error');
    return false;
  }
}

function loadAudio(cardId) {
  return localStorage.getItem(STORAGE_KEYS.AUDIO + cardId) || null;
}

function saveAudio(cardId, base64DataURL) {
  try {
    localStorage.setItem(STORAGE_KEYS.AUDIO + cardId, base64DataURL);
    return true;
  } catch (e) {
    showToast('Audio storage failed — file may be too large.', 'error');
    return false;
  }
}

function removeAudio(cardId) {
  localStorage.removeItem(STORAGE_KEYS.AUDIO + cardId);
}

/* ------------------------------------------------------------------ */
/*  STATE                                                               */
/* ------------------------------------------------------------------ */

let state = {
  cards:           [],     // [{ id, latin, english, notes, categories, hasAudio, createdAt }]
  categories:      [],     // [string]
  activeCategory:  'all',  // 'all' | category name
  searchQuery:     '',
  // study
  studyCards:      [],
  studyIndex:      0,
  studyFlipped:    false,
  studyCategory:   'all',
  // edit
  pendingDeleteId: null,
  pendingAudioB64: null,   // base64 data url for the current upload before save
  pendingAudioRemove: false,
};

/* ------------------------------------------------------------------ */
/*  INIT                                                                */
/* ------------------------------------------------------------------ */

function init() {
  state.cards      = loadJSON(STORAGE_KEYS.CARDS,      []);
  state.categories = loadJSON(STORAGE_KEYS.CATEGORIES, []);

  // Seed sample cards on first ever load
  if (state.cards.length === 0) {
    seedSampleData();
  }

  // Migrate old single-category string to categories array
  let migrated = false;
  for (const card of state.cards) {
    if (!Array.isArray(card.categories)) {
      card.categories = card.category ? [card.category] : [];
      delete card.category;
      migrated = true;
    }
  }
  if (migrated) saveJSON(STORAGE_KEYS.CARDS, state.cards);

  bindEvents();
  render();
}

function seedSampleData() {
  const categories = ['Phrases', 'Verbs', 'Nouns'];
  const samples = [
    { latin: 'Carpe diem',           english: 'Seize the day',            notes: 'From Horace\'s Odes. Often used to encourage living in the moment.', category: 'Phrases' },
    { latin: 'Veni, vidi, vici',      english: 'I came, I saw, I conquered', notes: 'Julius Caesar\'s famous report of a swift victory.', category: 'Phrases' },
    { latin: 'Amare',                 english: 'To love',                  notes: '1st conjugation infinitive. Amo, amas, amat…', category: 'Verbs' },
    { latin: 'Esse',                  english: 'To be',                    notes: 'Irregular verb: sum, es, est, sumus, estis, sunt', category: 'Verbs' },
    { latin: 'Aqua',                  english: 'Water',                    notes: '1st declension feminine noun.', category: 'Nouns' },
    { latin: 'Lux',                   english: 'Light',                    notes: '3rd declension feminine. Lux, lucis.', category: 'Nouns' },
    { latin: 'Amor vincit omnia',     english: 'Love conquers all',        notes: 'From Virgil\'s Eclogues.', category: 'Phrases' },
    { latin: 'Per aspera ad astra',   english: 'Through hardship to the stars', notes: 'Common motto adopted by many institutions.', category: 'Phrases' },
  ];
  state.categories = categories;
  state.cards = samples.map((s, i) => ({
    id: 'seed_' + i,
    latin: s.latin,
    english: s.english,
    notes: s.notes,
    categories: [s.category],
    hasAudio: false,
    createdAt: Date.now() - (samples.length - i) * 60000,
  }));
  saveJSON(STORAGE_KEYS.CARDS,      state.cards);
  saveJSON(STORAGE_KEYS.CATEGORIES, state.categories);
}

/* ------------------------------------------------------------------ */
/*  DOM REFERENCES                                                      */
/* ------------------------------------------------------------------ */

const $ = id => document.getElementById(id);

const dom = {
  // layout
  sidebar:           $('sidebar'),
  sidebarToggle:     $('sidebar-toggle'),
  categoryList:      $('category-list'),
  // browse
  cardGrid:          $('card-grid'),
  emptyState:        $('empty-state'),
  searchInput:       $('search-input'),
  cardCountLabel:    $('card-count-label'),
  // card modal
  cardModalOverlay:  $('card-modal-overlay'),
  cardModal:         $('card-modal'),
  cardForm:          $('card-form'),
  modalTitle:        $('modal-title'),
  editCardId:        $('edit-card-id'),
  fieldLatin:        $('field-latin'),
  fieldEnglish:      $('field-english'),
  fieldNotes:        $('field-notes'),
  categoryCheckboxes:$('category-checkboxes'),
  fieldNewCategory:  $('field-new-category'),
  fieldAudio:        $('field-audio'),
  audioUploadArea:   $('audio-upload-area'),
  audioUploadText:   $('audio-upload-text'),
  btnRemoveAudio:    $('btn-remove-audio'),
  formError:         $('form-error'),
  // category modal
  categoryModalOverlay: $('category-modal-overlay'),
  categoryForm:         $('category-form'),
  fieldCatName:         $('field-cat-name'),
  catFormError:         $('cat-form-error'),
  // delete modal
  deleteModalOverlay:   $('delete-modal-overlay'),
  // study
  studyOverlay:      $('study-overlay'),
  studyCard:         $('study-card'),
  studyLatin:        $('study-latin'),
  studyEnglish:      $('study-english'),
  studyNotes:        $('study-notes'),
  studyCategoryBadge:$('study-category-badge'),
  studyAudioBtn:     $('study-audio-btn'),
  studyAudioBtnBack: $('study-audio-btn-back'),
  studyIndexLabel:   $('study-index-label'),
  studyProgressBar:  $('study-progress-bar'),
  studyCategoryFilter: $('study-category-filter'),
  // export / import
  btnExport:            $('btn-export'),
  btnImport:            $('btn-import'),
  importModalOverlay:   $('import-modal-overlay'),
  importJsonFile:       $('import-json-file'),
  importAudioFiles:     $('import-audio-files'),
  importFormError:      $('import-form-error'),
  // toast
  toast:             $('toast'),
};

/* ------------------------------------------------------------------ */
/*  EVENT BINDING                                                        */
/* ------------------------------------------------------------------ */

function bindEvents() {
  // Header buttons
  $('btn-add-card').addEventListener('click', openNewCardModal);
  $('btn-study').addEventListener('click', openStudyMode);
  $('btn-export').addEventListener('click', () => exportData().catch(e => showToast('Export failed: ' + e.message, 'error')));
  $('btn-import').addEventListener('click', openImportModal);

  // Import modal
  $('import-modal-close').addEventListener('click', closeImportModal);
  $('import-modal-cancel').addEventListener('click', closeImportModal);
  $('import-modal-overlay').addEventListener('click', e => {
    if (e.target === $('import-modal-overlay')) closeImportModal();
  });
  $('import-confirm').addEventListener('click', () => handleImport().catch(e => showFormError(dom.importFormError, 'Error: ' + e.message)));

  // Sidebar toggle (mobile)
  dom.sidebarToggle.addEventListener('click', toggleSidebar);

  // Search
  dom.searchInput.addEventListener('input', () => {
    state.searchQuery = dom.searchInput.value.trim().toLowerCase();
    renderCardGrid();
    renderCardCount();
  });

  // Card modal
  $('card-modal-close').addEventListener('click', closeCardModal);
  $('card-modal-cancel').addEventListener('click', closeCardModal);
  dom.cardModalOverlay.addEventListener('click', e => {
    if (e.target === dom.cardModalOverlay) closeCardModal();
  });
  dom.cardForm.addEventListener('submit', handleCardFormSubmit);

  // Audio field
  dom.fieldAudio.addEventListener('change', handleAudioFileChange);
  dom.btnRemoveAudio.addEventListener('click', clearAudioPending);

  // Category modal
  $('btn-add-category').addEventListener('click', openCategoryModal);
  $('category-modal-close').addEventListener('click', closeCategoryModal);
  $('category-modal-cancel').addEventListener('click', closeCategoryModal);
  $('category-modal-overlay').addEventListener('click', e => {
    if (e.target === $('category-modal-overlay')) closeCategoryModal();
  });
  dom.categoryForm.addEventListener('submit', handleCategoryFormSubmit);

  // Delete modal
  $('delete-cancel').addEventListener('click', closeDeleteModal);
  $('delete-confirm').addEventListener('click', confirmDeleteCard);
  $('delete-modal-overlay').addEventListener('click', e => {
    if (e.target === $('delete-modal-overlay')) closeDeleteModal();
  });

  // Study mode
  $('study-close').addEventListener('click', closeStudyMode);
  dom.studyCard.addEventListener('click', studyFlipCard);
  dom.studyCard.addEventListener('keydown', e => {
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); studyFlipCard(); }
  });
  $('study-prev').addEventListener('click', studyPrev);
  $('study-next').addEventListener('click', studyNext);
  $('study-flip').addEventListener('click', studyFlipCard);
  $('btn-shuffle').addEventListener('click', shuffleStudy);
  dom.studyCategoryFilter.addEventListener('change', e => {
    state.studyCategory = e.target.value;
    buildStudyDeck();
    renderStudyCard();
  });
  dom.studyAudioBtn.addEventListener('click', e => { e.stopPropagation(); playCardAudio(); });
  dom.studyAudioBtnBack.addEventListener('click', e => { e.stopPropagation(); playCardAudio(); });

  // Keyboard shortcuts (global)
  document.addEventListener('keydown', handleGlobalKeydown);
}

/* ------------------------------------------------------------------ */
/*  GLOBAL KEYBOARD HANDLER                                             */
/* ------------------------------------------------------------------ */

function handleGlobalKeydown(e) {
  // Only in study mode
  if (dom.studyOverlay.classList.contains('hidden')) return;
  // Don't intercept if focus is on an input/select
  const tag = document.activeElement.tagName;
  if (['INPUT','TEXTAREA','SELECT'].includes(tag)) return;

  switch (e.key) {
    case 'ArrowLeft':  e.preventDefault(); studyPrev(); break;
    case 'ArrowRight': e.preventDefault(); studyNext(); break;
    case ' ':          e.preventDefault(); studyFlipCard(); break;
    case 'Escape':     closeStudyMode(); break;
  }
}

/* ------------------------------------------------------------------ */
/*  RENDER (top-level)                                                  */
/* ------------------------------------------------------------------ */

function render() {
  renderSidebar();
  renderCardGrid();
  renderCardCount();
  renderCategorySelects();
}

/* ------------------------------------------------------------------ */
/*  SIDEBAR                                                             */
/* ------------------------------------------------------------------ */

function renderSidebar() {
  const ul = dom.categoryList;
  ul.innerHTML = '';

  const allCount = state.cards.length;
  ul.appendChild(makeCategoryItem('all', 'All Cards', allCount));

  for (const cat of state.categories) {
    const count = state.cards.filter(c => (c.categories || []).includes(cat)).length;
    ul.appendChild(makeCategoryItem(cat, cat, count));
  }
}

function makeCategoryItem(value, label, count) {
  const li = document.createElement('li');
  const div = document.createElement('div');
  div.className = 'category-item' + (state.activeCategory === value ? ' active' : '');
  div.dataset.cat = value;

  const nameSpan = document.createElement('span');
  nameSpan.className = 'category-item-name';
  nameSpan.textContent = label;

  const countSpan = document.createElement('span');
  countSpan.className = 'category-item-count';
  countSpan.textContent = count;

  div.appendChild(nameSpan);
  div.appendChild(countSpan);

  if (value !== 'all') {
    const delBtn = document.createElement('button');
    delBtn.className = 'category-delete-btn';
    delBtn.title = 'Delete category';
    delBtn.textContent = '✕';
    delBtn.addEventListener('click', e => {
      e.stopPropagation();
      deleteCategory(value);
    });
    div.appendChild(delBtn);
  }

  div.addEventListener('click', () => {
    state.activeCategory = value;
    renderSidebar();
    renderCardGrid();
    renderCardCount();
    // Close sidebar on mobile after selection
    if (window.innerWidth <= 700) closeSidebar();
  });

  li.appendChild(div);
  return li;
}

function toggleSidebar() {
  const isOpen = dom.sidebar.classList.toggle('open');
  ensureSidebarBackdrop(isOpen);
}

function closeSidebar() {
  dom.sidebar.classList.remove('open');
  ensureSidebarBackdrop(false);
}

function ensureSidebarBackdrop(show) {
  let bd = document.querySelector('.sidebar-backdrop');
  if (show) {
    if (!bd) {
      bd = document.createElement('div');
      bd.className = 'sidebar-backdrop';
      bd.addEventListener('click', closeSidebar);
      document.body.appendChild(bd);
    }
    // Trigger reflow then add visible class
    requestAnimationFrame(() => bd.classList.add('visible'));
  } else {
    if (bd) bd.remove();
  }
}

/* ------------------------------------------------------------------ */
/*  CARD GRID                                                           */
/* ------------------------------------------------------------------ */

function filteredCards() {
  let cards = state.cards;
  if (state.activeCategory !== 'all') {
    cards = cards.filter(c => (c.categories || []).includes(state.activeCategory));
  }
  if (state.searchQuery) {
    const q = state.searchQuery;
    cards = cards.filter(c =>
      c.latin.toLowerCase().includes(q) ||
      c.english.toLowerCase().includes(q) ||
      (c.notes || '').toLowerCase().includes(q) ||
      (c.categories || []).some(cat => cat.toLowerCase().includes(q))
    );
  }
  return cards;
}

function renderCardGrid() {
  const cards = filteredCards();
  dom.cardGrid.innerHTML = '';

  if (cards.length === 0) {
    dom.emptyState.classList.remove('hidden');
    return;
  }
  dom.emptyState.classList.add('hidden');

  for (const card of cards) {
    dom.cardGrid.appendChild(makeBrowseCard(card));
  }
}

function makeBrowseCard(card) {
  const div = document.createElement('div');
  div.className = 'browse-card';
  div.dataset.id = card.id;

  let html = '';
  if (card.categories && card.categories.length > 0) {
    html += `<div class="browse-card-category">${card.categories.map(escHtml).join(' · ')}</div>`;
  }
  html += `<div class="browse-card-latin">${escHtml(card.latin)}</div>`;
  html += `<div class="browse-card-english">${escHtml(card.english)}</div>`;
  if (card.notes) {
    html += `<div class="browse-card-notes">${escHtml(card.notes)}</div>`;
  }
  html += `<div class="browse-card-footer">`;
  if (card.hasAudio) {
    html += `<button class="browse-card-audio" data-action="play" title="Play audio">▶ Audio</button>`;
  }
  html += `<button class="btn btn-ghost btn-sm" data-action="edit" title="Edit">Edit</button>`;
  html += `<button class="btn btn-ghost btn-sm" data-action="delete" title="Delete" style="color:var(--color-danger)">Delete</button>`;
  html += `</div>`;

  div.innerHTML = html;

  // Bind footer actions
  div.querySelector('[data-action="edit"]').addEventListener('click', () => openEditCardModal(card.id));
  div.querySelector('[data-action="delete"]').addEventListener('click', () => openDeleteModal(card.id));
  const playBtn = div.querySelector('[data-action="play"]');
  if (playBtn) playBtn.addEventListener('click', () => playAudioForCard(card.id));

  return div;
}

function renderCardCount() {
  const cards = filteredCards();
  const total = cards.length;
  dom.cardCountLabel.textContent = total === 1 ? '1 card' : `${total} cards`;
}

/* ------------------------------------------------------------------ */
/*  CATEGORY SELECTS (form dropdowns)                                   */
/* ------------------------------------------------------------------ */

function renderCategorySelects() {
  const studySel = dom.studyCategoryFilter;
  const prev = studySel.value;
  studySel.innerHTML = '<option value="all">All categories</option>';
  for (const cat of state.categories) {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
    studySel.appendChild(opt);
  }
  studySel.value = prev || 'all';
}

function renderCategoryCheckboxes(selected = []) {
  const container = dom.categoryCheckboxes;
  container.innerHTML = '';
  for (const cat of state.categories) {
    const label = document.createElement('label');
    label.className = 'category-checkbox-item';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = cat;
    cb.checked = selected.includes(cat);
    label.appendChild(cb);
    label.appendChild(document.createTextNode(cat));
    container.appendChild(label);
  }
}

/* ------------------------------------------------------------------ */
/*  CARD MODAL (add / edit)                                             */
/* ------------------------------------------------------------------ */

function openNewCardModal() {
  state.pendingAudioB64 = null;
  state.pendingAudioRemove = false;

  dom.editCardId.value = '';
  dom.modalTitle.textContent = 'New Card';
  dom.cardForm.reset();
  clearAudioUploadUI();
  hideFormError(dom.formError);
  renderCategorySelects();
  const preselected = state.activeCategory !== 'all' ? [state.activeCategory] : [];
  renderCategoryCheckboxes(preselected);

  openModal(dom.cardModalOverlay);
  dom.fieldLatin.focus();
}

function openEditCardModal(cardId) {
  const card = state.cards.find(c => c.id === cardId);
  if (!card) return;

  state.pendingAudioB64 = null;
  state.pendingAudioRemove = false;

  dom.editCardId.value = card.id;
  dom.modalTitle.textContent = 'Edit Card';
  dom.fieldLatin.value    = card.latin;
  dom.fieldEnglish.value  = card.english;
  dom.fieldNotes.value    = card.notes || '';
  dom.fieldNewCategory.value = '';
  hideFormError(dom.formError);
  renderCategorySelects();
  renderCategoryCheckboxes(card.categories || []);

  // Show existing audio indicator
  if (card.hasAudio) {
    setAudioUploadUI('Existing audio attached (replace or remove)', true);
  } else {
    clearAudioUploadUI();
  }

  openModal(dom.cardModalOverlay);
  dom.fieldLatin.focus();
}

function closeCardModal() {
  closeModal(dom.cardModalOverlay);
  dom.cardForm.reset();
  state.pendingAudioB64 = null;
  state.pendingAudioRemove = false;
}

function handleCardFormSubmit(e) {
  e.preventDefault();
  hideFormError(dom.formError);

  const latin   = dom.fieldLatin.value.trim();
  const english = dom.fieldEnglish.value.trim();
  const notes   = dom.fieldNotes.value.trim();
  const newCat  = dom.fieldNewCategory.value.trim();
  const checkedCats = Array.from(
    dom.categoryCheckboxes.querySelectorAll('input[type="checkbox"]:checked')
  ).map(cb => cb.value);
  const categories = (newCat && !checkedCats.includes(newCat))
    ? [...checkedCats, newCat]
    : checkedCats;

  if (!latin)   { showFormError(dom.formError, 'Latin word/phrase is required.'); dom.fieldLatin.focus(); return; }
  if (!english) { showFormError(dom.formError, 'English translation is required.'); dom.fieldEnglish.focus(); return; }

  // Add new category if typed
  if (newCat && !state.categories.includes(newCat)) {
    state.categories.push(newCat);
    saveJSON(STORAGE_KEYS.CATEGORIES, state.categories);
  }

  const editId = dom.editCardId.value;

  if (editId) {
    // Update existing card
    const card = state.cards.find(c => c.id === editId);
    if (!card) return;
    card.latin       = latin;
    card.english     = english;
    card.notes       = notes;
    card.categories  = categories;

    // Handle audio
    if (state.pendingAudioRemove) {
      removeAudio(card.id);
      card.hasAudio = false;
    }
    if (state.pendingAudioB64) {
      if (saveAudio(card.id, state.pendingAudioB64)) {
        card.hasAudio = true;
      }
    }

    saveJSON(STORAGE_KEYS.CARDS, state.cards);
    showToast('Card updated.', 'success');
  } else {
    // New card
    const id = 'card_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    const card = { id, latin, english, notes, categories, hasAudio: false, createdAt: Date.now() };

    if (state.pendingAudioB64) {
      if (saveAudio(id, state.pendingAudioB64)) {
        card.hasAudio = true;
      }
    }

    state.cards.unshift(card);
    saveJSON(STORAGE_KEYS.CARDS, state.cards);
    showToast('Card created!', 'success');
  }

  closeCardModal();
  render();
}

/* ------------------------------------------------------------------ */
/*  AUDIO FILE HANDLING                                                 */
/* ------------------------------------------------------------------ */

function handleAudioFileChange(e) {
  const file = e.target.files[0];
  if (!file) return;

  const maxMB = 10;
  if (file.size > maxMB * 1024 * 1024) {
    showToast(`Audio file too large (max ${maxMB} MB).`, 'error');
    dom.fieldAudio.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = ev => {
    state.pendingAudioB64 = ev.target.result;
    state.pendingAudioRemove = false;
    setAudioUploadUI(file.name, true);
  };
  reader.onerror = () => showToast('Failed to read audio file.', 'error');
  reader.readAsDataURL(file);
}

function clearAudioPending() {
  state.pendingAudioB64 = null;
  state.pendingAudioRemove = true;
  dom.fieldAudio.value = '';
  clearAudioUploadUI();
}

function setAudioUploadUI(filename, hasFile) {
  dom.audioUploadText.textContent = filename;
  dom.btnRemoveAudio.classList.toggle('hidden', !hasFile);
  dom.audioUploadArea.classList.toggle('has-file', hasFile);
}

function clearAudioUploadUI() {
  dom.audioUploadText.textContent = 'Click to attach audio file';
  dom.btnRemoveAudio.classList.add('hidden');
  dom.audioUploadArea.classList.remove('has-file');
}

/* ------------------------------------------------------------------ */
/*  CATEGORY MODAL                                                      */
/* ------------------------------------------------------------------ */

function openCategoryModal() {
  dom.fieldCatName.value = '';
  hideFormError(dom.catFormError);
  openModal($('category-modal-overlay'));
  dom.fieldCatName.focus();
}

function closeCategoryModal() {
  closeModal($('category-modal-overlay'));
}

function handleCategoryFormSubmit(e) {
  e.preventDefault();
  hideFormError(dom.catFormError);
  const name = dom.fieldCatName.value.trim();
  if (!name) { showFormError(dom.catFormError, 'Category name is required.'); return; }
  if (state.categories.includes(name)) { showFormError(dom.catFormError, 'Category already exists.'); return; }

  state.categories.push(name);
  saveJSON(STORAGE_KEYS.CATEGORIES, state.categories);
  closeCategoryModal();
  renderSidebar();
  renderCategorySelects();
  showToast(`Category "${name}" created.`, 'success');
}

function deleteCategory(name) {
  if (!confirm(`Delete category "${name}"? Cards in this category will become uncategorized.`)) return;
  state.categories = state.categories.filter(c => c !== name);
  // Remove deleted category from all cards
  state.cards.forEach(card => {
    card.categories = (card.categories || []).filter(c => c !== name);
  });
  saveJSON(STORAGE_KEYS.CARDS,      state.cards);
  saveJSON(STORAGE_KEYS.CATEGORIES, state.categories);
  if (state.activeCategory === name) state.activeCategory = 'all';
  render();
  showToast(`Category "${name}" deleted.`, 'success');
}

/* ------------------------------------------------------------------ */
/*  DELETE MODAL                                                        */
/* ------------------------------------------------------------------ */

function openDeleteModal(cardId) {
  state.pendingDeleteId = cardId;
  openModal($('delete-modal-overlay'));
}

function closeDeleteModal() {
  state.pendingDeleteId = null;
  closeModal($('delete-modal-overlay'));
}

function confirmDeleteCard() {
  const id = state.pendingDeleteId;
  if (!id) return;
  state.cards = state.cards.filter(c => c.id !== id);
  removeAudio(id);
  saveJSON(STORAGE_KEYS.CARDS, state.cards);
  closeDeleteModal();
  render();
  showToast('Card deleted.', 'success');
}

/* ------------------------------------------------------------------ */
/*  AUDIO PLAYBACK                                                      */
/* ------------------------------------------------------------------ */

let currentAudioEl = null;

function playAudioForCard(cardId) {
  const b64 = loadAudio(cardId);
  if (!b64) { showToast('No audio for this card.', 'error'); return; }
  if (currentAudioEl) { currentAudioEl.pause(); currentAudioEl = null; }
  const audio = new Audio(b64);
  currentAudioEl = audio;
  audio.play().catch(err => showToast('Audio playback error: ' + err.message, 'error'));
}

function playCardAudio() {
  if (state.studyCards.length === 0) return;
  const card = state.studyCards[state.studyIndex];
  if (!card) return;
  playAudioForCard(card.id);
}

/* ------------------------------------------------------------------ */
/*  STUDY MODE                                                          */
/* ------------------------------------------------------------------ */

function openStudyMode() {
  state.studyCategory = dom.studyCategoryFilter.value || 'all';
  renderCategorySelects();
  buildStudyDeck();
  renderStudyCard();
  dom.studyOverlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  dom.studyCard.focus();
}

function closeStudyMode() {
  dom.studyOverlay.classList.add('hidden');
  document.body.style.overflow = '';
  if (currentAudioEl) { currentAudioEl.pause(); currentAudioEl = null; }
}

function buildStudyDeck() {
  let cards = state.cards.slice();
  if (state.studyCategory !== 'all') {
    cards = cards.filter(c => (c.categories || []).includes(state.studyCategory));
  }
  state.studyCards  = cards;
  state.studyIndex  = 0;
  state.studyFlipped = false;
  dom.studyCard.classList.remove('flipped');
}

function shuffleStudy() {
  const arr = state.studyCards;
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  state.studyIndex  = 0;
  state.studyFlipped = false;
  dom.studyCard.classList.remove('flipped');
  renderStudyCard();
  showToast('Cards shuffled!');
}

function studyFlipCard() {
  state.studyFlipped = !state.studyFlipped;
  dom.studyCard.classList.toggle('flipped', state.studyFlipped);
}

function studyPrev() {
  if (state.studyCards.length === 0) return;
  state.studyIndex = (state.studyIndex - 1 + state.studyCards.length) % state.studyCards.length;
  state.studyFlipped = false;
  dom.studyCard.classList.remove('flipped');
  renderStudyCard();
}

function studyNext() {
  if (state.studyCards.length === 0) return;
  state.studyIndex = (state.studyIndex + 1) % state.studyCards.length;
  state.studyFlipped = false;
  dom.studyCard.classList.remove('flipped');
  renderStudyCard();
}

function renderStudyCard() {
  const total = state.studyCards.length;

  if (total === 0) {
    dom.studyLatin.textContent     = 'No cards';
    dom.studyEnglish.textContent   = '';
    dom.studyNotes.textContent     = '';
    dom.studyCategoryBadge.textContent = '';
    dom.studyIndexLabel.textContent = '0 / 0';
    dom.studyProgressBar.style.width = '0%';
    dom.studyAudioBtn.classList.add('hidden');
    dom.studyAudioBtnBack.classList.add('hidden');
    return;
  }

  const idx  = state.studyIndex;
  const card = state.studyCards[idx];

  dom.studyLatin.textContent   = card.latin;
  dom.studyEnglish.textContent = card.english;
  dom.studyNotes.textContent   = card.notes || '';
  dom.studyCategoryBadge.textContent = (card.categories || []).join(' · ');
  dom.studyIndexLabel.textContent = `${idx + 1} / ${total}`;
  dom.studyProgressBar.style.width = `${((idx + 1) / total) * 100}%`;

  const hasAudio = card.hasAudio;
  dom.studyAudioBtn.classList.toggle('hidden', !hasAudio);
  dom.studyAudioBtnBack.classList.toggle('hidden', !hasAudio);

  // Stop any currently playing audio on card change
  if (currentAudioEl) { currentAudioEl.pause(); currentAudioEl = null; }
}

/* ------------------------------------------------------------------ */
/*  MODAL HELPERS                                                       */
/* ------------------------------------------------------------------ */

function openModal(overlay) {
  overlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  // Close on Escape
  overlay._escHandler = e => { if (e.key === 'Escape') closeModal(overlay); };
  document.addEventListener('keydown', overlay._escHandler);
}

function closeModal(overlay) {
  overlay.classList.add('hidden');
  // Only restore scroll if study overlay also hidden
  if (dom.studyOverlay.classList.contains('hidden')) {
    document.body.style.overflow = '';
  }
  if (overlay._escHandler) {
    document.removeEventListener('keydown', overlay._escHandler);
    delete overlay._escHandler;
  }
}

/* ------------------------------------------------------------------ */
/*  FORM ERROR HELPERS                                                  */
/* ------------------------------------------------------------------ */

function showFormError(el, msg) {
  el.textContent = msg;
  el.classList.remove('hidden');
}

function hideFormError(el) {
  el.textContent = '';
  el.classList.add('hidden');
}

/* ------------------------------------------------------------------ */
/*  TOAST                                                               */
/* ------------------------------------------------------------------ */

let toastTimer = null;

function showToast(msg, type = '') {
  const t = dom.toast;
  t.textContent = msg;
  t.className = 'toast' + (type ? ' toast-' + type : '');
  t.classList.remove('hidden');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 2800);
}

/* ------------------------------------------------------------------ */
/*  EXPORT / IMPORT                                                     */
/* ------------------------------------------------------------------ */

function mimeToExt(mime) {
  const map = {
    'audio/mpeg': 'mp3', 'audio/mp3': 'mp3',
    'audio/wav': 'wav', 'audio/wave': 'wav', 'audio/x-wav': 'wav',
    'audio/ogg': 'ogg',
    'audio/mp4': 'm4a', 'audio/m4a': 'm4a', 'audio/x-m4a': 'm4a',
    'audio/webm': 'webm',
    'audio/aac': 'aac',
  };
  return map[mime] || 'audio';
}

function downloadJSON(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadBase64(filename, dataURL) {
  const a = document.createElement('a');
  a.href = dataURL; a.download = filename; a.click();
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function exportData() {
  const exportCards = state.cards.map(card => {
    const c = { ...card };
    if (card.hasAudio) {
      const b64 = loadAudio(card.id);
      if (b64) {
        const mime = b64.split(';')[0].slice(5);
        c.audioFile = `audio/${card.id}.${mimeToExt(mime)}`;
      } else {
        c.hasAudio = false;
      }
    }
    return c;
  });

  downloadJSON('cards.json', {
    version: 1,
    exportedAt: new Date().toISOString(),
    categories: state.categories,
    cards: exportCards,
  });

  let audioCount = 0;
  for (const card of state.cards) {
    if (!card.hasAudio) continue;
    const b64 = loadAudio(card.id);
    if (!b64) continue;
    const mime = b64.split(';')[0].slice(5);
    await new Promise(r => setTimeout(r, 400));
    downloadBase64(`${card.id}.${mimeToExt(mime)}`, b64);
    audioCount++;
  }

  const msg = audioCount
    ? `Exported cards.json + ${audioCount} audio file${audioCount !== 1 ? 's' : ''}. Place audio files in an audio/ folder in your project.`
    : 'Exported cards.json.';
  showToast(msg, 'success');
}

function openImportModal() {
  dom.importJsonFile.value = '';
  dom.importAudioFiles.value = '';
  hideFormError(dom.importFormError);
  openModal(dom.importModalOverlay);
}

function closeImportModal() {
  closeModal(dom.importModalOverlay);
}

async function handleImport() {
  hideFormError(dom.importFormError);
  const jsonFile = dom.importJsonFile.files[0];
  if (!jsonFile) {
    showFormError(dom.importFormError, 'Please select a cards.json file.');
    return;
  }

  const text = await jsonFile.text();
  let data;
  try { data = JSON.parse(text); } catch (_) {
    showFormError(dom.importFormError, 'Invalid JSON file.');
    return;
  }
  if (!Array.isArray(data.cards)) {
    showFormError(dom.importFormError, 'File does not look like a cards.json export.');
    return;
  }

  // Build audio file map keyed by filename
  const audioMap = {};
  for (const f of dom.importAudioFiles.files) audioMap[f.name] = f;

  // Clear existing audio
  for (const card of state.cards) {
    if (card.hasAudio) removeAudio(card.id);
  }

  // Restore cards
  state.cards = [];
  let audioRestored = 0;

  for (const raw of data.cards) {
    const card = { ...raw };
    // Migrate old single-category format
    if (!Array.isArray(card.categories)) {
      card.categories = card.category ? [card.category] : [];
      delete card.category;
    }
    // Restore audio
    if (card.hasAudio && card.audioFile) {
      const basename = card.audioFile.split('/').pop();
      const file = audioMap[basename];
      if (file) {
        const b64 = await fileToBase64(file);
        if (saveAudio(card.id, b64)) { audioRestored++; } else { card.hasAudio = false; }
      } else {
        card.hasAudio = false;
      }
    }
    delete card.audioFile;
    state.cards.push(card);
  }

  state.categories = data.categories || [];
  state.activeCategory = 'all';
  saveJSON(STORAGE_KEYS.CARDS, state.cards);
  saveJSON(STORAGE_KEYS.CATEGORIES, state.categories);

  closeImportModal();
  render();
  showToast(`Imported ${state.cards.length} cards${audioRestored ? ` + ${audioRestored} audio files` : ''}.`, 'success');
}

/* ------------------------------------------------------------------ */
/*  UTILITY                                                             */
/* ------------------------------------------------------------------ */

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ------------------------------------------------------------------ */
/*  KICK OFF                                                            */
/* ------------------------------------------------------------------ */

document.addEventListener('DOMContentLoaded', init);
