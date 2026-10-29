'use strict';

/* global api, Icons */
const $ = (id) => document.getElementById(id);

$('r-glyph').innerHTML = Icons.svg('bell', 26);

api.on('reminder:show', (p) => {
  if (!p) return;
  $('r-title').textContent = p.title || '该起身活动一下啦';
  $('r-body').textContent = p.message || '';
});

$('r-ok').addEventListener('click', () => api.reminderAck('ok'));
$('r-later').addEventListener('click', () => api.reminderAck('snooze'));
