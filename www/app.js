'use strict';
const $ = (s, r = document) => r.querySelector(s);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

// ---------- icons ----------
const IC = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4-4"/>',
  sliders: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
  book: '<path d="M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h10"/>',
  marker: '<path d="M4 20h6l10-10-6-6L4 14z"/><path d="M13 5l6 6"/>',
  share: '<path d="M12 15V4M8 8l4-4 4 4"/><path d="M5 12v7h14v-7"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  dots: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
  trash: '<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/>',
  check: '<path d="M5 13l4 4 10-10"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  leaf: '<path d="M5 19C5 9 11 4 20 4c0 9-5 15-13 15M5 19l8-8"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  file: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4"/>',
  open: '<path d="M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/>',
};
const icon = (n) => `<svg viewBox="0 0 24 24" class="ic">${IC[n]}</svg>`;
const paintIcons = (root = document) => root.querySelectorAll('[data-ic]').forEach((e) => { e.innerHTML = icon(e.dataset.ic); });

// ---------- storage (IndexedDB) ----------
let db;
function openDb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('leaf', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('items', { keyPath: 'id' });
    r.onsuccess = () => { db = r.result; res(); };
    r.onerror = () => rej(r.error);
  });
}
const tx = (m) => db.transaction('items', m).objectStore('items');
const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const allItems = () => req(tx('readonly').getAll());
const putItem = (it) => req(tx('readwrite').put(it));
const delItem = (id) => req(tx('readwrite').delete(id));
const clearItems = () => req(tx('readwrite').clear());

// ---------- settings ----------
const defaults = { theme: 'paper', light: 100, contrast: 100, warmth: 0, grain: 0, size: 19, font: "'Noto Serif','Noto Serif Telugu',Georgia,serif", width: '100', flip: true };
let S = Object.assign({}, defaults, JSON.parse(localStorage.getItem('leafS') || '{}'));
function applySettings() {
  document.body.className = S.theme;
  const r = document.documentElement.style;
  r.setProperty('--fs', S.size + 'px');
  r.setProperty('--ff', S.font);
  r.setProperty('--w', S.width + '%');
  $('#dim').style.opacity = ((100 - S.light) / 100) * 0.85;
  $('#warm').style.opacity = (S.warmth / 100) * 0.4;
  $('#grainLayer').style.opacity = (S.grain / 100) * 0.35;
  $('#content').style.opacity = 0.55 + (S.contrast / 100) * 0.45;
  localStorage.setItem('leafS', JSON.stringify(S));
  const key = [S.size, S.font, S.width, S.flip].join('|');
  if (key !== lastLayoutKey) {
    lastLayoutKey = key;
    clearTimeout(relayoutTimer);
    relayoutTimer = setTimeout(() => { if (typeof relayout === 'function') relayout(); }, 200);
  }
}
let lastLayoutKey = null, relayoutTimer;

// ---------- small helpers ----------
let toastTimer;
function toast(msg, ms = 2200) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}
const esc = (s) => s.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
const textOf = (html) => { const d = document.createElement('div'); d.innerHTML = html; return d.textContent.toLowerCase(); };
const hash = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };

// ---------- back gesture: the Android side asks us first (see MainActivity) ----------
const closers = [];
function pushLayer(fn) { closers.push(fn); }
function closeLayer(after) { const f = closers.pop(); if (f) f(); if (after) after(); }
// returns true when the app handled "back" itself; false lets Android send the app to the background
window.__back = () => {
  if (closers.length) { closeLayer(); return true; }
  if (!$('#libraryView').hidden) return false;
  showView('library'); return true;
};

// ---------- sheets ----------
function openSheet(node, clear) {
  const b = $('#backdrop');
  $('#sheet').innerHTML = ''; $('#sheet').appendChild(node);
  b.classList.toggle('clear', !!clear);
  requestAnimationFrame(() => b.classList.add('show'));
  pushLayer(() => b.classList.remove('show'));
}
function actionSheet(title, actions) {
  const box = el('div');
  if (title) box.appendChild(el('div', 'sheet-title')).textContent = title;
  const grp = el('div', 'group');
  actions.forEach((a) => {
    const b = el('button', 'act' + (a.danger ? ' danger' : ''), (a.ic ? icon(a.ic) : '') + '<span></span>');
    b.querySelector('span').textContent = a.label;
    b.onclick = () => { if (a.now) a.run(); closeLayer(a.now ? null : a.run); };
    grp.appendChild(b);
  });
  box.appendChild(grp);
  const c = el('button', 'cancel', 'Cancel'); c.onclick = () => closeLayer();
  box.appendChild(c);
  openSheet(box);
}
$('#backdrop').addEventListener('click', (e) => { if (e.target.id === 'backdrop') closeLayer(); });

// ---------- sharing ----------
async function shareText({ title, text, url }) {
  const P = window.Capacitor && window.Capacitor.Plugins;
  try {
    if (P && P.Share) { await P.Share.share({ title, text, url, dialogTitle: 'Share' }); return; }
    if (navigator.share) { await navigator.share({ title, text, url }); return; }
  } catch (e) { if (/cancel|abort/i.test((e && e.message) || '')) return; }
  try { await navigator.clipboard.writeText([text, url].filter(Boolean).join('\n')); toast('Copied to clipboard'); }
  catch (e) { toast('Sharing is not available'); }
}
async function shareItem(it) {
  const P = window.Capacitor && window.Capacitor.Plugins;
  if (it.pdf && P && P.Filesystem && P.Share) {   // share the PDF file itself
    try {
      const data = (await blobToData(it.pdf)).split(',')[1];
      const r = await P.Filesystem.writeFile({ path: it.title.replace(/[^\w\- ]+/g, '_').slice(0, 60) + '.pdf', data, directory: 'CACHE' });
      await P.Share.share({ title: it.title, url: r.uri }); return;
    } catch (e) { if (/cancel/i.test((e && e.message) || '')) return; }
  }
  const q = (it.highlights || []).map((h) => '\u201C' + h.text + '\u201D').join('\n\n');
  shareText({ title: it.title, text: it.title + (q ? '\n\n' + q : ''), url: it.url });
}

