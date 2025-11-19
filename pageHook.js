// Injected into the page context to hook fetch and forward user listings.
(() => {
  try {
    // Avoid double-install
    if (window.__SFT_FETCH_HOOK__) {
      console.log('[SFT PageHook] Already installed, skipping');
      return;
    }
    window.__SFT_FETCH_HOOK__ = true;

    const originalFetch = window.fetch;
    if (typeof originalFetch !== 'function') {
      console.error('[SFT PageHook] fetch is not a function!');
      return;
    }

    console.log('[SFT PageHook] Installed fetch interceptor');

    window.fetch = async function (...args) {
      const res = await originalFetch.apply(this, args);
      try {
        const req = args[0];
        const url = typeof req === 'string' ? req : (req?.url || '');

        if (
          typeof url === 'string' &&
          (url.includes('/following/user_listing') || url.includes('/followers/user_listing'))
        ) {
          console.log('[SFT PageHook] Intercepted user_listing request:', url);
          const clone = res.clone();
          clone.json().then((data) => {
            if (data && Array.isArray(data.items)) {
              console.log('[SFT PageHook] Posting message with', data.items.length, 'users');
              window.postMessage({
                source: 'SFT',
                type: 'USER_LISTING',
                items: data.items,
              }, '*');
            }
          }).catch((e) => {
            console.error('[SFT PageHook] Failed to parse JSON:', e);
          });
        }
      } catch (e) {
        console.error('[SFT PageHook] Error in fetch hook:', e);
      }
      return res;
    };
  } catch (e) {
    console.error('[SFT PageHook] Failed to install:', e);
  }
})();

