'use strict';
(() => {
  const { call } = window.Z;
  const $ = (s) => document.querySelector(s);
  call('update:info').then((i) => { $('#cur').textContent = i.current || '-'; $('#new').textContent = i.latest || '-'; }).catch(() => {});
  $('#download').addEventListener('click', () => {
    call('update:download').then(() => { $('#msg').textContent = ''; }).catch((e) => { $('#msg').textContent = e.message; });
  });
  $('#quit').addEventListener('click', () => call('app:quit').catch(() => {}));
})();