// ---------- importing ----------
const SAFE = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'LI', 'UL', 'OL', 'EM', 'I', 'STRONG', 'B', 'BR', 'PRE', 'CODE']);
function clean(node) {
  let out = '';
  node.childNodes.forEach((n) => {
    if (n.nodeType === 3) out += esc(n.textContent);
    else if (n.nodeType === 1) {
      const t = n.tagName.toUpperCase();
      if (t === 'SCRIPT' || t === 'STYLE') return;
      const inner = clean(n);
      out += SAFE.has(t) ? `<${t.toLowerCase()}>${inner}</${t.toLowerCase()}>` : inner;
    }
  });
  return out;
}
const dirOf = (p) => { const i = p.lastIndexOf('/'); return i < 0 ? '' : p.slice(0, i + 1); };
function resolve(base, rel) {
  const parts = (base + decodeURIComponent(rel.split('#')[0])).split('/'); const out = [];
  for (const p of parts) { if (p === '..') out.pop(); else if (p && p !== '.') out.push(p); }
  return out.join('/');
}
function shrink(blob) {
  return new Promise((res) => {
    const img = new Image(), u = URL.createObjectURL(blob);
    img.onload = () => {
      const w = 260, h = Math.round(img.height * w / img.width);
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h); URL.revokeObjectURL(u); res(c.toDataURL('image/jpeg', 0.78));
    };
    img.onerror = () => res(null); img.src = u;
  });
}
async function epubCover(zip, opf, base) {
  try {
    let href;
    const ci = opf.querySelector('manifest > item[properties~="cover-image"]');
    if (ci) href = ci.getAttribute('href');
    else {
      const meta = [...opf.getElementsByTagName('meta')].find((m) => m.getAttribute('name') === 'cover');
      if (meta) { const it = [...opf.querySelectorAll('manifest > item')].find((i) => i.getAttribute('id') === meta.getAttribute('content')); if (it) href = it.getAttribute('href'); }
    }
    if (!href) return null;
    const f = zip.file(resolve(base, href)); if (!f) return null;
    return await shrink(new Blob([await f.async('uint8array')]));
  } catch (e) { return null; }
}
async function parseEpub(file) {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const xml = async (p) => new DOMParser().parseFromString(await zip.file(p).async('string'), 'application/xml');
  const container = await xml('META-INF/container.xml');
  const opfPath = container.querySelector('rootfile').getAttribute('full-path');
  const opf = await xml(opfPath);
  const base = dirOf(opfPath);
  const title = (opf.getElementsByTagName('dc:title')[0] || {}).textContent || file.name.replace(/\.epub$/i, '');
  const manifest = {};
  opf.querySelectorAll('manifest > item').forEach((i) => { manifest[i.getAttribute('id')] = i.getAttribute('href'); });
  let html = '';
  for (const ref of opf.querySelectorAll('spine > itemref')) {
    const href = manifest[ref.getAttribute('idref')]; if (!href) continue;
    const f = zip.file(resolve(base, href)); if (!f) continue;
    const doc = new DOMParser().parseFromString(await f.async('string'), 'text/html');
    html += clean(doc.body) + '<hr>';
  }
  return { title: title.trim(), kind: 'book', html, cover: await epubCover(zip, opf, base) };
}
async function parseText(file) {
  const t = await file.text();
  const html = t.split(/\n{2,}/).map((p) => '<p>' + esc(p).replace(/\n/g, '<br>') + '</p>').join('');
  return { title: file.name.replace(/\.[^.]+$/, ''), kind: 'document', html };
}
function getPdf(buf) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdf.worker.min.js';
  return pdfjsLib.getDocument({ data: new Uint8Array(buf), cMapUrl: 'cmaps/', cMapPacked: true, standardFontDataUrl: 'standard_fonts/' }).promise;
}
// The PDF file itself is kept and drawn page by page, so pictures, layout and Telugu look exactly like the original.
async function parsePdf(file) {
  const buf = await file.arrayBuffer();
  const pdf = await getPdf(buf.slice(0));
  let txt = '';
  try {
    for (let i = 1; i <= Math.min(pdf.numPages, 300) && txt.length < 400000; i++) {
      const tc = await (await pdf.getPage(i)).getTextContent();
      txt += tc.items.map((x) => x.str).join(' ') + ' ';
    }
  } catch (e) { /* search text is optional */ }
  let cover = null;
  try {
    const page = await pdf.getPage(1), v1 = page.getViewport({ scale: 1 }), vp = page.getViewport({ scale: 260 / v1.width });
    const cv = document.createElement('canvas'); cv.width = Math.floor(vp.width); cv.height = Math.floor(vp.height);
    await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
    cover = cv.toDataURL('image/jpeg', 0.78);
  } catch (e) { /* no cover */ }
  const pages = pdf.numPages; pdf.destroy();
  return { title: file.name.replace(/\.pdf$/i, ''), kind: 'document', html: '', pdf: new Blob([buf], { type: 'application/pdf' }), pages, cover, searchText: txt };
}
async function parseLink(url) {
  const http = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.CapacitorHttp;
  let body;
  if (http) body = (await http.get({ url })).data; else body = await (await fetch(url)).text();
  const doc = new DOMParser().parseFromString(String(body), 'text/html');
  doc.querySelectorAll('script,style,nav,header,footer,aside,form').forEach((n) => n.remove());
  let best = doc.querySelector('article'), score = 0;
  if (!best) doc.querySelectorAll('div,section,main').forEach((n) => { const s = n.querySelectorAll(':scope > p').length; if (s > score) { score = s; best = n; } });
  best = best || doc.body;
  const title = (doc.querySelector('title') || {}).textContent || url;
  return { title: title.trim(), kind: 'article', html: clean(best), url };
}
async function addItem(p) {
  const it = Object.assign({ id: 'i' + Date.now() + Math.floor(Math.random() * 999), progress: 0, finished: false, added: Date.now(), lastRead: 0, seconds: 0, highlights: [] }, p);
  it.search = (it.title + ' ' + (it.searchText || textOf(it.html))).toLowerCase();
  delete it.searchText;
  await putItem(it);
  renderList();
}
async function importFile(f) {
  toast('Adding\u2026', 8000);
  try {
    await addItem(/\.epub$/i.test(f.name) ? await parseEpub(f) : /\.pdf$/i.test(f.name) ? await parsePdf(f) : await parseText(f));
    toast('Added to your library');
  } catch (err) { toast('Could not open this file: ' + err.message, 4500); }
}
async function importLink(url) {
  toast('Saving link\u2026', 8000);
  try { await addItem(await parseLink(url)); toast('Saved to your library'); }
  catch (err) { toast('Could not save this link: ' + err.message, 4500); }
}

