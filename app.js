/* ============================================================
   LATIN FLASH CARDS — app.js
   Pure vanilla JS. Data stored in Supabase (Postgres + Storage).
   ============================================================ */

'use strict';

/* ------------------------------------------------------------------ */
/*  SUPABASE CLIENT                                                     */
/* ------------------------------------------------------------------ */

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ------------------------------------------------------------------ */
/*  DATA HELPERS                                                        */
/* ------------------------------------------------------------------ */

function normalizeCard(row) {
  return {
    id:         row.id,
    latin:      row.latin,
    english:    row.english,
    notes:      row.notes      || '',
    categories: row.categories || [],
    hasAudio:   row.has_audio  || false,
    audioPath:  row.audio_path || null,
    createdAt:  row.created_at,
  };
}

function cardToRow(card) {
  return {
    id:          card.id,
    latin:       card.latin,
    english:     card.english,
    notes:       card.notes,
    categories:  card.categories,
    has_audio:   card.hasAudio,
    audio_path:  card.audioPath,
    created_at:  card.createdAt,
  };
}

/* ------------------------------------------------------------------ */
/*  STATE                                                               */
/* ------------------------------------------------------------------ */

let state = {
  cards:           [],     // [{ id, latin, english, notes, categories, hasAudio, audioPath, createdAt }]
  categories:      [],     // [string]
  activeCategory:  'all',  // 'all' | category name
  searchQuery:     '',
  // study
  studyCards:      [],
  studyIndex:      0,
  studyFlipped:    false,
  studyCategory:   'all',
  // edit
  pendingDeleteId:    null,
  pendingAudioFile:   null,   // File object awaiting upload
  pendingAudioRemove: false,
};

/* ------------------------------------------------------------------ */
/*  INIT                                                                */
/* ------------------------------------------------------------------ */

async function init() {
  showLoading(true);
  try {
    await loadData();
    if (state.cards.length === 0) await seedSampleData();
  } catch (err) {
    showToast('Failed to connect. Check your Supabase config.', 'error');
    console.error(err);
  } finally {
    showLoading(false);
  }
  bindEvents();
  render();
}

async function loadData() {
  const [cardsRes, catsRes] = await Promise.all([
    db.from('cards').select('*').order('created_at', { ascending: false }),
    db.from('categories').select('name').order('pos'),
  ]);
  if (cardsRes.error) throw cardsRes.error;
  if (catsRes.error)  throw catsRes.error;
  state.cards      = cardsRes.data.map(normalizeCard);
  state.categories = catsRes.data.map(r => r.name);
}

