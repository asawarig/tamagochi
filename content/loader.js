// Classic content script: loads the ES-module pet into the page (top frame only).
(() => {
  if (window.top !== window || globalThis.__pixelPalLoaded) return;
  globalThis.__pixelPalLoaded = true;
  import(chrome.runtime.getURL('content/pet.js'))
    .then((m) => m.start())
    .catch((err) => console.debug('[Pixel Pal] could not start on this page', err));
})();
