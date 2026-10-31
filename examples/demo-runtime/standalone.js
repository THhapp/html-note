/* NoteDemo demo-runtime bootstrap — shared by index.html and standalone.html.
 * The lead's single-file preview script inlines this file; it only boots the
 * scenario factory and never auto-plays. Classic script, no modules, no eval. */
(function (global) {
  'use strict';

  function boot() {
    var Examples = global.NoteDemoExamples;
    if (!Examples || typeof Examples.boot !== 'function') return;
    if (global.__noteDemoPreviewBooted) return;
    global.__noteDemoPreviewBooted = true;
    Examples.boot(global.document);
  }

  if (global.document && global.document.readyState === 'loading') {
    global.document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})(window);
