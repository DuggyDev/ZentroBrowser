'use strict';
/** Renders the tab list for both the horizontal strip and the vertical tab panel (keyed, so nothing flickers). */
(() => {
  const { h, icon, call } = window.Z;
  const els = new WeakMap();

  function make(container) {
    const el = h('div', { class: 'tab', draggable: 'true' }, [
      h('span', { class: 'tab-fav' }), h('span', { class: 'tab-title' }),
      h('span', { class: 'tab-audio' }),
      h('button', { class: 'tab-close', type: 'button', title: 'Close tab', 'aria-label': 'Close tab' }, [icon('close')]),
    ]);
    el.addEventListener('click', (e) => {
      if (e.target.closest('.tab-close')) { e.stopPropagation(); call('tab:close', el._id).catch(() => {}); } else call('tab:activate', el._id).catch(() => {});
    });
    el.addEventListener('auxclick', (e) => { if (e.button === 1) { e.preventDefault(); call('tab:close', el._id).catch(() => {}); } });
    el.addEventListener('contextmenu', (e) => { e.preventDefault(); call('tab:menu', el._id).catch(() => {}); });
    el.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/x-zentro-tab', String(el._id)); e.dataTransfer.effectAllowed = 'move'; });
    el.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('text/x-zentro-tab')) { e.preventDefault(); el.classList.add('drop-before'); } });
    el.addEventListener('dragleave', () => el.classList.remove('drop-before'));
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      el.classList.remove('drop-before');
      const id = Number(e.dataTransfer.getData('text/x-zentro-tab'));
      const index = [...container.children].indexOf(el);
      if (id && id !== el._id) call('tab:move', { id, index }).catch(() => {});
    });
    return el;
  }

  function fill(el, t) {
    el._id = t.id;
    el.classList.toggle('active', t.active);
    el.classList.toggle('pinned', t.pinned);
    el.classList.toggle('loading', t.loading);
    el.classList.toggle('sleeping', t.sleeping);
    el.title = t.title;
    el.querySelector('.tab-title').textContent = t.title;
    const fav = el.querySelector('.tab-fav');
    if (fav._src !== t.favicon || !fav.firstChild) {
      fav._src = t.favicon;
      fav.replaceChildren();
      if (t.favicon) {
        const img = h('img', { src: t.favicon, alt: '', width: '16', height: '16' });
        img.addEventListener('error', () => fav.replaceChildren(icon('globe')));
        fav.append(img);
      } else fav.append(icon(t.url.startsWith('zentro:') ? 'shield' : 'globe'));
    }
    const audio = el.querySelector('.tab-audio');
    audio.replaceChildren(...(t.muted ? [icon('mute')] : t.audible ? [icon('volume')] : []));
  }

  function render(container, tabs) {
    const keep = new Set();
    tabs.forEach((t, i) => {
      keep.add(t.id);
      let el = els.get(container) && els.get(container).get(t.id);
      if (!el) {
        el = make(container);
        if (!els.has(container)) els.set(container, new Map());
        els.get(container).set(t.id, el);
      }
      fill(el, t);
      const at = container.children[i] || null;
      if (at !== el) container.insertBefore(el, at);
    });
    const map = els.get(container);
    if (map) for (const [id, el] of map) if (!keep.has(id)) { el.remove(); map.delete(id); }
  }

  window.ZTabs = { render };
})();