// ---------- backup ----------
const blobToData = (b) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b); });
async function exportBackup() {
  toast('Preparing backup\u2026', 6000);
  const items = await allItems();
  for (const it of items) if (it.pdf) it.pdf = await blobToData(it.pdf);
  const json = JSON.stringify({ v: 2, items });
  const name = 'leaf-backup-' + new Date().toISOString().slice(0, 10) + '.json';
  const P = window.Capacitor && window.Capacitor.Plugins;
  try {
    if (P && P.Filesystem && P.Share) {
      const r = await P.Filesystem.writeFile({ path: name, data: json, directory: 'CACHE', encoding: 'utf8' });
      await P.Share.share({ title: name, url: r.uri }); return;
    }
  } catch (e) { /* fall back to a plain download */ }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' })); a.download = name; a.click();
}
async function importBackup(file) {
  const data = JSON.parse(await file.text());
  if (!data.items) throw new Error('Not a Leaf Reader backup');
  const mine = new Map((await allItems()).map((i) => [i.id, i]));
  for (const inc of data.items) {
    if (typeof inc.pdf === 'string') inc.pdf = await (await fetch(inc.pdf)).blob();
    const old = mine.get(inc.id);
    if (!old) { await putItem(inc); continue; }
    const win = (inc.lastRead || 0) > (old.lastRead || 0) ? inc : old;
    const seen = new Set();
    win.highlights = [...(old.highlights || []), ...(inc.highlights || [])].filter((h) => !seen.has(h.start + ':' + h.end) && seen.add(h.start + ':' + h.end));
    win.finished = old.finished || inc.finished;
    await putItem(win);
  }
  renderList(); toast('Library restored');
}

// ---------- shared from other apps ----------
async function drainShared() {
  const q = window.__q || []; window.__q = [];
  for (const t of q) {
    const m = t.match(/https?:\/\/\S+/);
    if (m) await importLink(m[0]);
    else { await addItem({ title: t.slice(0, 40), kind: 'document', html: '<p>' + esc(t) + '</p>' }); toast('Saved to your library'); }
  }
}
window.__shared = drainShared;