async function seedSampleData() {
  const catNames = ['Phrases', 'Verbs', 'Nouns'];
  const samples = [
    { latin: 'Carpe diem',             english: 'Seize the day',                 notes: "From Horace's Odes. Often used to encourage living in the moment.", category: 'Phrases' },
    { latin: 'Veni, vidi, vici',        english: 'I came, I saw, I conquered',    notes: "Julius Caesar's famous report of a swift victory.",                 category: 'Phrases' },
    { latin: 'Amare',                   english: 'To love',                       notes: '1st conjugation infinitive. Amo, amas, amat…',                      category: 'Verbs'   },
    { latin: 'Esse',                    english: 'To be',                         notes: 'Irregular verb: sum, es, est, sumus, estis, sunt',                   category: 'Verbs'   },
    { latin: 'Aqua',                    english: 'Water',                         notes: '1st declension feminine noun.',                                      category: 'Nouns'   },
    { latin: 'Lux',                     english: 'Light',                         notes: '3rd declension feminine. Lux, lucis.',                               category: 'Nouns'   },
    { latin: 'Amor vincit omnia',       english: 'Love conquers all',             notes: "From Virgil's Eclogues.",                                            category: 'Phrases' },
    { latin: 'Per aspera ad astra',     english: 'Through hardship to the stars', notes: 'Common motto adopted by many institutions.',                         category: 'Phrases' },
  ];

  const now = Date.now();
  const cardRows = samples.map((s, i) => ({
    id:         'seed_' + i,
    latin:      s.latin,
    english:    s.english,
    notes:      s.notes,
    categories: [s.category],
    has_audio:  false,
    audio_path: null,
    created_at: now - (samples.length - i) * 60000,
  }));
  const catRows = catNames.map((name, i) => ({ name, pos: i }));

  const [cardsRes, catsRes] = await Promise.all([
    db.from('cards').insert(cardRows),
    db.from('categories').insert(catRows),
  ]);
  if (cardsRes.error) throw cardsRes.error;
  if (catsRes.error)  throw catsRes.error;

  state.cards      = cardRows.map(normalizeCard);
  state.categories = catNames;
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
  loadingOverlay:    $('loading-overlay'),
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
  studyOverlay:       $('study-overlay'),
  studyCard:          $('study-card'),
  studyLatin:         $('study-latin'),
  studyEnglish:       $('study-english'),
  studyNotes:         $('study-notes'),
  studyCategoryBadge: $('study-category-badge'),
  studyAudioBtn:      $('study-audio-btn'),
  studyAudioBtnBack:  $('study-audio-btn-back'),
  studyIndexLabel:    $('study-index-label'),
  studyProgressBar:   $('study-progress-bar'),
  studyCategoryFilter:$('study-category-filter'),
  // export / import
  btnExport:          $('btn-export'),
  btnImport:          $('btn-import'),
  importModalOverlay: $('import-modal-overlay'),
  importZipFile:      $('import-zip-file'),
  importFormError:    $('import-form-error'),
  // toast
  toast:              $('toast'),
};

/* ------------------------------------------------------------------ */
/*  LOADING OVERLAY                                                     */
/* ------------------------------------------------------------------ */

function showLoading(visible) {
  dom.loadingOverlay.classList.toggle('hidden', !visible);
}

/* ------------------------------------------------------------------ */
/*  EVENT BINDING                                                       */
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
  $('import-confirm').addEventListener('click', () => handleImport().catch(e => showFormError(dom.importFormError, 'Import failed: ' + e.message)));

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
  if (dom.studyOverlay.classList.contains('hidden')) return;
  const tag = document.activeElement.tagName;
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;

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
  ul.appendChild(makeCategoryItem('all', 'All Cards', state.cards.length));
  for (const cat of state.categories) {
    const count = state.cards.filter(c => (c.categories || []).includes(cat)).length;
    ul.appendChild(makeCategoryItem(cat, cat, count));
  }
}

function makeCategoryItem(value, label, count) {
  const li  = document.createElement('li');
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
    delBtn.addEventListener('click', e => { e.stopPropagation(); deleteCategory(value); });
    div.appendChild(delBtn);
  }

  div.addEventListener('click', () => {
    state.activeCategory = value;
    renderSidebar();
    renderCardGrid();
    renderCardCount();
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
  for (const card of cards) dom.cardGrid.appendChild(makeBrowseCard(card));
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

  div.querySelector('[data-action="edit"]').addEventListener('click', () => openEditCardModal(card.id));
  div.querySelector('[data-action="delete"]').addEventListener('click', () => openDeleteModal(card.id));
  const playBtn = div.querySelector('[data-action="play"]');
  if (playBtn) playBtn.addEventListener('click', () => playAudioForCard(card));

  return div;
}

function renderCardCount() {
  const total = filteredCards().length;
  dom.cardCountLabel.textContent = total === 1 ? '1 card' : `${total} cards`;
}

/* ------------------------------------------------------------------ */
/*  CATEGORY SELECTS / CHECKBOXES                                       */
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
  state.pendingAudioFile   = null;
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

  state.pendingAudioFile   = null;
  state.pendingAudioRemove = false;

  dom.editCardId.value       = card.id;
  dom.modalTitle.textContent = 'Edit Card';
  dom.fieldLatin.value       = card.latin;
  dom.fieldEnglish.value     = card.english;
  dom.fieldNotes.value       = card.notes || '';
  dom.fieldNewCategory.value = '';
  hideFormError(dom.formError);
  renderCategorySelects();
  renderCategoryCheckboxes(card.categories || []);

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
  state.pendingAudioFile   = null;
  state.pendingAudioRemove = false;
}

