 /* =============================================
  斗魂竞技场全英雄榜单 — app.js
  Data Dragon 头像 + 全中文 + 海克斯效果
  ============================================= */
 const TIER_ORDER = ['','S+','S','S-','A+','A','A-','B+','B','B-','C+','C','C-','D+','D','D-'];
 const RARITY_LABEL = { silver: '白银', gold: '黄金', prismatic: '棱彩' };
 const DD_VERSION = '16.15.1';
 
 const state = {
   data: null, query: '', sort: 'rank', tier: 'all',
   detailKey: null, rarity: 'silver', augmentSort: 'pr', refreshing: false,
 };
 
 const els = {
   patchBadge: document.getElementById('patchBadge'),
   updatedAt: document.getElementById('updatedAt'),
   refreshBtn: document.getElementById('refreshBtn'),
   championCount: document.getElementById('championCount'),
   avgWr: document.getElementById('avgWr'),
   analysedGames: document.getElementById('analysedGames'),
   sourceLink: document.getElementById('sourceLink'),
   searchInput: document.getElementById('searchInput'),
   tierFilters: document.getElementById('tierFilters'),
   champRows: document.getElementById('champRows'),
   emptyState: document.getElementById('emptyState'),
   drawer: document.getElementById('drawer'),
   drawerContent: document.getElementById('drawerContent'),
   boardInfo: document.getElementById('boardInfo'),
 };
 
 /* ═══ i18n ═══ */
 let champZh = null;
 let augZh = null;
 let augData = null;    // { name: { nameZh, rarity, effect } }
 
 async function loadChampZh() {
   try { var r = await fetch('/champion-zh.json'); champZh = await r.json(); }
   catch(e) { console.warn('champion-zh load failed', e); }
 }
 async function loadAugZh() {
   try { var r = await fetch('/augments-zh.json'); augZh = await r.json(); }
   catch(e) { console.warn('augments-zh load failed', e); }
 }
 async function loadAugData() {
   try {
     var r = await fetch('/augments-data.json');
     var arr = await r.json();
     augData = {};
     arr.forEach(function(a) { augData[a.name] = a; });
   } catch(e) { console.warn('augments-data load failed', e); }
 }
 
 function translateChampion(champion) {
   var zh = champZh ? champZh[champion.key] : null;
   return {
     nameZh: zh ? zh.title : champion.name,
     titleZh: zh ? zh.name : champion.title,
     imageId: zh ? zh.id : null,
   };
 }
 function championAvatarUrl(champion) {
   var zh = champZh ? champZh[champion.key] : null;
   if (zh && zh.id) return 'https://ddragon.leagueoflegends.com/cdn/' + DD_VERSION + '/img/champion/' + encodeURIComponent(zh.id) + '.png';
   return 'https://cdn.lolalytics.com/140/' + encodeURIComponent(champion.key) + '.webp';
 }
 function translateAugment(enName) { return (augZh && augZh[enName]) ? augZh[enName] : enName; }
 function getAugEffect(enName) {
   var d = augData ? augData[enName] : null;
   return d ? d.effect : null;
 }
 
 /* ═══ helpers ═══ */
 function escapeHtml(value) {
   var s = String(value || '');
   return s.replace(/[&<>"']/g, function(c) { return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]; });
 }
 function formatNum(value) {
   if (value == null || !Number.isFinite(value)) return '--';
   if (value >= 1e6) return (value / 1e6).toFixed(1) + 'M';
   if (value >= 1e4) return (value / 1e3).toFixed(0) + 'K';
   return value.toLocaleString('zh-CN', { maximumFractionDigits: 0 });
 }
 function formatPct(value, digits) {
   if (value == null || !Number.isFinite(value)) return '--';
   return value.toFixed(digits || 2) + '%';
 }
 function avatarHtml(champion, sizeClass) {
   var initial = translateChampion(champion).nameZh.charAt(0);
   return '<span class="champ-avatar ' + (sizeClass || '') + '">' +
     '<img src="' + championAvatarUrl(champion) + '" alt="" loading="lazy" ' +
     'onerror="this.hidden=true;this.nextElementSibling.hidden=false;">' +
     '<span class="fallback"' + (sizeClass ? '' : ' hidden') + '>' + escapeHtml(initial) + '</span></span>';
 }
 function tierClass(tier) { return 'tier-' + String(tier || '').charAt(0).toLowerCase(); }
 
 /* ═══ filtering / sorting ═══ */
 function getFilteredChampions() {
   var data = state.data, q = state.query.trim().toLowerCase(), tier = state.tier;
   if (!data) return [];
   return data.champions.filter(function(c) {
     if (tier !== 'all' && c.tier !== tier) return false;
     if (!q) return true;
     var t = translateChampion(c);
     return t.nameZh.toLowerCase().indexOf(q) !== -1 ||
            t.titleZh.toLowerCase().indexOf(q) !== -1 ||
            c.key.toLowerCase().indexOf(q) !== -1 ||
            c.name.toLowerCase().indexOf(q) !== -1;
   });
 }
 function getSortedChampions(list) {
   var sortKey = state.sort, sorted = list.slice();
   if (sortKey === 'wr') sorted.sort(function(a, b) { return b.wr - a.wr; });
   else if (sortKey === 'pr') sorted.sort(function(a, b) { return b.pr - a.pr; });
   else if (sortKey === 'games') sorted.sort(function(a, b) { return b.games - a.games; });
   else sorted.sort(function(a, b) { return (a.rank || 9999) - (b.rank || 9999); });
   return sorted;
 }
 
 /* ═══ top augment ═══ */
 function topAug(champion, rarity) {
   var list = champion.augments ? champion.augments[rarity] : null;
   if (!list || !list.length) return null;
   var best = list[0];
   for (var i = 1; i < list.length; i++) { if (list[i].pr > best.pr) best = list[i]; }
   return best;
 }
 
 /* ═══ inline augment cell (shows WR + PR with labels) ═══ */
 function renderAugInline(champion, rarity, cssClass) {
   var aug = topAug(champion, rarity);
   if (!aug) return '<td class="col-augment"><span class="aug-empty">--</span></td>';
   var wrCls = aug.wr >= 50 ? 'wr-positive' : 'wr-negative';
   var effect = getAugEffect(aug.name);
   return '<td class="col-augment"><div class="aug-inline ' + cssClass + '">' +
     '<span class="aug-inline-name" title="' + escapeHtml(aug.name) + (effect ? '\n' + effect : '') + '">' +
       escapeHtml(translateAugment(aug.name)) + '</span>' +
     '<div class="aug-inline-stats">' +
       '<span class="aug-stat-item ' + wrCls + '"><b>胜</b>' + formatPct(aug.wr) + '</span>' +
       '<span class="aug-stat-item"><b>选</b>' + formatPct(aug.pr) + '</span>' +
     '</div></div></td>';
 }
 
 /* ═══ bar cell ═══ */
 function barCell(value, max, kind, digits) {
   if (value == null || !Number.isFinite(value)) return '<span class="num-value">--</span>';
   var pct = Math.min(max > 0 ? Math.max(2, (value / max) * 100) : 0, 100);
   var cls = '';
   if (kind === 'wr' && value != null) cls = value < 50 ? 'wr-negative' : 'wr-positive';
   return '<div class="bar-cell"><span class="num-value ' + cls + '">' +
     formatPct(value, digits || 2) + '</span>' +
     '<span class="bar-track bar-' + kind + '"><span class="bar-fill" style="width:' + pct + '%"></span></span></div>';
 }
 
 /* ═══ main table ═══ */
 function renderRows() {
   var filtered = getFilteredChampions();
   var champions = getSortedChampions(filtered);
   els.boardInfo.textContent = '\u663e\u793a ' + champions.length + ' / ' +
     (state.data ? state.data.champions.length : 0) + ' \u4e2a\u82f1\u96c4';
   if (!champions.length) { els.champRows.innerHTML = ''; els.emptyState.hidden = false; return; }
   els.emptyState.hidden = true;
   var maxPr = champions.reduce(function(m, c) { return Math.max(m, c.pr || 0); }, 0);
   els.champRows.innerHTML = champions.map(function(c) {
     var delta = c.avgWrDelta;
     var dCls = delta >= 0 ? 'wr-positive' : 'wr-negative';
     var dTxt = delta != null ? (delta >= 0 ? '+' : '') + delta.toFixed(2) + '%' : '--';
     var t = translateChampion(c);
     return '<tr data-key="' + escapeHtml(c.key) + '">' +
       '<td class="col-rank"><span class="rank-cell">' + (c.rank || '--') + '</span></td>' +
       '<td class="col-champ"><div class="champ-cell">' + avatarHtml(c) +
         '<span><span class="champ-name">' + escapeHtml(t.nameZh) + '</span>' +
         '<span class="champ-title">' + escapeHtml(t.titleZh) + '</span></span></div></td>' +
       '<td class="col-tier"><span class="tier-badge ' + tierClass(c.tier) + '">' +
         escapeHtml(c.tier || '--') + '</span></td>' +
       '<td class="col-wr">' + barCell(c.wr, 70, 'wr') + '</td>' +
       '<td class="col-pr">' + barCell(c.pr, maxPr, 'pr') + '</td>' +
       '<td class="col-games"><span class="num-value">' + formatNum(c.games) + '</span></td>' +
       '<td class="col-delta"><span class="num-value small ' + dCls + '">' + dTxt + '</span></td>' +
       renderAugInline(c, 'silver', 'aug-silver') +
       renderAugInline(c, 'gold', 'aug-gold') +
       renderAugInline(c, 'prismatic', 'aug-prismatic') +
       '</tr>';
   }).join('');
 }
 
 function renderMeta() {
   var d = state.data; if (!d) return;
   els.patchBadge.textContent = '\u7248\u672c ' + d.patch;
   els.updatedAt.textContent = '\u66f4\u65b0\u4e8e ' + new Date(d.updatedAt).toLocaleString('zh-CN');
   els.championCount.textContent = d.champions.length;
   els.avgWr.textContent = formatPct(d.avgWr, 2);
   els.analysedGames.textContent = formatNum(d.analysedGames);
   els.sourceLink.href = d.sourceUrl;
 }
 
 function renderTierFilters() {
   var d = state.data; if (!d) return;
   var tiers = [];
   d.champions.forEach(function(c) { if (tiers.indexOf(c.tier) === -1) tiers.push(c.tier); });
   tiers.sort(function(a, b) { return TIER_ORDER.indexOf(a) - TIER_ORDER.indexOf(b); });
   tiers.unshift('all');
   els.tierFilters.innerHTML = tiers.map(function(t) {
     return '<button class="tier-btn' + (state.tier === t ? ' is-active' : '') +
       '" data-tier="' + escapeHtml(t) + '" type="button">' +
       (t === 'all' ? '\u5168\u90e8' : escapeHtml(t)) + '</button>';
   }).join('');
 }
 
 function renderAll() { renderMeta(); renderTierFilters(); renderRows(); if (state.detailKey) renderDrawer(); }
 
 /* ═══ drawer ═══ */
 function getChampion(key) {
   return state.data ? (state.data.champions.find(function(c) { return c.key === key; }) || null) : null;
 }
 function sortAugments(list) {
   var s = state.augmentSort, sorted = list.slice();
   if (s === 'wr') sorted.sort(function(a, b) { return b.wr - a.wr; });
   else if (s === 'games') sorted.sort(function(a, b) { return b.games - a.games; });
   else sorted.sort(function(a, b) { return b.pr - a.pr; });
   return sorted;
 }
 
 function renderAugmentTable(champion) {
   var augments = champion.augments ? champion.augments[state.rarity] : null;
   if (!augments || !augments.length) return '<p class="detail-error">\u6682\u65e0\u8be5\u7a00\u6709\u5ea6\u7684\u6570\u636e</p>';
   var sorted = sortAugments(augments);
   var maxPr = sorted.reduce(function(m, a) { return Math.max(m, a.pr || 0); }, 0);
   var maxWr = sorted.reduce(function(m, a) { return Math.max(m, a.wr || 0); }, 0);
   var kind = state.rarity;
   return '<div class="augment-list rarity-' + kind + '">' + sorted.map(function(a) {
     var isLow = a.games < 50;
     var zhName = translateAugment(a.name);
     var effect = getAugEffect(a.name);
     return '<div class="augment-row' + (isLow ? ' is-low' : '') + (effect ? ' has-effect' : '') + '" title="' + escapeHtml(a.name) + '">' +
       '<div class="augment-name-wrap">' +
         '<span class="augment-name">' + escapeHtml(zhName) + '</span>' +
         (effect ? '<span class="augment-effect">' + escapeHtml(effect) + '</span>' : '') +
       '</div>' +
       '<div class="aug-stat-group"><span class="aug-stat-label">\u80dc\u7387</span>' + barCell(a.wr, maxWr, kind) + '</div>' +
       '<div class="aug-stat-group"><span class="aug-stat-label">\u9009\u53d6\u7387</span>' + barCell(a.pr, maxPr, 'pr') + '</div>' +
       '<span class="augment-games">' + formatNum(a.games) + '</span></div>';
   }).join('') + '</div>';
 }
 
 function renderDrawer() {
   var champion = getChampion(state.detailKey);
   if (!champion) { closeDrawer(); return; }
   var t = translateChampion(champion);
   var augments = champion.augments || {};
   var counts = { silver: (augments.silver || []).length, gold: (augments.gold || []).length, prismatic: (augments.prismatic || []).length };
   els.drawerContent.innerHTML =
     '<div class="detail-hero">' + avatarHtml(champion, 'champ-avatar-lg') +
       '<div><h2>' + escapeHtml(t.nameZh) + '</h2><p class="champ-title">' + escapeHtml(t.titleZh) + '</p></div></div>' +
     '<div class="detail-stats">' +
       '<div class="detail-stat"><span>\u80dc\u7387</span><strong>' + formatPct(champion.wr) + '</strong></div>' +
       '<div class="detail-stat"><span>\u767b\u573a\u7387</span><strong>' + formatPct(champion.pr) + '</strong></div>' +
       '<div class="detail-stat"><span>\u573a\u6b21</span><strong>' + formatNum(champion.games) + '</strong></div>' +
       '<div class="detail-stat"><span>\u6bb5\u4f4d</span><strong>' + escapeHtml(champion.tier || '--') + '</strong></div></div>' +
     '<p class="detail-rank">\u699c\u5355\u6392\u540d #' + (champion.rank || '--') +
       ' \xb7 \u80dc\u7387\u504f\u5dee ' + (champion.avgWrDelta >= 0 ? '+' : '') +
       ((champion.avgWrDelta || 0).toFixed(2)) + '%</p>' +
     '<div class="rarity-tabs" role="tablist">' +
       ['silver','gold','prismatic'].map(function(r) {
         return '<button class="rarity-tab' + (state.rarity === r ? ' is-active' : '') +
           '" data-rarity="' + r + '" type="button">' +
           RARITY_LABEL[r] + ' <small>' + counts[r] + '</small></button>';
       }).join('') + '</div>' +
     '<div class="augment-toolbar"><span style="color:var(--muted);font-size:12px">\u6392\u5e8f</span>' +
       '<div class="sort-group" role="group">' +
         '<button class="seg-btn' + (state.augmentSort === 'pr' ? ' is-active' : '') +
           '" data-augment-sort="pr" type="button">\u767b\u573a\u7387</button>' +
         '<button class="seg-btn' + (state.augmentSort === 'wr' ? ' is-active' : '') +
           '" data-augment-sort="wr" type="button">\u80dc\u7387</button>' +
         '<button class="seg-btn' + (state.augmentSort === 'games' ? ' is-active' : '') +
           '" data-augment-sort="games" type="button">\u573a\u6b21</button>' +
       '</div></div>' + renderAugmentTable(champion);
 }
 
 function openDrawer(key) {
   state.detailKey = key; state.rarity = 'silver'; state.augmentSort = 'pr';
   renderDrawer();
   els.drawer.classList.add('is-open'); els.drawer.setAttribute('aria-hidden', 'false');
   document.body.style.overflow = 'hidden';
 }
 function closeDrawer() {
   state.detailKey = null;
   els.drawer.classList.remove('is-open'); els.drawer.setAttribute('aria-hidden', 'true');
   document.body.style.overflow = '';
 }
 
 /* ═══ refresh ═══ */
 function setRefreshing(busy) {
   state.refreshing = busy; els.refreshBtn.disabled = busy;
   els.refreshBtn.classList.toggle('refreshing', busy);
   els.refreshBtn.innerHTML = busy
     ? '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" style="animation:spin 0.8s linear infinite"><path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> \u5237\u65b0\u4e2d'
     : '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> \u5237\u65b0\u6570\u636e';
 }
 function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }
 async function triggerRefresh() { location.reload(); return;
   if (state.refreshing) return;
   setRefreshing(true);
   var before = state.data ? state.data.updatedAt : null;
   try {
     // static mode: no server refresh
     for (var i = 0; i < 30; i++) {
       await sleep(5000);
       var res = await fetch('/arena-stats.json');
       var next = await res.json();
       if (next.updatedAt && next.updatedAt !== before) { state.data = next; renderAll(); break; }
     }
   } catch (e) { console.error(e); }
   finally { setRefreshing(false); }
 }
 
 /* ═══ init & events ═══ */
 async function init() {
   try {
     var res = await fetch('/arena-stats.json');
     state.data = await res.json();
     await Promise.all([loadChampZh(), loadAugZh(), loadAugData()]);
     renderAll();
   } catch (e) {
     console.error('Failed to load', e);
     els.champRows.innerHTML = ''; els.emptyState.hidden = false;
     els.emptyState.textContent = '\u6570\u636e\u52a0\u8f7d\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5';
   }
 }
 
 els.searchInput.addEventListener('input', function(e) { state.query = e.target.value; renderRows(); });
 document.querySelector('.sort-group').addEventListener('click', function(e) {
   var btn = e.target.closest('[data-sort]'); if (!btn) return;
   state.sort = btn.dataset.sort;
   document.querySelectorAll('.sort-group .seg-btn').forEach(function(el) { el.classList.toggle('is-active', el === btn); });
   renderRows();
 });
 els.tierFilters.addEventListener('click', function(e) {
   var btn = e.target.closest('[data-tier]'); if (!btn) return;
   state.tier = btn.dataset.tier;
   els.tierFilters.querySelectorAll('.tier-btn').forEach(function(el) { el.classList.toggle('is-active', el === btn); });
   renderRows();
 });
 els.champRows.addEventListener('click', function(e) {
   var row = e.target.closest('tr[data-key]'); if (row) openDrawer(row.dataset.key);
 });
 els.drawerContent.addEventListener('click', function(e) {
   var rarityBtn = e.target.closest('[data-rarity]');
   if (rarityBtn) { state.rarity = rarityBtn.dataset.rarity; renderDrawer(); return; }
   var sortBtn = e.target.closest('[data-augment-sort]');
   if (sortBtn) { state.augmentSort = sortBtn.dataset.augmentSort; renderDrawer(); }
 });
 els.drawer.addEventListener('click', function(e) { if (e.target.closest('[data-close]')) closeDrawer(); });
 document.addEventListener('keydown', function(e) { if (e.key === 'Escape' && state.detailKey) closeDrawer(); });
 els.refreshBtn.addEventListener('click', triggerRefresh);
 
 var styleEl = document.createElement('style');
 styleEl.textContent = '@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}';
 document.head.appendChild(styleEl);
 init();