// ---------- library ----------
let tab = 'all', kind = 'all', sortMode = 'recent';
function coverNode(it, small) {
  const h = 90 + (hash(it.title) % 150);
  const c = el('div', 'cover');
  c.style.background = `linear-gradient(150deg,hsl(${h},38%,60%),hsl(${(h + 30) % 360},42%,42%))`;
  if (it.cover) { const im = el('img'); im.src = it.cover; im.alt = ''; c.appendChild(im); }
  else {
    const t = el('div', 'ct'); t.textContent = it.title; c.appendChild(t);
    c.appendChild(el('div', 'ck', icon(it.kind === 'article' ? 'link' : it.kind === 'book' ? 'leaf' : 'file')));
  }
  return c;
}
const pctOf = (it) => it.finished ? 100 : Math.round(it.progress * 100);
async function renderList() {
  const q = $('#search').value.trim().toLowerCase();
  const everything = await allItems();
  let items = everything.filter((i) =>
    (kind === 'all' || i.kind === kind) &&
    (tab === 'all' || (tab === 'finished' ? i.finished : !i.finished && i.progress > 0)) &&
    (!q || i.search.includes(q)));
  items.sort(sortMode === 'az' ? (a, b) => a.title.localeCompare(b.title) : (a, b) => (b.lastRead || b.added) - (a.lastRead || a.added));
  $('#sortBtn').textContent = sortMode === 'az' ? 'A to Z' : 'Recent';
  $('#empty').hidden = everything.length > 0;
  $('#tabs').hidden = $('#kinds').hidden = $('.search').hidden = everything.length === 0;

  // continue reading card
  const hero = $('#hero'); hero.innerHTML = '';
  const cont = everything.filter((i) => !i.finished && i.progress > 0 && i.lastRead).sort((a, b) => b.lastRead - a.lastRead)[0];
  if (cont && tab === 'all' && kind === 'all' && !q) {
    const h = el('div', 'hero');
    h.appendChild(coverNode(cont));
    const m = el('div', 'meta', '<small>Continue reading</small><b></b><span class="prog"></span><div class="pbar"><i></i></div>');
    m.querySelector('b').textContent = cont.title;
    m.querySelector('.prog').textContent = pctOf(cont) + '% \u00B7 ' + Math.round(cont.seconds / 60) + ' min read';
    m.querySelector('i').style.width = pctOf(cont) + '%';
    h.appendChild(m); h.onclick = () => openReader(cont); hero.appendChild(h);
  }

  const grid = $('#grid'); grid.innerHTML = '';
  items.forEach((it) => {
    const card = el('div', 'card');
    const cv = coverNode(it); card.appendChild(cv);
    if (it.finished) cv.appendChild(el('div', 'badge', 'Finished'));
    const dots = el('button', 'dots', icon('dots')); dots.setAttribute('aria-label', 'More');
    dots.onclick = (e) => { e.stopPropagation(); itemMenu(it); };
    cv.appendChild(dots);
    const info = el('div', 'cinfo', '<b></b><small><span></span><span></span></small><div class="pbar"><i></i></div>');
    info.querySelector('b').textContent = it.title;
    const sp = info.querySelectorAll('small span');
    sp[0].textContent = it.kind === 'article' ? 'Article' : it.kind === 'book' ? 'Book' : 'Document';
    sp[1].textContent = it.finished ? 'Done' : it.progress > 0 ? pctOf(it) + '%' : 'New';
    info.querySelector('i').style.width = pctOf(it) + '%';
    card.appendChild(info);
    card.onclick = () => openReader(it);
    let lp; // long press opens the menu
    card.addEventListener('touchstart', () => { lp = setTimeout(() => { lp = null; itemMenu(it); }, 550); }, { passive: true });
    ['touchend', 'touchmove', 'touchcancel'].forEach((ev) => card.addEventListener(ev, () => clearTimeout(lp), { passive: true }));
    grid.appendChild(card);
  });
  if (everything.length && !items.length) grid.appendChild(el('p', 'note', 'Nothing matches. Try another search or filter.'));
}
function itemMenu(it) {
  actionSheet(it.title, [
    { label: 'Open', ic: 'open', run: () => openReader(it) },
    { label: 'Share', ic: 'share', run: () => shareItem(it) },
    { label: it.finished ? 'Mark as unfinished' : 'Mark as finished', ic: 'check', run: async () => { it.finished = !it.finished; if (!it.finished && it.progress >= 0.99) it.progress = 0; await putItem(it); renderList(); } },
    { label: 'Delete', ic: 'trash', danger: true, run: () => confirmDelete(it) },
  ]);
}
function confirmDelete(it) {
  actionSheet('Delete \u201C' + it.title + '\u201D and its highlights? This cannot be undone.', [
    { label: 'Delete', ic: 'trash', danger: true, run: async () => { await delItem(it.id); toast('Deleted'); renderList(); } },
  ]);
}
function addMenu() {
  actionSheet('Add to your library', [
    { label: 'Choose a file (EPUB, PDF, TXT)', ic: 'file', now: true, run: () => $('#fileInput').click() },
    { label: 'Paste a web link', ic: 'link', run: linkSheet },
  ]);
}
function linkSheet() {
  const box = el('div', 'linkbox', '<h3>Add a web link</h3><input type="url" placeholder="https://" autocapitalize="off"><button class="primary">Save to library</button><button class="cancel">Cancel</button>');
  const input = $('input', box);
  $('.primary', box).onclick = () => { const u = input.value.trim(); if (!u) return; closeLayer(() => importLink(u)); };
  $('.cancel', box).onclick = () => closeLayer();
  openSheet(box);
  setTimeout(() => input.focus(), 350);
}
function wireLibrary() {
  $('#addBtn').onclick = addMenu; $('#emptyAdd').onclick = addMenu;
  $('#fileInput').onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) importFile(f); };
  $('#backupInput').onchange = async (e) => {
    const f = e.target.files[0]; e.target.value = '';
    if (f) try { await importBackup(f); } catch (err) { toast('Could not restore: ' + err.message, 4000); }
  };
  $('#search').oninput = renderList;
  $('#sortBtn').onclick = () => actionSheet('Sort by', [
    { label: 'Recently read', run: () => { sortMode = 'recent'; renderList(); } },
    { label: 'Title, A to Z', run: () => { sortMode = 'az'; renderList(); } },
  ]);
  document.querySelectorAll('#tabs button').forEach((b) => b.onclick = () => { tab = b.dataset.tab; document.querySelectorAll('#tabs button').forEach((x) => x.classList.toggle('on', x === b)); renderList(); });
  document.querySelectorAll('#kinds button[data-kind]').forEach((b) => b.onclick = () => { kind = b.dataset.kind; document.querySelectorAll('#kinds button[data-kind]').forEach((x) => x.classList.toggle('on', x === b)); renderList(); });
  document.querySelectorAll('#tabbar button').forEach((b) => b.onclick = () => showView(b.dataset.view));
}

// ---------- tabs: library / highlights / settings ----------
function showView(v) {
  ['library', 'highlights', 'settings'].forEach((n) => { $('#' + n + 'View').hidden = n !== v; });
  document.querySelectorAll('#tabbar button').forEach((b) => b.classList.toggle('on', b.dataset.view === v));
  if (v === 'library') renderList(); else if (v === 'highlights') renderHighlights(); else renderSettings();
}
async function renderHighlights() {
  const host = $('#hlList'); host.innerHTML = '';
  const items = (await allItems()).filter((i) => (i.highlights || []).length);
  if (!items.length) { host.appendChild(el('div', 'empty', '<div class="empty-leaf">' + icon('marker') + '</div><h2>No highlights yet</h2><p>While reading, select some text and tap Highlight. It will show up here.</p>')); return; }
  items.forEach((it) => {
    host.appendChild(el('div', 'hl-book')).textContent = it.title;
    const g = el('div', 'group');
    it.highlights.forEach((h, idx) => {
      const row = el('div', 'hl-item', '<q></q><button aria-label="Delete highlight">' + icon('x') + '</button>');
      $('q', row).textContent = h.text;
      row.onclick = () => openReader(it, { jump: idx });
      $('button', row).onclick = async (e) => { e.stopPropagation(); it.highlights.splice(idx, 1); await putItem(it); renderHighlights(); };
      g.appendChild(row);
    });
    host.appendChild(g);
  });
}

