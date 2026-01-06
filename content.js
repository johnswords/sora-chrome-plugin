// Content Script for Sora Follow Tracker

(function() {
  'use strict';

  console.log('Sora Follow Tracker: Content script loaded');

  const CSS_CLASS_BADGE = 'sft-follow-badge';
  const CSS_CLASS_DNF = 'sft-dnf-indicator';
  const MAX_USER_LISTING_ITEMS = 500;
  const PAGINATION_DELAY_MS = 200;

  let badgeTimeoutId = null;
  let badgeObserver = null;
  let urlObserver = null;
  let observedRoot = null;
  let initializeInFlight = false;
  let initializeQueued = false;

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function isValidUserItem(item) {
    if (!item || typeof item !== 'object') return false;
    const hasUserId = typeof item.user_id === 'string' || typeof item.user_id === 'number';
    return hasUserId && typeof item.username === 'string' && typeof item.follows_you === 'boolean';
  }

  function normalizeUserItems(items) {
    const limited = items.slice(0, MAX_USER_LISTING_ITEMS);
    return limited.filter(isValidUserItem);
  }

  // Inject a page-context hook so we can observe the app's own fetch() calls.
  function injectPageHook() {
    try {
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('pageHook.js');
      script.async = false;
      (document.documentElement || document.head || document.body).appendChild(script);
      // Clean up the tag after it loads
      script.addEventListener('load', () => script.remove());
    } catch (e) {
      console.warn('SFT: failed to inject page hook', e);
    }
  }

  // Bridge messages from page -> content -> background
  function setupBridge() {
    console.log('[SFT Content] Setting up message bridge');
    window.addEventListener('message', (event) => {
      if (event.source !== window) return; // only same page
      const data = event.data;
      if (!data || data.source !== 'SFT') return;

      console.log('[SFT Content] Received message from page:', data);

      if (data.type === 'USER_LISTING' && Array.isArray(data.items)) {
        if (data.items.length > MAX_USER_LISTING_ITEMS) {
          console.warn('[SFT Content] Truncating large user listing:', data.items.length);
        }
        const validItems = normalizeUserItems(data.items);
        if (validItems.length === 0) {
          console.warn('[SFT Content] No valid user records in USER_LISTING payload');
          return;
        }
        console.log('[SFT Content] Forwarding', validItems.length, 'users to background');
        try {
          chrome.runtime.sendMessage({
            type: 'UPDATE_FOLLOW_DATA',
            users: validItems
          });
        } catch (e) {
          console.warn('[SFT Content] Extension context invalidated, data not saved:', e.message);
        }
      }
    });
  }

  injectPageHook();
  setupBridge();

  // Handle video export requests from popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'FETCH_VIDEOS') {
      fetchUserVideos(request.userId, request.autoPaginate)
        .then(videos => sendResponse({ success: true, videos }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true; // Keep channel open for async response
    }
  });

  // Fetch videos from user profile (runs in page context with auth)
  async function fetchUserVideos(userId, autoPaginate) {
    const allVideos = [];
    let cursor = null;
    let pageCount = 0;
    const shouldPaginate = autoPaginate === true;
    const maxPages = shouldPaginate ? 100 : 1;

    do {
      const url = cursor
        ? `https://sora.chatgpt.com/backend/project_y/profile_feed/${userId}?cursor=${encodeURIComponent(cursor)}&limit=20`
        : `https://sora.chatgpt.com/backend/project_y/profile_feed/${userId}?limit=20`;

      const response = await fetch(url, {
        credentials: 'include',
        headers: {
          'accept': '*/*'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.items && Array.isArray(data.items)) {
        data.items.forEach(item => {
          if (item.post) {
            allVideos.push(item.post);
          }
        });
      }

      cursor = data.cursor;
      pageCount++;

      if (cursor && shouldPaginate && pageCount < maxPages && PAGINATION_DELAY_MS > 0) {
        await sleep(PAGINATION_DELAY_MS);
      }

    } while (cursor && shouldPaginate && pageCount < maxPages);

    return allVideos;
  }

  // Get current logged-in user ID
  async function getCurrentUserId() {
    try {
      // Try to get from localStorage first
      const userData = localStorage.getItem('userData');
      if (userData) {
        const parsed = JSON.parse(userData);
        if (parsed?.user_id) return parsed.user_id;
      }

      // Fallback: make API call to get current user
      const response = await fetch('https://sora.chatgpt.com/backend/project_y/me', {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        return data?.user_id;
      }
    } catch (e) {
      console.warn('[SFT] Failed to get current user ID:', e);
    }
    return null;
  }

  // Auto-fetch follow data for current user if cache is empty
  async function autoFetchFollowData() {
    console.log('[SFT] Checking if auto-fetch is needed...');

    // Check if we have any cached data
    const { followData = {} } = await chrome.storage.local.get('followData');
    const cachedCount = Object.keys(followData).length;

    if (cachedCount > 0) {
      console.log('[SFT] Cache has', cachedCount, 'users, skipping auto-fetch');
      return;
    }

    console.log('[SFT] Cache is empty, auto-fetching follow data...');
    const currentUserId = await getCurrentUserId();
    if (!currentUserId) {
      console.warn('[SFT] Could not determine current user ID');
      return;
    }

    try {
      // Fetch first page of following
      const followingUrl = `https://sora.chatgpt.com/backend/project_y/${currentUserId}/following/user_listing?limit=100`;
      const followingRes = await fetch(followingUrl, { credentials: 'include' });
      if (followingRes.ok) {
        const followingData = await followingRes.json();
        if (followingData.items?.length > 0) {
          console.log('[SFT] Auto-fetched', followingData.items.length, 'following');
          window.postMessage({
            source: 'SFT',
            type: 'USER_LISTING',
            items: followingData.items
          }, '*');
        }
      }

      // Fetch first page of followers
      const followersUrl = `https://sora.chatgpt.com/backend/project_y/${currentUserId}/followers/user_listing?limit=100`;
      const followersRes = await fetch(followersUrl, { credentials: 'include' });
      if (followersRes.ok) {
        const followersData = await followersRes.json();
        if (followersData.items?.length > 0) {
          console.log('[SFT] Auto-fetched', followersData.items.length, 'followers');
          window.postMessage({
            source: 'SFT',
            type: 'USER_LISTING',
            items: followersData.items
          }, '*');
        }
      }

      console.log('[SFT] Auto-fetch complete');
    } catch (e) {
      console.warn('[SFT] Auto-fetch failed:', e);
    }
  }

  // Add badges to usernames based on follow status
  async function addFollowBadges() {
    // Check if we're on a profile page or user listing
    const isProfilePage = window.location.pathname.startsWith('/profile/');
    const isFollowingPage = window.location.pathname.includes('/following');
    const isFollowersPage = window.location.pathname.includes('/followers');

    if (isProfilePage) {
      await addProfilePageBadge();
    }

    if (isFollowingPage || isFollowersPage) {
      await addUserListingBadges();
    }
  }

  // Add badge to profile page header
  async function addProfilePageBadge() {
    // Extract user ID from the page (look for API calls or data attributes)
    const userId = await extractUserIdFromPage();
    if (!userId) return;

    const userData = await new Promise(resolve => {
      chrome.runtime.sendMessage({
        type: 'GET_FOLLOW_DATA',
        userId: userId
      }, response => {
        resolve(response?.data);
      });
    });

    if (!userData) return;

    // Find username/display name element on page
    const displayNameElements = document.querySelectorAll('[class*="display"], [class*="name"], h1, h2');

    for (const element of displayNameElements) {
      if (element.textContent.trim() && !element.querySelector('.' + CSS_CLASS_BADGE)) {
        // Check if this looks like a display name
        const text = element.textContent.trim();
        if (text.length > 2 && text.length < 100 && !text.includes('\n')) {
          const badge = createFollowBadge(userData.follows_you);
          element.appendChild(badge);
          break;
        }
      }
    }
  }

  // Add badges to user listings (following/followers pages)
  async function addUserListingBadges() {
    // Find all user cards/items
    const userElements = document.querySelectorAll('[class*="user"], [class*="profile"], [href*="/profile/"]');
    if (userElements.length === 0) return;

    const { followData = {} } = await chrome.storage.local.get('followData');
    const usersByUsername = new Map();
    Object.values(followData).forEach(user => {
      if (user?.username) {
        usersByUsername.set(user.username, user);
      }
    });

    for (const element of userElements) {
      // Skip if already processed
      if (element.querySelector('.' + CSS_CLASS_BADGE)) continue;

      // Try to extract user ID or username from the element
      const link = element.querySelector('a[href*="/profile/"]') ||
                   (element.tagName === 'A' && element.getAttribute('href')?.includes('/profile/') ? element : null);

      if (!link) continue;

      const href = link.getAttribute('href');
      const username = href.split('/profile/')[1]?.split(/[?#]/)[0];

      if (!username) continue;

      // Find user by username
      const userData = usersByUsername.get(username);

      if (userData) {
        // Find display name element within this user card
        const nameElement = element.querySelector('[class*="name"], [class*="display"]') ||
                           element.querySelector('span, div, p');

        if (nameElement && !nameElement.querySelector('.' + CSS_CLASS_BADGE)) {
          const badge = createFollowBadge(userData.follows_you);

          // If they don't follow back, append (DNF) to the display name
          if (!userData.follows_you) {
            const dnfText = document.createElement('span');
            dnfText.className = CSS_CLASS_DNF;
            dnfText.textContent = ' (DNF)';
            dnfText.style.cssText = 'color: #dc2626; font-weight: 600; margin-left: 4px;';
            nameElement.appendChild(dnfText);
          }

          nameElement.appendChild(badge);
        }
      }
    }
  }

  // Create follow badge element
  function createFollowBadge(followsYou) {
    const badge = document.createElement('span');
    badge.className = CSS_CLASS_BADGE;
    badge.setAttribute('data-follows', followsYou);

    if (followsYou) {
      badge.innerHTML = '✓';
      badge.setAttribute('title', 'Follows you back');
      badge.style.cssText = `
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 18px;
        height: 18px;
        background: #10b981;
        color: white;
        border-radius: 50%;
        font-size: 12px;
        font-weight: bold;
        margin-left: 6px;
        vertical-align: middle;
      `;
    } else {
      badge.innerHTML = '✗';
      badge.setAttribute('title', 'Does not follow you');
      badge.style.cssText = `
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 18px;
        height: 18px;
        background: #dc2626;
        color: white;
        border-radius: 50%;
        font-size: 12px;
        font-weight: bold;
        margin-left: 6px;
        vertical-align: middle;
      `;
    }

    return badge;
  }

  // Extract user ID from current page
  async function extractUserIdFromPage() {
    // Method 1: Check for user ID in script tags or data attributes
    const scripts = document.querySelectorAll('script');
    for (const script of scripts) {
      const match = script.textContent.match(/user-[a-zA-Z0-9]+/);
      if (match) return match[0];
    }

    // Method 2: Extract from username in URL and lookup
    const pathParts = window.location.pathname.split('/');
    const username = pathParts[pathParts.indexOf('profile') + 1];

    if (username) {
      const { followData = {} } = await chrome.storage.local.get('followData');
      const user = Object.entries(followData).find(([_, data]) => data.username === username);
      if (user) return user[0];
    }

    return null;
  }

  function scheduleBadgeUpdate() {
    if (badgeTimeoutId) clearTimeout(badgeTimeoutId);
    badgeTimeoutId = setTimeout(() => {
      addFollowBadges();
    }, 500);
  }

  function ensureBadgeObserver(root) {
    if (!root) return;
    if (!badgeObserver) {
      badgeObserver = new MutationObserver(() => {
        scheduleBadgeUpdate();
      });
    }

    if (observedRoot !== root) {
      badgeObserver.disconnect();
      observedRoot = root;
      badgeObserver.observe(root, {
        childList: true,
        subtree: true
      });
    }
  }

  // Start observing when page loads
  async function initialize() {
    if (initializeInFlight) {
      initializeQueued = true;
      return;
    }
    initializeInFlight = true;
    try {
      // Auto-fetch follow data if cache is empty (first time use)
      await autoFetchFollowData();

      // Add badges to current page
      await addFollowBadges();

      // Observe the main content area for changes
      const mainContent = document.querySelector('main') || document.body;
      ensureBadgeObserver(mainContent);
    } finally {
      initializeInFlight = false;
      if (initializeQueued) {
        initializeQueued = false;
        initialize();
      }
    }
  }

  // Setup URL watcher for SPA navigation (after DOM is ready)
  function setupUrlWatcher() {
    if (urlObserver) return;
    if (!document.body) {
      console.warn('[SFT Content] document.body not available yet, deferring URL watcher');
      setTimeout(setupUrlWatcher, 100);
      return;
    }

    let lastUrl = location.href;
    urlObserver = new MutationObserver(() => {
      const currentUrl = location.href;
      if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        setTimeout(initialize, 1000);
      }
    });
    urlObserver.observe(document.body, { subtree: true, childList: true });
    console.log('[SFT Content] URL watcher setup complete');
  }

  // Wait for page to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initialize();
      setupUrlWatcher();
    });
  } else if (document.readyState === 'interactive' || document.readyState === 'complete') {
    // DOM exists, safe to initialize
    if (document.body) {
      initialize();
      setupUrlWatcher();
    } else {
      // Edge case: wait for body
      document.addEventListener('DOMContentLoaded', () => {
        initialize();
        setupUrlWatcher();
      });
    }
  }

})();