async function handleCardFormSubmit(e) {
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

  const submitBtn = $('card-form-submit');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Saving…';

  try {
    if (newCat && !state.categories.includes(newCat)) {
      const { error } = await db.from('categories').insert({ name: newCat, pos: state.categories.length });
      if (error) throw error;
      state.categories.push(newCat);
      renderCategorySelects();
    }

    const editId   = dom.editCardId.value;
    const id       = editId || 'card_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    const existing = editId ? state.cards.find(c => c.id === editId) : null;

    let audioPath = existing?.audioPath ?? null;
    let hasAudio  = existing?.hasAudio  ?? false;

    if (state.pendingAudioRemove && audioPath) {
      await db.storage.from('audio').remove([audioPath]);
      audioPath = null;
      hasAudio  = false;
    }
    if (state.pendingAudioFile) {
      const ext = state.pendingAudioFile.name.split('.').pop().toLowerCase();
      audioPath = `${id}.${ext}`;
      const { error } = await db.storage.from('audio').upload(audioPath, state.pendingAudioFile, { upsert: true });
      if (error) throw error;
      hasAudio = true;
    }

    const card = {
      id, latin, english, notes, categories,
      hasAudio, audioPath,
      createdAt: existing?.createdAt ?? Date.now(),
    };

    const { error: saveErr } = await db.from('cards').upsert(cardToRow(card));
    if (saveErr) throw saveErr;

    if (editId) {
      const idx = state.cards.findIndex(c => c.id === editId);
      if (idx !== -1) state.cards[idx] = card;
    } else {
      state.cards.unshift(card);
    }

    showToast(editId ? 'Card updated.' : 'Card created!', 'success');
    closeCardModal();
    render();
  } catch (err) {
    showFormError(dom.formError, 'Save failed: ' + err.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Save Card';
  }
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

  state.pendingAudioFile   = file;
  state.pendingAudioRemove = false;
  setAudioUploadUI(file.name, true);
}

function clearAudioPending() {
  state.pendingAudioFile   = null;
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

async function handleCategoryFormSubmit(e) {
  e.preventDefault();
  hideFormError(dom.catFormError);
  const name = dom.fieldCatName.value.trim();
  if (!name) { showFormError(dom.catFormError, 'Category name is required.'); return; }
  if (state.categories.includes(name)) { showFormError(dom.catFormError, 'Category already exists.'); return; }

  try {
    const { error } = await db.from('categories').insert({ name, pos: state.categories.length });
    if (error) throw error;
    state.categories.push(name);
    closeCategoryModal();
    renderSidebar();
    renderCategorySelects();
    showToast(`Category "${name}" created.`, 'success');
  } catch (err) {
    showFormError(dom.catFormError, 'Failed to save: ' + err.message);
  }
}

async function deleteCategory(name) {
  if (!confirm(`Delete category "${name}"? Cards in this category will become uncategorized.`)) return;

  try {
    const { error } = await db.from('categories').delete().eq('name', name);
    if (error) throw error;

    state.categories = state.categories.filter(c => c !== name);

    const affected = state.cards.filter(c => (c.categories || []).includes(name));
    for (const card of affected) {
      card.categories = card.categories.filter(c => c !== name);
      const { error: updErr } = await db.from('cards').update({ categories: card.categories }).eq('id', card.id);
      if (updErr) throw updErr;
    }

    if (state.activeCategory === name) state.activeCategory = 'all';
    render();
    showToast(`Category "${name}" deleted.`, 'success');
  } catch (err) {
    showToast('Failed to delete category: ' + err.message, 'error');
  }
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

async function confirmDeleteCard() {
  const id = state.pendingDeleteId;
  if (!id) return;

  const card = state.cards.find(c => c.id === id);

  try {
    if (card?.audioPath) {
      await db.storage.from('audio').remove([card.audioPath]);
    }
    const { error } = await db.from('cards').delete().eq('id', id);
    if (error) throw error;

    state.cards = state.cards.filter(c => c.id !== id);
    closeDeleteModal();
    render();
    showToast('Card deleted.', 'success');
  } catch (err) {
    showToast('Failed to delete: ' + err.message, 'error');
    closeDeleteModal();
  }
}

/* ------------------------------------------------------------------ */
/*  AUDIO PLAYBACK                                                      */
/* ------------------------------------------------------------------ */

let currentAudioEl = null;

function getAudioUrl(audioPath) {
  return db.storage.from('audio').getPublicUrl(audioPath).data.publicUrl;
}

function playAudioForCard(card) {
  if (!card.audioPath) { showToast('No audio for this card.', 'error'); return; }
  if (currentAudioEl) { currentAudioEl.pause(); currentAudioEl = null; }
  const audio = new Audio(getAudioUrl(card.audioPath));
  currentAudioEl = audio;
  audio.play().catch(err => showToast('Audio playback error: ' + err.message, 'error'));
}

function playCardAudio() {
  if (state.studyCards.length === 0) return;
  const card = state.studyCards[state.studyIndex];
  if (!card) return;
  playAudioForCard(card);
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
  state.studyCards   = cards;
  state.studyIndex   = 0;
  state.studyFlipped = false;
  dom.studyCard.classList.remove('flipped');
}

function shuffleStudy() {
  const arr = state.studyCards;
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  state.studyIndex   = 0;
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
    dom.studyLatin.textContent         = 'No cards';
    dom.studyEnglish.textContent       = '';
    dom.studyNotes.textContent         = '';
    dom.studyCategoryBadge.textContent = '';
    dom.studyIndexLabel.textContent    = '0 / 0';
    dom.studyProgressBar.style.width   = '0%';
    dom.studyAudioBtn.classList.add('hidden');
    dom.studyAudioBtnBack.classList.add('hidden');
    return;
  }

  const idx  = state.studyIndex;
  const card = state.studyCards[idx];

  dom.studyLatin.textContent         = card.latin;
  dom.studyEnglish.textContent       = card.english;
  dom.studyNotes.textContent         = card.notes || '';
  dom.studyCategoryBadge.textContent = (card.categories || []).join(' · ');
  dom.studyIndexLabel.textContent    = `${idx + 1} / ${total}`;
  dom.studyProgressBar.style.width   = `${((idx + 1) / total) * 100}%`;

  dom.studyAudioBtn.classList.toggle('hidden', !card.hasAudio);
  dom.studyAudioBtnBack.classList.toggle('hidden', !card.hasAudio);

  if (currentAudioEl) { currentAudioEl.pause(); currentAudioEl = null; }
}

/* ------------------------------------------------------------------ */
/*  MODAL HELPERS                                                       */
/* ------------------------------------------------------------------ */

function openModal(overlay) {
  overlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  overlay._escHandler = e => { if (e.key === 'Escape') closeModal(overlay); };
  document.addEventListener('keydown', overlay._escHandler);
}

function closeModal(overlay) {
  overlay.classList.add('hidden');
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

// ── CSV helpers ──────────────────────────────────────────────────────

function csvEscape(val) {
  const s = String(val == null ? '' : val);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function cardsToCSV(cards) {
  const headers = ['id', 'latin', 'english', 'notes', 'categories', 'audio_file'];
  const rows = cards.map(card => [
    card.id,
    card.latin,
    card.english,
    card.notes || '',
    (card.categories || []).join('|'),
    card.audioPath || '',
  ]);
  return [headers, ...rows].map(row => row.map(csvEscape).join(',')).join('\n');
}

function parseCSVLine(line) {
  const fields = [];
  let field = '', inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { field += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { fields.push(field); field = ''; }
      else { field += ch; }
    }
  }
  fields.push(field);
  return fields;
}

function parseCSV(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]).map(h => h.trim());
  return lines.slice(1).map(line => {
    const values = parseCSVLine(line);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (values[i] || '').trim(); });
    return obj;
  });
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── Export ───────────────────────────────────────────────────────────