// ---------- controls (used in Settings and in the reader sheet) ----------
function buildControls(host) {
  host.innerHTML = '';
  const g = el('div', 'group');
  const themeRow = el('div', 'line seg-line', '<div class="segmented" style="width:100%"></div>');
  const seg = $('.segmented', themeRow);
  [['paper', 'Paper'], ['dusk', 'Dusk'], ['ink', 'Ink']].forEach(([k, name]) => {
    const b = el('button', S.theme === k ? 'on' : '', name);
    b.onclick = () => { S.theme = k; applySettings(); seg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); };
    seg.appendChild(b);
  });
  g.appendChild(themeRow);
  const styleRow = el('div', 'line seg-line', '<div class="segmented" style="width:100%"></div>');
  const seg2 = $('.segmented', styleRow);
  [[true, 'Flip pages'], [false, 'Scroll']].forEach(([k, name]) => {
    const b = el('button', (S.flip !== false) === k ? 'on' : '', name);
    b.onclick = () => { S.flip = k; applySettings(); seg2.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); };
    seg2.appendChild(b);
  });
  g.appendChild(styleRow);
  const slider = (label, key, min, max) => {
    const l = el('label', 'line', '<span></span><input type="range">'); $('span', l).textContent = label;
    const r = $('input', l); r.min = min; r.max = max; r.value = S[key];
    r.oninput = () => { S[key] = +r.value; applySettings(); }; g.appendChild(l);
  };
  slider('Light', 'light', 5, 100); slider('Contrast', 'contrast', 0, 100);
  slider('Warmth', 'warmth', 0, 100); slider('Grain', 'grain', 0, 100); slider('Text size', 'size', 14, 30);
  const select = (label, key, opts) => {
    const l = el('label', 'line', '<span></span><select></select>'); $('span', l).textContent = label;
    const s = $('select', l);
    opts.forEach(([v, n]) => { const o = el('option'); o.value = v; o.textContent = n; s.appendChild(o); });
    s.value = S[key]; s.onchange = () => { S[key] = s.value; applySettings(); }; g.appendChild(l);
  };
  select('Font', 'font', [["'Noto Serif','Noto Serif Telugu',Georgia,serif", 'Serif'], ["system-ui,'Roboto',sans-serif", 'Sans'], ["'Courier New',monospace", 'Mono']]);
  select('Page width', 'width', [['100', 'Full page'], ['80', '80%'], ['60', '60%'], ['40', '40%']]);
  host.appendChild(g);
}
async function renderSettings() {
  const host = $('#settingsBody'); host.innerHTML = '';
  host.appendChild(el('div', 'gh', 'Appearance'));
  const ctl = el('div'); host.appendChild(ctl); buildControls(ctl);

  const items = await allItems();
  const secs = items.reduce((a, i) => a + (i.seconds || 0), 0);
  const nHl = items.reduce((a, i) => a + (i.highlights || []).length, 0);
  host.appendChild(el('div', 'gh', 'Your reading'));
  const st = el('div', 'group', `<div class="line"><span>Items</span><span class="val">${items.length}</span></div><div class="line"><span>Time reading</span><span class="val">${Math.floor(secs / 3600)} h ${Math.round((secs % 3600) / 60)} min</span></div><div class="line"><span>Highlights</span><span class="val">${nHl}</span></div>`);
  host.appendChild(st);

  host.appendChild(el('div', 'gh', 'Your library'));
  const lib = el('div', 'group');
  const line = (label, ic, fn, danger) => { const b = el('button', 'line' + (danger ? ' danger' : ''), '<span></span>' + icon(ic)); $('span', b).textContent = label; b.onclick = fn; lib.appendChild(b); };
  line('Back up library', 'share', exportBackup);
  line('Restore from backup', 'file', () => $('#backupInput').click());
  line('Delete all books', 'trash', () => actionSheet('Delete every book, article and highlight from this phone? This cannot be undone.', [
    { label: 'Delete everything', ic: 'trash', danger: true, run: async () => { await clearItems(); toast('Library cleared'); renderSettings(); } },
  ]), true);
  host.appendChild(lib);
  host.appendChild(el('p', 'note', 'To use Leaf Reader on another phone: back up here, send the file to the other phone, then restore it there.'));

  host.appendChild(el('div', 'gh', 'About'));
  host.appendChild(el('div', 'group', '<div class="line"><span>Leaf Reader</span><span class="val">1.3</span></div><div class="line"><span>Privacy</span><span class="val">No account, no tracking</span></div>'));
  host.appendChild(el('p', 'note', 'Everything you add stays on this phone and works offline.'));
}

