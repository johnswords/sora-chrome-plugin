// Popup Script for Sora Follow Tracker

document.addEventListener('DOMContentLoaded', async () => {
  // Initialize UI
  await loadSettings();
  await updateQuickStats();
  setupEventListeners();
});

// Setup event listeners
function setupEventListeners() {
  // Tab navigation
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => switchView(tab.dataset.view));
  });

  // Auto-paginate toggle
  const autoPaginateToggle = document.getElementById('auto-paginate-toggle');
  autoPaginateToggle.addEventListener('click', toggleAutoPaginate);

  // Export videos button
  document.getElementById('export-videos-btn').addEventListener('click', exportVideos);
}

// Switch between views
async function switchView(viewName) {
  // Update tabs
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.view === viewName);
  });

  // Update views
  document.querySelectorAll('.view').forEach(view => {
    view.classList.remove('active');
  });
  document.getElementById(`${viewName}-view`).classList.add('active');

  // Load data for report view
  if (viewName === 'report') {
    await loadReportData();
  }
}

// Load settings
async function loadSettings() {
  const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
  const settings = response.settings;

  const toggle = document.getElementById('auto-paginate-toggle');
  toggle.classList.toggle('active', settings.autoPaginate);
}

// Toggle auto-paginate
async function toggleAutoPaginate() {
  const toggle = document.getElementById('auto-paginate-toggle');
  const newState = !toggle.classList.contains('active');

  toggle.classList.toggle('active', newState);

  await chrome.runtime.sendMessage({
    type: 'UPDATE_SETTINGS',
    settings: { autoPaginate: newState }
  });
}

// Update quick stats in export view
async function updateQuickStats() {
  const response = await chrome.runtime.sendMessage({ type: 'GET_REPORT_DATA' });
  const report = response.report;

  document.getElementById('quick-total').textContent = report.totalTracked || 0;
  document.getElementById('quick-followers').textContent = report.followersCount || 0;
  document.getElementById('quick-non-followers').textContent = report.nonFollowersCount || 0;
}

// Export videos from current profile
async function exportVideos() {
  const button = document.getElementById('export-videos-btn');
  const statusEl = document.getElementById('export-status');

  // Get current tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // Check if we're on a Sora profile page
  if (!tab?.url || !tab.url.includes('sora.chatgpt.com/profile/')) {
    showStatus('error', 'Please navigate to a Sora profile page first');
    return;
  }

  // Extract username from URL
  const urlParts = tab.url.split('/profile/')[1];
  if (!urlParts) {
    showStatus('error', 'Could not extract profile information');
    return;
  }
  const username = urlParts.split(/[?#]/)[0];

  // Get user ID from storage
  const { followData } = await chrome.storage.local.get('followData');
  const userData = Object.entries(followData || {}).find(([_, data]) => data.username === username);

  if (!userData) {
    showStatus('error', 'Profile not found in cache. Please visit your following/followers list first.');
    return;
  }

  const userId = userData[0];

  button.disabled = true;
  button.textContent = 'Fetching videos...';
  showStatus('info', 'Collecting video data...');

  try {
    // Get settings
    const settingsResponse = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
    const settings = settingsResponse.settings;

    // Fetch videos
    const videos = await fetchAllVideos(userId, settings.autoPaginate);

    if (videos.length === 0) {
      showStatus('error', 'No videos found for this user');
      button.disabled = false;
      button.textContent = 'Copy Videos to Clipboard';
      return;
    }

    // Format and copy to clipboard
    const formatted = formatVideosForClipboard(videos, username);
    await navigator.clipboard.writeText(formatted);

    showStatus('success', `✓ Copied ${videos.length} video(s) to clipboard!`);
  } catch (error) {
    console.error('Export error:', error);
    showStatus('error', `Error: ${error.message}`);
  } finally {
    button.disabled = false;
    button.textContent = 'Copy Videos to Clipboard';
  }
}

// Fetch all videos for a user with optional pagination
async function fetchAllVideos(userId, autoPaginate) {
  // Get current tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // Send message to content script to fetch videos (it has access to auth cookies)
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(
      tab.id,
      {
        type: 'FETCH_VIDEOS',
        userId: userId,
        autoPaginate: autoPaginate
      },
      response => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (response?.success) {
          resolve(response.videos);
        } else {
          reject(new Error(response?.error || 'Unknown error'));
        }
      }
    );
  });
}

