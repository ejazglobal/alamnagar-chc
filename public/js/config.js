// Global configurations for the Alamnagar CHC Android App
(function () {
  // IMPORTANT: Replace this with your actual production Render server URL
  const API_BASE_URL = 'https://alamnagar-chc.onrender.com';

  // Check if we are running in local web development (localhost with a port, e.g., localhost:5000)
  const isLocalWebDev = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && window.location.port !== '';

  // Only override fetch if:
  // 1. We are NOT in local browser development (so we don't interfere with local server testing)
  // 2. The app's current origin is different from the target API server URL (like running locally inside the Capacitor WebView)
  if (!isLocalWebDev && window.location.origin !== API_BASE_URL) {
    const originalFetch = window.fetch;
    window.fetch = async function (input, init) {
      if (typeof input === 'string' && input.startsWith('/api/')) {
        // Prepend the production server base URL to relative API paths
        input = API_BASE_URL + input;
      }
      return originalFetch(input, init);
    };
    console.log('[Capacitor CONFIG] Global API redirection active. Routing all API traffic to:', API_BASE_URL);
  }

  window.toggleMobileMenu = function() {
    const menu = document.getElementById('nav-menu');
    if (menu) {
      menu.classList.toggle('active');
    }
  };
})();