// ---------- highlights inside the reader ----------
const textNodes = (root) => { const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); const a = []; let n; while ((n = w.nextNode())) a.push(n); return a; };
function offsetOf(root, node, off) { const r = document.createRange(); r.selectNodeContents(root); r.setEnd(node, off); return r.toString().length; }
function applyHighlights() {
  const root = $('#content');
  (cur.highlights || []).forEach((h, idx) => {
    let pos = 0;
    for (const t of textNodes(root)) {
      const s = pos, e = pos + t.length; pos = e;
      const a = Math.max(h.start, s), b = Math.min(h.end, e);
      if (a < b) {
        const r = document.createRange(); r.setStart(t, a - s); r.setEnd(t, b - s);
        const mk = document.createElement('mark'); mk.dataset.i = idx; r.surroundContents(mk);
      }
    }
  });
}
function renderContent() { $('#content').innerHTML = cur.html; applyHighlights(); }
let lastRange = null, selTimer;
function wireSelection() {
  document.addEventListener('selectionchange', () => {
    const s = getSelection(), c = $('#content');
    if (cur && s && !s.isCollapsed && s.rangeCount && c.contains(s.anchorNode) && c.contains(s.focusNode)) {
      clearTimeout(selTimer); lastRange = s.getRangeAt(0).cloneRange(); $('#selbar').hidden = false;
    } else { clearTimeout(selTimer); selTimer = setTimeout(() => { $('#selbar').hidden = true; }, 450); }
  });
  $('#selbar').addEventListener('pointerdown', (e) => e.preventDefault());
  $('#hlBtn').onclick = async () => {
    if (!lastRange) return;
    const root = $('#content');
    const a = offsetOf(root, lastRange.startContainer, lastRange.startOffset), b = offsetOf(root, lastRange.endContainer, lastRange.endOffset);
    if (b > a) { (cur.highlights = cur.highlights || []).push({ start: a, end: b, text: lastRange.toString().trim().slice(0, 400) }); await putItem(cur); renderContent(); toast('Highlighted'); }
    getSelection().removeAllRanges(); $('#selbar').hidden = true; lastRange = null;
  };
  $('#quoteBtn').onclick = () => {
    if (!lastRange) return;
    shareText({ title: cur.title, text: '\u201C' + lastRange.toString().trim() + '\u201D\n\n\u2014 ' + cur.title, url: cur.url });
    getSelection().removeAllRanges(); $('#selbar').hidden = true;
  };
}

// ---------- reader ----------
let cur = null, lastScroll = 0, tick = null, dirty = false, lastTop = 0, openedAt = 0, justDragged = 0, scrubTarget = 0;
const GAP = 48;
const tp = { W: 0, page: 0, pages: 1 };   // text book, page-flip layout
let pdfDoc = null, pdfPage = 1, pdfTotal = 1, pdfBusy = false, pdfIO = null;
const pdfCache = new Map();
const isPdf = () => !!(cur && cur.pdf);
const paged = () => S.flip !== false;

function openReader(it, opts) {
  cur = it; it.highlights = it.highlights || []; openedAt = Date.now();
  $('#rtitle').textContent = it.title;
  const r = $('#reader'); r.classList.remove('chrome-hidden');
  requestAnimationFrame(() => r.classList.add('open'));
  pushLayer(closeReaderNow);
  it.lastRead = Date.now();
  tick = setInterval(() => {
    if (Date.now() - lastScroll < 20000) { cur.seconds += 5; dirty = true; }  // time counts only while pages move
    if (dirty) { putItem(cur); dirty = false; }
  }, 5000);
  startContent(opts);
}
async function startContent(opts) {
  const p = isPdf();
  $('#page').hidden = p; $('#pdfStage').hidden = !p;
  if (p) {
    try { pdfDoc = await getPdf(await cur.pdf.arrayBuffer()); }
    catch (e) { toast('Could not open this PDF'); closeLayer(); return; }
    pdfTotal = pdfDoc.numPages;
    await layoutPdf();
  } else {
    renderContent();
    setTimeout(() => layoutText(opts), 80);
  }
}
async function closeReaderNow() {
  clearInterval(tick); $('#reader').classList.remove('open'); $('#selbar').hidden = true;
  if (cur) { cur.lastRead = Date.now(); await putItem(cur); }
  cur = null;
  if (pdfIO) { pdfIO.disconnect(); pdfIO = null; }
  if (pdfDoc) { pdfDoc.destroy(); pdfDoc = null; }
  pdfCache.clear(); pdfBusy = false;
  setTimeout(() => { $('#pdfStage').innerHTML = ''; $('#content').innerHTML = ''; }, 400);
  if (!$('#libraryView').hidden) renderList();
  if (!$('#highlightsView').hidden) renderHighlights();
}
function relayout() { if (!cur) return; if (isPdf()) layoutPdf(); else layoutText(); }

// --- books and articles (reflowable text) ---
function layoutText(opts) {
  const page = $('#page'), c = $('#content');
  c.style.transition = 'none'; c.style.transform = 'none';
  if (paged()) {
    page.classList.add('paged');
    const innerW = page.clientWidth - 48;
    const W = Math.round(innerW * (+S.width / 100));
    const H = page.clientHeight - 106;
    Object.assign(c.style, { width: W + 'px', height: H + 'px', columnWidth: W + 'px', columnGap: GAP + 'px', columnFill: 'auto', marginLeft: Math.round((innerW - W) / 2) + 'px' });
    tp.W = W;
    tp.pages = Math.max(1, Math.round((c.scrollWidth + GAP) / (W + GAP)));
    let p;
    if (opts && opts.jump != null) {
      const m = $(`#content mark[data-i="${opts.jump}"]`);
      p = m ? Math.floor((m.getBoundingClientRect().left - c.getBoundingClientRect().left) / (W + GAP)) : 0;
    } else p = Math.round(cur.progress * (tp.pages - 1));
    setTextPage(p, false, true);
  } else {
    page.classList.remove('paged');
    ['width', 'height', 'columnWidth', 'columnGap', 'columnFill', 'marginLeft', 'transition'].forEach((k) => { c.style[k] = ''; });
    setTimeout(() => {
      if (opts && opts.jump != null) { const m = $(`#content mark[data-i="${opts.jump}"]`); if (m) m.scrollIntoView({ block: 'center' }); }
      else page.scrollTop = cur.progress * (page.scrollHeight - page.clientHeight);
      lastTop = page.scrollTop; updateIndicators();
    }, 30);
  }
}
function setTextPage(p, animate, silent) {
  p = Math.max(0, Math.min(tp.pages - 1, p));
  const c = $('#content');
  c.style.transition = animate ? 'transform .36s cubic-bezier(.22,.8,.25,1)' : 'none';
  c.style.transform = `translateX(${-p * (tp.W + GAP)}px)`;
  if (animate && p !== tp.page) flipFx(p > tp.page ? 1 : -1);
  tp.page = p;
  if (!silent) {
    cur.progress = tp.pages > 1 ? p / (tp.pages - 1) : 1;
    if (tp.pages > 1 && p === tp.pages - 1) cur.finished = true;
    lastScroll = Date.now(); dirty = true;
  }
  updateIndicators();
}
function flipFx(dir) {
  const f = $('#flipfx'); f.className = ''; void f.offsetWidth; f.className = dir > 0 ? 'go-next' : 'go-prev';
}

