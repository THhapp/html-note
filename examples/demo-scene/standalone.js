/* NoteDemo demo-scene bootstrap — index.html 与 standalone.html 共用。
 * standalone.html 会被 scripts/build-demo-preview.mjs 内联为单文件；页面默认静止。 */
(function (global) {
  'use strict';

  function boot() {
    var Examples = global.NoteDemoSceneExamples;
    if (!Examples || typeof Examples.boot !== 'function') return;
    if (global.__noteDemoSceneBooted) return;
    global.__noteDemoSceneBooted = true;
    Examples.boot(global.document);
  }

  if (global.document && global.document.readyState === 'loading') {
    global.document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})(window);
