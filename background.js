// Background Service Worker for Sora Follow Tracker

const CACHE_DURATION = 12 * 60 * 60 * 1000; // 12 hours in milliseconds

// Initialize storage on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    followData: {},
    settings: {
      autoPaginate: true,
      cacheExpiry: CACHE_DURATION
    },
    lastSync: 0
  });
  console.log('Sora Follow Tracker initialized');
});

// Message handler from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'UPDATE_FOLLOW_DATA') {
    console.log('[SFT Background] Received UPDATE_FOLLOW_DATA with', request.users?.length, 'users');
    updateFollowData(request.users);
    sendResponse({ success: true });
  } else if (request.type === 'GET_FOLLOW_DATA') {
    getFollowData(request.userId).then(data => {
      sendResponse({ data });
    });
    return true; // Keep channel open for async response
  } else if (request.type === 'GET_REPORT_DATA') {
    getReportData(request.includeUsers === true).then(report => {
      sendResponse({ report });
    });
    return true;
  } else if (request.type === 'UPDATE_SETTINGS') {
    updateSettings(request.settings).then(() => {
      sendResponse({ success: true });
    });
    return true;
  } else if (request.type === 'GET_SETTINGS') {
    getSettings().then(settings => {
      sendResponse({ settings });
    });
    return true;
  }
});

// Update follow data from intercepted API responses
async function updateFollowData(users) {
  if (!Array.isArray(users) || users.length === 0) {
    console.warn('[SFT Background] updateFollowData called without user data');
    return;
  }

  const validUsers = users.filter(user => {
    if (!user || typeof user !== 'object') return false;
    const hasUserId = typeof user.user_id === 'string' || typeof user.user_id === 'number';
    const hasUsername = typeof user.username === 'string';
    const hasFollowFlag = typeof user.follows_you === 'boolean';
    return hasUserId && hasUsername && hasFollowFlag;
  });

  if (validUsers.length === 0) {
    console.warn('[SFT Background] No valid users to update');
    return;
  }

  const { followData = {} } = await chrome.storage.local.get('followData');
  const timestamp = Date.now();

  validUsers.forEach(user => {
    const displayName = typeof user.display_name === 'string' && user.display_name.trim().length > 0
      ? user.display_name
      : user.username;

    followData[user.user_id] = {
      username: user.username,
      display_name: displayName,
      follows_you: user.follows_you,
      follower_count: typeof user.follower_count === 'number' ? user.follower_count : 0,
      following_count: typeof user.following_count === 'number' ? user.following_count : 0,
      post_count: typeof user.post_count === 'number' ? user.post_count : 0,
      last_updated: timestamp
    };
  });

  await chrome.storage.local.set({
    followData,
    lastSync: timestamp
  });

  console.log(`Updated follow data for ${users.length} users`);
}

// Get follow data for specific user
async function getFollowData(userId) {
  const { followData = {} } = await chrome.storage.local.get('followData');
  const { settings } = await chrome.storage.local.get('settings');

  const user = followData[userId];
  if (!user) return null;

  // Check if cache is expired
  const cacheExpiry = settings?.cacheExpiry || CACHE_DURATION;
  if (Date.now() - user.last_updated > cacheExpiry) {
    return { ...user, expired: true };
  }

  return user;
}

// Get report data (top followers, follows, non-follows)
async function getReportData(includeUsers = false) {
  const { followData = {} } = await chrome.storage.local.get('followData');

  const users = Object.values(followData);

  // Filter and sort
  const followers = users.filter(u => u.follows_you).sort((a, b) => b.follower_count - a.follower_count);
  const nonFollowers = users.filter(u => !u.follows_you).sort((a, b) => b.follower_count - a.follower_count);
  const topEngagement = users.sort((a, b) => b.post_count - a.post_count);

  const baseReport = {
    totalTracked: users.length,
    followersCount: followers.length,
    nonFollowersCount: nonFollowers.length,
    topFollowers: followers.slice(0, 10),
    topNonFollowers: nonFollowers.slice(0, 10),
    topEngagement: topEngagement.slice(0, 10),
    lastSync: (await chrome.storage.local.get('lastSync')).lastSync || 0
  };

  if (includeUsers) {
    baseReport.followers = followers;
    baseReport.nonFollowers = nonFollowers;
    baseReport.allUsers = users;
  }

  return baseReport;
}

// Update settings
async function updateSettings(newSettings) {
  const { settings } = await chrome.storage.local.get('settings');
  const updated = { ...settings, ...newSettings };
  await chrome.storage.local.set({ settings: updated });
}

// Get settings
async function getSettings() {
  const { settings } = await chrome.storage.local.get('settings');
  return settings || { autoPaginate: true, cacheExpiry: CACHE_DURATION };
}