// --- PDF: pages are drawn exactly as they look in the file ---
async function pdfCanvas(n) {
  if (pdfCache.has(n)) return pdfCache.get(n);
  const pr = (async () => {
    const page = await pdfDoc.getPage(n);
    const st = $('#pdfStage');
    const v1 = page.getViewport({ scale: 1 });
    const scale = Math.min((st.clientWidth - 16) / v1.width, (st.clientHeight - 44) / v1.height);
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const vp = page.getViewport({ scale: scale * dpr });
    const cv = document.createElement('canvas');
    cv.width = Math.floor(vp.width); cv.height = Math.floor(vp.height);
    cv.style.width = Math.floor(vp.width / dpr) + 'px'; cv.style.height = Math.floor(vp.height / dpr) + 'px';
    await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
    return cv;
  })();
  pdfCache.set(n, pr);
  pr.catch(() => pdfCache.delete(n));
  for (const k of [...pdfCache.keys()]) if (Math.abs(k - n) > 3) pdfCache.delete(k);
  return pr;
}
async function layoutPdf() {
  const st = $('#pdfStage');
  if (pdfIO) { pdfIO.disconnect(); pdfIO = null; }
  st.innerHTML = ''; pdfCache.clear(); pdfBusy = false;
  st.className = 'pdfstage ' + (paged() ? 'paged' : 'scroll');
  if (paged()) {
    pdfPage = Math.max(1, Math.min(pdfTotal, Math.round(cur.progress * (pdfTotal - 1)) + 1));
    await gotoPdf(pdfPage, 0);
  } else {
    await buildPdfScroll();
  }
  updateIndicators();
}
async function gotoPdf(n, dir) {
  if (n < 1 || n > pdfTotal || pdfBusy) return;
  pdfBusy = true;
  try {
    const cv = await pdfCanvas(n);
    const st = $('#pdfStage');
    const slot = el('div', 'pdfslot'); slot.appendChild(cv); st.appendChild(slot);
    const old = st.querySelector('.pdfslot.cur');
    if (old) old.classList.remove('cur');
    if (dir && old) {
      if (dir > 0) { slot.classList.add('over'); slot.style.transform = 'translateX(100%)'; }
      else { slot.style.transform = 'translateX(-25%)'; slot.style.opacity = '.6'; old.classList.add('over'); }
      void slot.offsetWidth;
      slot.style.transition = old.style.transition = 'transform .36s cubic-bezier(.22,.8,.25,1),opacity .36s';
      slot.style.transform = 'none'; slot.style.opacity = '1';
      if (dir > 0) { old.style.transform = 'translateX(-25%)'; old.style.opacity = '.6'; } else old.style.transform = 'translateX(100%)';
      setTimeout(() => old.remove(), 380);
    } else if (old) old.remove();
    slot.classList.add('cur');
    pdfPage = n;
    cur.progress = pdfTotal > 1 ? (n - 1) / (pdfTotal - 1) : 1;
    if (dir) { lastScroll = Date.now(); dirty = true; if (pdfTotal > 1 && n === pdfTotal) cur.finished = true; }
    updateIndicators();
    pdfCanvas(n + 1).catch(() => {}); if (n > 1) pdfCanvas(n - 1).catch(() => {});
  } finally { setTimeout(() => { pdfBusy = false; }, dir ? 380 : 0); }
}
async function buildPdfScroll() {
  const st = $('#pdfStage');
  const p1 = await pdfDoc.getPage(1), v = p1.getViewport({ scale: 1 });
  const w = st.clientWidth - 16, ratio = v.height / v.width;
  const holder = el('div', 'pdfscroll'); st.appendChild(holder);
  pdfIO = new IntersectionObserver((ents) => {
    ents.forEach((en) => {
      const ph = en.target;
      if (en.isIntersecting) renderPh(ph, +ph.dataset.n); else ph.innerHTML = '';
    });
  }, { root: st, rootMargin: '120% 0px' });
  for (let n = 1; n <= pdfTotal; n++) {
    const ph = el('div', 'pdfph'); ph.dataset.n = n; ph.style.width = w + 'px'; ph.style.height = Math.round(w * ratio) + 'px';
    holder.appendChild(ph); pdfIO.observe(ph);
  }
  st.scrollTop = cur.progress * (st.scrollHeight - st.clientHeight);
}
async function renderPh(ph, n) {
  if (ph.firstChild || ph.dataset.busy || !pdfDoc) return;
  ph.dataset.busy = '1';
  try {
    const page = await pdfDoc.getPage(n);
    const w = ph.clientWidth, v1 = page.getViewport({ scale: 1 });
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const vp = page.getViewport({ scale: (w / v1.width) * dpr });
    const cv = document.createElement('canvas'); cv.width = Math.floor(vp.width); cv.height = Math.floor(vp.height);
    await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
    ph.style.height = Math.round((w * v1.height) / v1.width) + 'px';
    if (ph.isConnected) { ph.innerHTML = ''; ph.appendChild(cv); }
  } catch (e) { /* page scrolled away or document closed */ }
  finally { delete ph.dataset.busy; }
}

