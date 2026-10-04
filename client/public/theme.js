/**
 * Pre-paint theme script.
 *
 * Kept as a separate file (rather than an inline <script>) so the app can run
 * under a strict Content-Security-Policy with script-src 'self'.
 */
;(function () {
  try {
    var stored = localStorage.getItem('pucho.theme') || 'dark'
    var theme =
      stored === 'system'
        ? window.matchMedia('(prefers-color-scheme: light)').matches
          ? 'light'
          : 'dark'
        : stored
    document.documentElement.dataset.theme = theme === 'light' ? 'light' : 'dark'
  } catch (error) {
    document.documentElement.dataset.theme = 'dark'
  }
})()