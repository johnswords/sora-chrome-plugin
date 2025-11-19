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
    getReportData().then(report => {
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
  const { followData = {} } = await chrome.storage.local.get('followData');
  const timestamp = Date.now();

  users.forEach(user => {
    followData[user.user_id] = {
      username: user.username,
      display_name: user.display_name,
      follows_you: user.follows_you,
      follower_count: user.follower_count,
      following_count: user.following_count,
      post_count: user.post_count,
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
async function getReportData() {
  const { followData = {} } = await chrome.storage.local.get('followData');

  const users = Object.values(followData);

  // Filter and sort
  const followers = users.filter(u => u.follows_you).sort((a, b) => b.follower_count - a.follower_count);
  const nonFollowers = users.filter(u => !u.follows_you).sort((a, b) => b.follower_count - a.follower_count);
  const topEngagement = users.sort((a, b) => b.post_count - a.post_count);

  return {
    totalTracked: users.length,
    followersCount: followers.length,
    nonFollowersCount: nonFollowers.length,
    topFollowers: followers.slice(0, 10),
    topNonFollowers: nonFollowers.slice(0, 10),
    topEngagement: topEngagement.slice(0, 10),
    lastSync: (await chrome.storage.local.get('lastSync')).lastSync || 0
  };
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