// --- shared reader controls ---
function updateIndicators() {
  if (!cur) return;
  let label, val;
  if (isPdf() && paged()) { label = pdfPage + ' / ' + pdfTotal; val = pdfTotal > 1 ? (pdfPage - 1) / (pdfTotal - 1) : 1; }
  else if (!isPdf() && paged()) { label = (tp.page + 1) + ' / ' + tp.pages; val = cur.progress; }
  else { label = Math.round(cur.progress * 100) + '%'; val = cur.progress; }
  $('#pct').textContent = label; $('#pageinfo').textContent = label; $('#scrub').value = Math.round(val * 1000);
}
function turn(dir) {
  $('#reader').classList.add('chrome-hidden');
  if (isPdf()) {
    if (paged()) gotoPdf(pdfPage + dir, dir);
    else { const st = $('#pdfStage'); st.scrollBy({ top: dir * st.clientHeight * 0.88, behavior: 'smooth' }); }
  } else if (paged()) setTextPage(tp.page + dir, true);
  else { const p = $('#page'); p.scrollBy({ top: dir * p.clientHeight * 0.88, behavior: 'smooth' }); }
}
function scrollProgress(node) {
  const max = node.scrollHeight - node.clientHeight;
  cur.progress = max > 0 ? Math.min(1, node.scrollTop / max) : 1;
  lastScroll = Date.now(); dirty = true;
  if (cur.progress >= 0.995 && Date.now() - openedAt > 1500) cur.finished = true;
  if (Math.abs(node.scrollTop - lastTop) > 14) $('#reader').classList.add('chrome-hidden');
  lastTop = node.scrollTop;
  updateIndicators();
}
function onTap(e) {
  if (Date.now() - justDragged < 350 || getSelection().toString()) return;
  const m = e.target.closest && e.target.closest('mark');
  if (m) {
    actionSheet('Highlight', [{ label: 'Remove highlight', ic: 'trash', danger: true, run: async () => { cur.highlights.splice(+m.dataset.i, 1); await putItem(cur); renderContent(); } }]);
    return;
  }
  if (paged()) {
    const x = e.clientX / window.innerWidth;
    if (x < 0.28) return turn(-1);
    if (x > 0.72) return turn(1);
  }
  $('#reader').classList.toggle('chrome-hidden');
}
function wireGestures(node, live) {
  let x0 = null, y0 = 0, dx = 0, drag = false, base = 0, sel = false;
  node.addEventListener('touchstart', (e) => {
    if (!paged() || e.touches.length !== 1) { x0 = null; return; }
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; dx = 0; drag = false;
    sel = !!getSelection().toString(); base = live ? -tp.page * (tp.W + GAP) : 0;
  }, { passive: true });
  node.addEventListener('touchmove', (e) => {
    if (x0 === null || sel) return;
    dx = e.touches[0].clientX - x0; const dy = e.touches[0].clientY - y0;
    if (!drag && Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.4) drag = true;
    if (drag && live) {
      const c = $('#content'); c.style.transition = 'none';
      const edge = (tp.page === 0 && dx > 0) || (tp.page === tp.pages - 1 && dx < 0);
      c.style.transform = `translateX(${base + (edge ? dx * 0.3 : dx)}px)`;
    }
  }, { passive: true });
  node.addEventListener('touchend', () => {
    if (x0 === null || !drag) { x0 = null; return; }
    justDragged = Date.now();
    const dir = dx < -55 ? 1 : dx > 55 ? -1 : 0;
    if (live) { $('#reader').classList.add('chrome-hidden'); setTextPage(tp.page + dir, true); }
    else if (dir) turn(dir);
    x0 = null; drag = false;
  });
}
function wireReader() {
  const page = $('#page'), st = $('#pdfStage');
  page.onscroll = () => { if (cur && !paged() && !isPdf()) scrollProgress(page); };
  st.onscroll = () => { if (cur && isPdf() && !paged()) scrollProgress(st); };
  page.addEventListener('click', onTap); st.addEventListener('click', onTap);
  wireGestures(page, true); wireGestures(st, false);
  $('#scrub').oninput = (e) => {
    const v = +e.target.value / 1000;
    if (isPdf()) {
      if (paged()) { scrubTarget = Math.round(v * (pdfTotal - 1)) + 1; $('#pct').textContent = scrubTarget + ' / ' + pdfTotal; }
      else st.scrollTop = v * (st.scrollHeight - st.clientHeight);
    } else if (paged()) setTextPage(Math.round(v * (tp.pages - 1)), false);
    else page.scrollTop = v * (page.scrollHeight - page.clientHeight);
  };
  $('#scrub').onchange = () => { if (isPdf() && paged() && scrubTarget) { pdfBusy = false; gotoPdf(scrubTarget, 0); scrubTarget = 0; } };
  $('#back').onclick = () => closeLayer();
  $('#rshare').onclick = () => shareItem(cur);
  $('#gear').onclick = () => {
    const box = el('div'); box.appendChild(el('div', 'sheet-title', 'Reading settings'));
    const host = el('div'); box.appendChild(host); buildControls(host); openSheet(box, true);
  };
  let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(relayout, 250); });
}

// ---------- start ----------
(async () => {
  paintIcons(); await openDb(); wireLibrary(); wireReader(); wireSelection();
  applySettings(); renderList(); drainShared();
})();