// Format videos for clipboard
function formatVideosForClipboard(videos, username) {
  const lines = [];
  lines.push(`=== Videos from @${username} ===`);
  lines.push(`Total: ${videos.length} video(s)`);
  lines.push('');

  videos.forEach((post, index) => {
    lines.push(`--- Video ${index + 1} ---`);
    lines.push(`Title: ${post.text || 'Untitled'}`);
    lines.push(`URL: ${post.permalink}`);

    if (post.caption) {
      lines.push(`Caption: ${post.caption}`);
    }

    lines.push(`Stats: ${post.like_count} likes, ${post.view_count} views, ${post.remix_count} remixes, ${post.reply_count} replies`);

    // Extract prompt from attachments
    if (post.attachments && post.attachments.length > 0) {
      const attachment = post.attachments[0];
      const prompt = attachment.prompt || 'N/A';
      lines.push(`Prompt: ${prompt}`);

      if (attachment.url) {
        lines.push(`Video File: ${attachment.url}`);
      }
    }

    lines.push('');
  });

  return lines.join('\n');
}

// Show status message
function showStatus(type, message) {
  const statusEl = document.getElementById('export-status');
  statusEl.className = `status-message ${type}`;
  statusEl.textContent = message;
  statusEl.style.display = 'block';

  if (type === 'success') {
    setTimeout(() => {
      statusEl.style.display = 'none';
    }, 3000);
  }
}

// Load report data
async function loadReportData() {
  const response = await chrome.runtime.sendMessage({ type: 'GET_REPORT_DATA' });
  const report = response.report;

  // Update overview stats
  document.getElementById('report-total').textContent = report.totalTracked || 0;
  document.getElementById('report-followers').textContent = report.followersCount || 0;
  document.getElementById('report-non-followers').textContent = report.nonFollowersCount || 0;

  // Render top followers
  const followersListEl = document.getElementById('top-followers-list');
  followersListEl.innerHTML = '';

  if (report.topFollowers && report.topFollowers.length > 0) {
    report.topFollowers.forEach(user => {
      followersListEl.appendChild(createUserItem(user, true));
    });
  } else {
    followersListEl.innerHTML = '<div class="loading">No data yet. Visit your following/followers pages to populate.</div>';
  }

  // Render top non-followers
  const nonFollowersListEl = document.getElementById('top-non-followers-list');
  nonFollowersListEl.innerHTML = '';

  if (report.topNonFollowers && report.topNonFollowers.length > 0) {
    report.topNonFollowers.forEach(user => {
      nonFollowersListEl.appendChild(createUserItem(user, false));
    });
  } else {
    nonFollowersListEl.innerHTML = '<div class="loading">No data yet. Visit your following/followers pages to populate.</div>';
  }
}

// Create user item element
function createUserItem(user, followsYou) {
  const item = document.createElement('div');
  item.className = 'user-item';

  const userInfo = document.createElement('div');
  userInfo.className = 'user-info';

  const userName = document.createElement('div');
  userName.className = 'user-name';
  userName.innerHTML = `
    ${user.display_name}
    <span class="badge ${followsYou ? 'follows' : 'no-follow'}">${followsYou ? '✓' : '✗'}</span>
  `;

  const userUsername = document.createElement('div');
  userUsername.className = 'user-username';
  userUsername.textContent = `@${user.username}`;

  userInfo.appendChild(userName);
  userInfo.appendChild(userUsername);

  const userStats = document.createElement('div');
  userStats.className = 'user-stats';
  userStats.innerHTML = `
    ${user.follower_count} followers<br>
    ${user.post_count} posts
  `;

  item.appendChild(userInfo);
  item.appendChild(userStats);

  // Make clickable to open profile
  item.style.cursor = 'pointer';
  item.addEventListener('click', () => {
    chrome.tabs.create({ url: `https://sora.chatgpt.com/profile/${user.username}` });
  });

  return item;
}
