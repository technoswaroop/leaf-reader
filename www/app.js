'use strict';
const $ = (s) => document.querySelector(s);

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

// ---------- settings ----------
const defaults = { theme: 'paper', light: 100, contrast: 50, warmth: 0, grain: 0, size: 19, font: 'Georgia,serif', width: '100' };
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
  $('#content').style.opacity = 0.6 + (S.contrast / 100) * 0.4;
  localStorage.setItem('leafS', JSON.stringify(S));
}

// ---------- importing ----------
const SAFE = new Set(['P','H1','H2','H3','H4','H5','H6','BLOCKQUOTE','LI','UL','OL','EM','I','STRONG','B','BR','PRE','CODE','DIV','SPAN','A']);
function clean(node) {
  let out = '';
  node.childNodes.forEach((n) => {
    if (n.nodeType === 3) out += n.textContent.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
    else if (n.nodeType === 1) {
      const t = n.tagName.toUpperCase();
      if (t === 'SCRIPT' || t === 'STYLE') return;
      const inner = clean(n);
      if (SAFE.has(t) && t !== 'A' && t !== 'SPAN' && t !== 'DIV') out += `<${t.toLowerCase()}>${inner}</${t.toLowerCase()}>`;
      else out += inner;
    }
  });
  return out;
}
const textOf = (html) => { const d = document.createElement('div'); d.innerHTML = html; return d.textContent.toLowerCase(); };
const esc = (s) => s.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));

function dirOf(p) { const i = p.lastIndexOf('/'); return i < 0 ? '' : p.slice(0, i + 1); }
function resolve(base, rel) {
  const parts = (base + decodeURIComponent(rel.split('#')[0])).split('/'); const out = [];
  for (const p of parts) { if (p === '..') out.pop(); else if (p && p !== '.') out.push(p); }
  return out.join('/');
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
    const href = manifest[ref.getAttribute('idref')];
    if (!href) continue;
    const f = zip.file(resolve(base, href));
    if (!f) continue;
    const doc = new DOMParser().parseFromString(await f.async('string'), 'text/html');
    html += clean(doc.body) + '<hr>';
  }
  return { title: title.trim(), kind: 'book', html };
}
async function parseText(file) {
  const t = await file.text();
  const html = t.split(/\n{2,}/).map((p) => '<p>' + esc(p).replace(/\n/g, '<br>') + '</p>').join('');
  return { title: file.name.replace(/\.[^.]+$/, ''), kind: 'document', html };
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
  const it = Object.assign({ id: 'i' + Date.now(), progress: 0, finished: false, added: Date.now(), lastRead: 0, seconds: 0 }, p);
  it.search = (it.title + ' ' + textOf(it.html)).toLowerCase();
  await putItem(it);
  renderList();
}

// ---------- library ----------
let tab = 'all', kind = 'all';
async function renderList() {
  const q = $('#search').value.trim().toLowerCase();
  let items = await allItems();
  items = items.filter((i) =>
    (kind === 'all' || i.kind === kind) &&
    (tab === 'all' || (tab === 'finished' ? i.finished : !i.finished && i.progress > 0)) &&
    (!q || i.search.includes(q)));
  items.sort($('#sort').value === 'az' ? (a, b) => a.title.localeCompare(b.title) : (a, b) => (b.lastRead || b.added) - (a.lastRead || a.added));
  $('#list').innerHTML = '';
  $('#empty').hidden = items.length > 0;
  items.forEach((i) => {
    const li = document.createElement('li');
    const m = Math.round(i.seconds / 60);
    li.innerHTML = `<b></b><small>${i.kind} &middot; ${i.finished ? 'finished' : Math.round(i.progress * 100) + '%'} &middot; ${m} min read</small><div class="bar"><i style="width:${Math.round(i.progress * 100)}%"></i></div>`;
    li.querySelector('b').textContent = i.title;
    li.onclick = () => openReader(i);
    $('#list').appendChild(li);
  });
}
function wireLibrary() {
  $('#addFile').onclick = () => $('#fileInput').click();
  $('#fileInput').onchange = async (e) => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    try { await addItem(/\.epub$/i.test(f.name) ? await parseEpub(f) : await parseText(f)); }
    catch (err) { alert('Could not open this file: ' + err.message); }
  };
  $('#addLink').onclick = async () => {
    const url = prompt('Paste a link');
    if (!url) return;
    try { await addItem(await parseLink(url.trim())); } catch (err) { alert('Could not fetch this link: ' + err.message); }
  };
  $('#search').oninput = renderList;
  $('#sort').onchange = renderList;
  document.querySelectorAll('#tabs button').forEach((b) => b.onclick = () => { tab = b.dataset.tab; document.querySelectorAll('#tabs button').forEach((x) => x.classList.toggle('on', x === b)); renderList(); });
  document.querySelectorAll('#kinds button').forEach((b) => b.onclick = () => { kind = b.dataset.kind; document.querySelectorAll('#kinds button').forEach((x) => x.classList.toggle('on', x === b)); renderList(); });
}

// ---------- reader ----------
let cur = null, lastScroll = 0, tick = null, dirty = false;
function openReader(it) {
  cur = it;
  $('#library').hidden = true; $('#reader').hidden = false;
  $('#rtitle').textContent = it.title;
  $('#content').innerHTML = it.html;
  $('#panel').hidden = true;
  const page = $('#page');
  requestAnimationFrame(() => { page.scrollTop = it.progress * (page.scrollHeight - page.clientHeight); });
  it.lastRead = Date.now();
  tick = setInterval(() => {
    // time counts only while pages are moving (scrolled in the last 20 seconds)
    if (Date.now() - lastScroll < 20000) { cur.seconds += 5; dirty = true; }
    if (dirty) { putItem(cur); dirty = false; showStats(); }
  }, 5000);
}
function showStats() { if (cur) $('#stats').textContent = `Read ${Math.round(cur.seconds / 60)} min · ${Math.round(cur.progress * 100)}%`; }
function wireReader() {
  $('#page').onscroll = () => {
    const p = $('#page'); const max = p.scrollHeight - p.clientHeight;
    cur.progress = max > 0 ? Math.min(1, p.scrollTop / max) : 1;
    lastScroll = Date.now(); dirty = true;
  };
  $('#back').onclick = async () => {
    clearInterval(tick); if (cur) { cur.lastRead = Date.now(); await putItem(cur); }
    cur = null; $('#reader').hidden = true; $('#library').hidden = false; renderList();
  };
  $('#gear').onclick = () => { $('#panel').hidden = !$('#panel').hidden; showStats(); };
  $('#page').onclick = () => { $('#panel').hidden = true; };
  $('#finish').onclick = () => { cur.finished = !cur.finished; putItem(cur); $('#finish').textContent = cur.finished ? 'Mark unfinished' : 'Mark finished'; };
  document.querySelectorAll('[data-theme]').forEach((b) => b.onclick = () => { S.theme = b.dataset.theme; applySettings(); });
  for (const k of ['light', 'contrast', 'warmth', 'grain', 'size']) {
    const el = $('#' + k); el.value = S[k]; el.oninput = () => { S[k] = +el.value; applySettings(); };
  }
  $('#font').value = S.font; $('#font').onchange = (e) => { S.font = e.target.value; applySettings(); };
  $('#width').value = S.width; $('#width').onchange = (e) => { S.width = e.target.value; applySettings(); };
}

(async () => { await openDb(); wireLibrary(); wireReader(); applySettings(); renderList(); })();