async function exportData() {
  const btn = dom.btnExport;
  btn.disabled = true;
  btn.textContent = 'Exporting…';

  try {
    const zip = new JSZip();
    zip.file('cards.csv', cardsToCSV(state.cards));

    const audioFolder = zip.folder('audio');
    let audioCount = 0;
    for (const card of state.cards) {
      if (!card.audioPath) continue;
      const { data, error } = await db.storage.from('audio').download(card.audioPath);
      if (error || !data) continue;
      audioFolder.file(card.audioPath, data);
      audioCount++;
    }

    const blob = await zip.generateAsync({ type: 'blob' });
    downloadBlob('latin-flash-cards-export.zip', blob);
    showToast(`Exported ${state.cards.length} cards${audioCount ? ` + ${audioCount} audio files` : ''}.`, 'success');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Export';
  }
}

// ── Import ───────────────────────────────────────────────────────────

function openImportModal() {
  dom.importZipFile.value = '';
  hideFormError(dom.importFormError);
  openModal(dom.importModalOverlay);
}

function closeImportModal() {
  closeModal(dom.importModalOverlay);
}

async function handleImport() {
  hideFormError(dom.importFormError);
  const file = dom.importZipFile.files[0];
  if (!file) { showFormError(dom.importFormError, 'Please select a ZIP file.'); return; }

  const btn = $('import-confirm');
  btn.disabled = true;
  btn.textContent = 'Importing…';

  try {
    const zip = await JSZip.loadAsync(file);

    const csvFile = zip.file('cards.csv');
    if (!csvFile) throw new Error('No cards.csv found in ZIP.');
    const csvText = await csvFile.async('string');
    const rows = parseCSV(csvText);
    if (rows.length === 0) throw new Error('cards.csv is empty or invalid.');

    // Build audio filename map and card rows
    const audioFileMap = {};
    const cardRows = rows.map(row => {
      const id = (row.id && row.id.trim())
        ? row.id.trim()
        : 'card_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
      if (row.audio_file) audioFileMap[id] = row.audio_file;
      return {
        id,
        latin:      row.latin      || '',
        english:    row.english    || '',
        notes:      row.notes      || '',
        categories: row.categories ? row.categories.split('|').filter(Boolean) : [],
        has_audio:  false,
        audio_path: null,
        created_at: Date.now(),
      };
    }).filter(r => r.latin && r.english);

    // Upload audio files
    for (const row of cardRows) {
      const audioFileName = audioFileMap[row.id];
      if (!audioFileName) continue;
      const audioEntry = zip.file('audio/' + audioFileName);
      if (!audioEntry) continue;
      const blob = await audioEntry.async('blob');
      const ext  = audioFileName.split('.').pop().toLowerCase();
      const audioPath = `${row.id}.${ext}`;
      const { error } = await db.storage.from('audio').upload(audioPath, blob, { upsert: true });
      if (!error) { row.has_audio = true; row.audio_path = audioPath; }
    }

    // Extract categories preserving order of first appearance
    const allCats = [...new Set(cardRows.flatMap(r => r.categories))];

    // Replace all existing data
    await db.from('cards').delete().not('id', 'is', null);
    await db.from('categories').delete().not('id', 'is', null);

    if (cardRows.length > 0) {
      const { error } = await db.from('cards').insert(cardRows);
      if (error) throw error;
    }
    if (allCats.length > 0) {
      const { error } = await db.from('categories').insert(allCats.map((name, i) => ({ name, pos: i })));
      if (error) throw error;
    }

    await loadData();
    state.activeCategory = 'all';
    closeImportModal();
    render();
    showToast(`Imported ${cardRows.length} cards.`, 'success');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Import';
  }
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
