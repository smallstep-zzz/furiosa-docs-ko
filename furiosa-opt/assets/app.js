/* Static reading interactions; translations are built into every HTML page. */
(() => {
  'use strict';
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const mobile = matchMedia('(max-width:760px)');
  const hover = matchMedia('(hover:hover) and (pointer:fine)');
  const sidebar = $('#sidebar');
  const menu = $('#menu-toggle');
  const backdrop = $('#sidebar-backdrop');
  const popup = $('#original-popover');
  const popupContent = $('#original-content');
  const closePopup = $('#close-original');
  const docSearch = $('#doc-search');
  let activeAnchor = null, pinned = false, hideTimer = 0, lastFocus = null;

  const themeButton = $('#theme-toggle');
  function syncThemeButton() {
    const dark = document.documentElement.dataset.theme === 'dark';
    themeButton.setAttribute('aria-label', dark ? '밝은 테마로 전환' : '어두운 테마로 전환');
  }
  syncThemeButton();
  themeButton.addEventListener('click', () => {
    const dark = document.documentElement.dataset.theme !== 'dark';
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    try { localStorage.setItem('opt-theme', dark ? 'dark' : 'light'); } catch (_) {}
    syncThemeButton();
  });

  function setMenu(open) {
    sidebar.classList.toggle('open', open);
    backdrop.hidden = !open;
    menu.setAttribute('aria-expanded', String(open));
    menu.setAttribute('aria-label', open ? '목차 닫기' : '목차 열기');
    document.body.classList.toggle('nav-open', open && mobile.matches);
    if (open) { hideOriginal(); setTimeout(() => docSearch.focus(), 30); }
    else if (mobile.matches) menu.focus({ preventScroll: true });
  }
  menu.addEventListener('click', () => setMenu(!sidebar.classList.contains('open')));
  backdrop.addEventListener('click', () => setMenu(false));
  mobile.addEventListener('change', () => {
    if (!mobile.matches) {
      sidebar.classList.remove('open'); backdrop.hidden = true;
      menu.setAttribute('aria-expanded', 'false'); document.body.classList.remove('nav-open');
    }
    hideOriginal();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      if (!popup.hidden) { hideOriginal(true); return; }
      if (sidebar.classList.contains('open')) setMenu(false);
      else if (docSearch.value) { docSearch.value = ''; runSearch(); }
    }
    if (event.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) {
      event.preventDefault();
      if (mobile.matches) setMenu(true);
      docSearch.focus();
    }
    if (event.key === 'Tab' && mobile.matches && sidebar.classList.contains('open')) {
      const items = $$('a[href],button,input,summary', sidebar).filter(el => el.getClientRects().length);
      const first = items[0], last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); menu.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); menu.focus(); }
      else if (!event.shiftKey && document.activeElement === menu) { event.preventDefault(); first.focus(); }
    }
  });

  function renderMath(root) {
    if (!window.katex) return;
    $$('.math-source:not([data-rendered])', root).forEach(node => {
      const text = node.textContent;
      try {
        katex.render(text, node, { displayMode: node.dataset.display === 'true', throwOnError: false, strict: 'ignore', trust: false, output: 'htmlAndMathml' });
        node.dataset.rendered = 'true';
      } catch (_) { node.textContent = text; }
    });
  }
  renderMath(document);
  window.addEventListener('load', () => renderMath(document));

  function placeOriginal() {
    if (!activeAnchor || popup.hidden) return;
    const r = activeAnchor.getBoundingClientRect();
    const gap = 9, padding = mobile.matches ? 12 : 16;
    const viewportWidth = document.documentElement.clientWidth;
    const width = Math.min(660, viewportWidth - padding * 2);
    popup.style.width = width + 'px';
    const height = popup.getBoundingClientRect().height;
    const topbar = mobile.matches ? 58 : 64;
    const below = innerHeight - r.bottom - padding;
    const above = r.top - topbar - padding;
    let top;
    if (below >= Math.min(height, 230) || below > above) top = r.bottom + gap;
    else top = r.top - height - gap;
    top = Math.max(topbar + padding, Math.min(top, innerHeight - height - padding));
    const left = Math.max(padding, Math.min(r.left, viewportWidth - width - padding));
    popup.style.left = Math.round(left) + 'px';
    popup.style.top = Math.round(top) + 'px';
  }
  function hideOriginal(restore = false) {
    clearTimeout(hideTimer);
    if (activeAnchor) {
      activeAnchor.removeAttribute('aria-describedby');
      $$('[aria-expanded="true"]', activeAnchor).forEach(x => x.setAttribute('aria-expanded', 'false'));
      if (activeAnchor.matches('[aria-expanded]')) activeAnchor.setAttribute('aria-expanded', 'false');
    }
    popup.hidden = true; activeAnchor = null; pinned = false;
    if (restore && lastFocus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
  }
  function showOriginal(anchor, pin = false, keyboard = false) {
    const template = document.getElementById(anchor.dataset.original);
    if (!template) return;
    clearTimeout(hideTimer);
    if (activeAnchor !== anchor) hideOriginal();
    activeAnchor = anchor; pinned = pin; lastFocus = document.activeElement;
    popupContent.innerHTML = template.innerHTML;
    popupContent.scrollTop = 0;
    popup.hidden = false;
    popup.style.visibility = 'hidden';
    anchor.setAttribute('aria-describedby', 'original-content');
    $$('[aria-expanded]', anchor).forEach(x => x.setAttribute('aria-expanded', 'true'));
    if (anchor.matches('[aria-expanded]')) anchor.setAttribute('aria-expanded', 'true');
    renderMath(popupContent);
    placeOriginal(); popup.style.visibility = 'visible';
    if (keyboard && pin) closePopup.focus({ preventScroll: true });
  }
  function delayHide() {
    if (!pinned) hideTimer = setTimeout(() => hideOriginal(), 220);
  }
  $$('.translation-unit').forEach(unit => {
    unit.addEventListener('pointerenter', () => { if (hover.matches && !pinned) showOriginal(unit); });
    unit.addEventListener('pointerleave', () => { if (hover.matches) delayHide(); });
    unit.addEventListener('focusin', event => {
      if (event.target === unit && hover.matches) showOriginal(unit);
    });
    unit.addEventListener('focusout', event => {
      if (!pinned && !unit.contains(event.relatedTarget) && !popup.contains(event.relatedTarget)) delayHide();
    });
    const trigger = $('.original-trigger', unit);
    if (trigger) trigger.addEventListener('click', event => {
      event.preventDefault(); event.stopPropagation();
      if (activeAnchor === unit && pinned) hideOriginal();
      else showOriginal(unit, true, event.detail === 0);
    });
    unit.addEventListener('keydown', event => {
      if ((event.key === 'Enter' || event.key === ' ') && event.target === unit) {
        event.preventDefault(); showOriginal(unit, true, true);
      }
    });
  });
  $$('.code-original').forEach(button => button.addEventListener('click', event => {
    event.preventDefault(); event.stopPropagation();
    if (activeAnchor === button && pinned) hideOriginal();
    else showOriginal(button, true, event.detail === 0);
  }));
  popup.addEventListener('pointerenter', () => clearTimeout(hideTimer));
  popup.addEventListener('pointerleave', () => delayHide());
  closePopup.addEventListener('click', () => hideOriginal(true));
  document.addEventListener('pointerdown', event => {
    if (!popup.hidden && !popup.contains(event.target) && activeAnchor && !activeAnchor.contains(event.target)) hideOriginal();
  });
  addEventListener('resize', () => { placeOriginal(); updateReading(); });
  addEventListener('scroll', event => {
    if (popup.hidden || popup.contains(event.target)) return;
    if (activeAnchor) {
      const rect = activeAnchor.getBoundingClientRect();
      if (rect.bottom < 65 || rect.top > innerHeight) hideOriginal();
      else placeOriginal();
    }
  }, { passive: true, capture: true });

  let toastTimer;
  function toast(message) {
    const element = $('#toast'); element.textContent = message; element.classList.add('visible');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => element.classList.remove('visible'), 1600);
  }
  $$('.copy-code').forEach(button => button.addEventListener('click', async () => {
    const code = $('pre code', button.closest('.code-block')).textContent;
    try {
      await navigator.clipboard.writeText(code); button.textContent = '복사됨'; toast('코드를 복사했습니다.');
      setTimeout(() => button.textContent = '복사', 1500);
    } catch (_) {
      const range = document.createRange(); range.selectNodeContents($('pre code', button.closest('.code-block')));
      const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
      toast('코드를 선택했습니다. 복사 단축키를 사용하세요.');
    }
  }));
  // Tables keep horizontal scrolling inside their own bounds on narrow screens.
  $$('.main-content table').forEach(table => {
    if (table.parentElement.classList.contains('table-scroll')) return;
    const wrapper = document.createElement('div'); wrapper.className = 'table-scroll';
    wrapper.setAttribute('role', 'region'); wrapper.setAttribute('aria-label', '가로로 스크롤할 수 있는 표'); wrapper.tabIndex = 0;
    table.before(wrapper); wrapper.append(table);
  });

  function updateReading() {
    const length = document.documentElement.scrollHeight - innerHeight;
    $('#reading-progress-bar').style.width = (length > 0 ? Math.min(100, scrollY / length * 100) : 100) + '%';
  }
  addEventListener('scroll', updateReading, { passive: true });
  updateReading();
  const tocLinks = $$('.page-toc a[href^="#"]');
  const observed = tocLinks.map(a => document.getElementById(decodeURIComponent(a.hash.slice(1)))).filter(Boolean);
  if (observed.length && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      const candidate = entries.filter(x => x.isIntersecting).sort((a,b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (!candidate) return;
      tocLinks.forEach(a => a.classList.toggle('active', decodeURIComponent(a.hash.slice(1)) === candidate.target.id));
    }, { rootMargin: '-80px 0px -65% 0px' });
    observed.forEach(h => observer.observe(h));
  }
  const selected = $('[aria-current="page"]', sidebar);
  if (selected) {
    const r = selected.getBoundingClientRect();
    if (r.bottom > innerHeight - 70) sidebar.scrollTop = selected.offsetTop - sidebar.clientHeight / 2;
  }

  let searchData = null, searchPromise = null, searchTimer = 0, requestNumber = 0;
  const rootURL = new URL(document.body.dataset.root || './', location.href);
  const escapeHTML = text => text.replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  async function getSearchData() {
    if (searchData) return searchData;
    if (!searchPromise) searchPromise = fetch(new URL('assets/search-index.json', rootURL)).then(response => {
      if (!response.ok) throw new Error('search index'); return response.json();
    }).then(data => searchData = data).catch(error => { searchPromise = null; throw error; });
    return searchPromise;
  }
  async function runSearch() {
    const query = docSearch.value.trim().toLocaleLowerCase();
    const results = $('#search-results'), nav = $('#chapter-nav');
    const current = ++requestNumber;
    results.hidden = !query; nav.hidden = !!query;
    if (!query) { results.innerHTML = ''; return; }
    results.innerHTML = '<p class="search-count">문서를 검색하고 있습니다.</p>';
    try {
      const data = await getSearchData(); if (current !== requestNumber) return;
      const terms = query.split(/\s+/).filter(Boolean);
      const ranked = data.map(page => {
        const title = (page.title + ' ' + page.english).toLocaleLowerCase();
        const text = page.text.toLocaleLowerCase();
        if (!terms.every(term => title.includes(term) || text.includes(term))) return null;
        const score = terms.reduce((sum,term) => sum + (title.includes(term) ? 30 : 1), 0);
        return { page, score, pos: text.indexOf(terms[0]) };
      }).filter(Boolean).sort((a,b) => b.score - a.score).slice(0,30);
      results.innerHTML = `<p class="search-count">${ranked.length ? ranked.length + '개 문서' : '검색 결과가 없습니다.'}</p>` + ranked.map(({page,pos}) => {
        const start = Math.max(0, pos - 35);
        const snippet = page.text.slice(start, start + 135).replace(/\n/g, ' ');
        return `<a href="${new URL(page.key + '.html', rootURL).href}"><strong>${escapeHTML(page.title)}</strong><small>${escapeHTML(page.english)}</small><small>${start ? '…' : ''}${escapeHTML(snippet)}…</small></a>`;
      }).join('');
    } catch (_) { results.innerHTML = '<p class="search-count">검색 자료를 읽지 못했습니다. 목차를 이용하거나 다시 검색해 주세요.</p>'; }
  }
  docSearch.addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(runSearch, 160); });
  docSearch.addEventListener('focus', () => { getSearchData().catch(() => {}); });
  docSearch.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown') { const result = $('#search-results a'); if (result) { event.preventDefault(); result.focus(); } }
  });

  const diagrams = $$('.mermaid');
  if (diagrams.length) {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.min.js';
    script.onload = async () => {
      try {
        mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'neutral', fontFamily: 'Arial,sans-serif', flowchart: { useMaxWidth: true, htmlLabels: true } });
        await mermaid.run({ nodes: diagrams, suppressErrors: true });
        updateReading();
      } catch (_) { diagrams.forEach(node => node.setAttribute('aria-label','원문 도식 소스')); }
    };
    script.onerror = () => diagrams.forEach(node => node.setAttribute('aria-label','도식 소스 — 그림을 불러오지 못했습니다.'));
    document.head.append(script);
  }
})();
