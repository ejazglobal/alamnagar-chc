// Global configurations for the Alamnagar CHC Android App
(function () {
  // IMPORTANT: Replace this with your actual production DigitalOcean server URL
  const API_BASE_URL = 'https://ashiana.online';

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

  // Collapse mobile menu when selecting an item or clicking outside
  document.addEventListener('click', function(e) {
    const menu = document.getElementById('nav-menu');
    const toggleBtn = document.querySelector('.menu-toggle');
    if (!menu) return;
    
    if (menu.classList.contains('active')) {
      if (
        e.target.closest('#nav-menu a') || 
        e.target.closest('#nav-menu button') || 
        e.target.closest('#nav-menu .nav-link') ||
        (!menu.contains(e.target) && (!toggleBtn || !toggleBtn.contains(e.target)))
      ) {
        menu.classList.remove('active');
      }
    }
  });

  window.runAndroidPrintFlow = function(targetElement, cleanupCallback) {
    if (!window.AndroidPrint) return;

    // Create the return banner
    let banner = document.getElementById('print-return-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'print-return-banner';
      banner.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; background: #0f172a; color: white; padding: 0.75rem 1.5rem; display: flex; justify-content: space-between; align-items: center; z-index: 99999; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);';
      banner.innerHTML = `
        <span style="font-weight: 600; font-size: 0.9rem; font-family: sans-serif;">Print Mode Active</span>
        <button id="print-return-btn" style="background: #0d9488; border: none; color: white; padding: 0.4rem 0.8rem; font-weight: 700; border-radius: 6px; cursor: pointer; font-size: 0.85rem; font-family: sans-serif;">← Return to Dashboard</button>
      `;
      document.body.appendChild(banner);
    }

    // Hide all other direct children of body
    const originalDisplays = [];
    Array.from(document.body.children).forEach(child => {
      if (child !== targetElement && child !== banner) {
        originalDisplays.push({ element: child, display: child.style.display });
        child.style.setProperty('display', 'none', 'important');
      }
    });

    const origTargetDisplay = targetElement.style.display;
    targetElement.style.setProperty('display', 'block', 'important');

    let printModeExited = false;
    function exitPrintMode() {
      if (printModeExited) return;
      printModeExited = true;

      // Restore displays
      originalDisplays.forEach(item => {
        item.element.style.display = item.display;
      });
      targetElement.style.display = origTargetDisplay;

      // Remove banner
      if (banner && banner.parentNode) {
        banner.parentNode.removeChild(banner);
      }

      // Cleanup callback
      if (typeof cleanupCallback === 'function') {
        cleanupCallback();
      }

      window.removeEventListener('afterprint', exitPrintMode);
    }

    // Bind cleanups
    const btn = document.getElementById('print-return-btn');
    if (btn) btn.onclick = exitPrintMode;
    window.addEventListener('afterprint', exitPrintMode);

    // Call print bridge after a short delay
    setTimeout(() => {
      window.AndroidPrint.printPage();
    }, 500);
  };
})();
