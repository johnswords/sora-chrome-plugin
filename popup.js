// Popup Script for Sora Follow Tracker

const numberFormatter = new Intl.NumberFormat();

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

  // Full follow report actions
  document.getElementById('copy-follow-report-btn').addEventListener('click', copyFullFollowReport);
  document.getElementById('download-follow-report-btn').addEventListener('click', downloadFullFollowReport);
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

// -------- Full Analysis Helpers --------

async function copyFullFollowReport() {
  const button = document.getElementById('copy-follow-report-btn');
  button.disabled = true;
  showFollowReportStatus('info', 'Building full analysis...');

  try {
    const report = await fetchFullFollowReport();

    if (!report || (!report.followers?.length && !report.nonFollowers?.length)) {
      showFollowReportStatus('error', 'No follow data yet. Visit your following/followers pages first.');
      return;
    }

    const formatted = formatFollowReportText(report);
    await navigator.clipboard.writeText(formatted);
    showFollowReportStatus('success', `Copied ${report.totalTracked} account(s) to clipboard`);
  } catch (error) {
    console.error('Full report copy failed:', error);
    showFollowReportStatus('error', `Copy failed: ${error.message}`);
  } finally {
    button.disabled = false;
  }
}

async function downloadFullFollowReport() {
  const button = document.getElementById('download-follow-report-btn');
  button.disabled = true;
  showFollowReportStatus('info', 'Packaging CSV...');

  try {
    const report = await fetchFullFollowReport();

    if (!report || (!report.followers?.length && !report.nonFollowers?.length)) {
      showFollowReportStatus('error', 'No follow data yet. Visit your following/followers pages first.');
      return;
    }

    const csv = formatFollowReportCsv(report);
    const timestamp = new Date(report.lastSync || Date.now()).toISOString().replace(/[:.]/g, '-');
    const filename = `sora-follow-report-${timestamp}.csv`;

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    showFollowReportStatus('success', `Saved ${report.totalTracked} rows to ${filename}`);
  } catch (error) {
    console.error('Full report download failed:', error);
    showFollowReportStatus('error', `Download failed: ${error.message}`);
  } finally {
    button.disabled = false;
  }
}

async function fetchFullFollowReport() {
  const response = await chrome.runtime.sendMessage({
    type: 'GET_REPORT_DATA',
    includeUsers: true
  });
  return response?.report;
}

function formatFollowReportText(report) {
  const lines = [];
  const exportedAt = formatTimestamp(report.lastSync || Date.now());

  lines.push('Sora Follow Analysis');
  lines.push(`Exported: ${exportedAt}`);
  lines.push(`Total tracked: ${report.totalTracked}`);
  lines.push(`Mutual follows: ${report.followersCount}`);
  lines.push(`Non-followers: ${report.nonFollowersCount}`);
  lines.push('');

  lines.push('=== Mutual Follows ===');
  (report.followers || []).forEach((user, index) => {
    lines.push(`${index + 1}. ${formatUserLine(user)}`);
  });
  if (!(report.followers || []).length) {
    lines.push('None recorded yet');
  }

  lines.push('');
  lines.push('=== Users Who Do Not Follow Back ===');
  (report.nonFollowers || []).forEach((user, index) => {
    lines.push(`${index + 1}. ${formatUserLine(user)}`);
  });
  if (!(report.nonFollowers || []).length) {
    lines.push('None recorded yet');
  }

  return lines.join('\n');
}

function formatUserLine(user) {
  const name = user.display_name || 'Unknown';
  const username = user.username ? `@${user.username}` : '';
  const followers = formatNumber(user.follower_count);
  const following = formatNumber(user.following_count);
  const posts = formatNumber(user.post_count);
  return `${name} ${username} — ${followers} followers · ${following} following · ${posts} posts`;
}

function formatFollowReportCsv(report) {
  const rows = [];
  rows.push(['category', 'display_name', 'username', 'follower_count', 'following_count', 'post_count', 'last_seen']);

  const pushRows = (category, users = []) => {
    users.forEach(user => {
      rows.push([
        category,
        user.display_name || '',
        user.username || '',
        user.follower_count ?? '',
        user.following_count ?? '',
        user.post_count ?? '',
        user.last_updated ? new Date(user.last_updated).toISOString() : ''
      ]);
    });
  };

  pushRows('mutual_follow', report.followers || []);
  pushRows('not_following_back', report.nonFollowers || []);

  return rows.map(columns => columns.map(toCsvValue).join(',')).join('\n');
}

function toCsvValue(value) {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function formatNumber(value) {
  return numberFormatter.format(value || 0);
}

function formatTimestamp(timestamp) {
  try {
    return new Date(timestamp).toLocaleString();
  } catch (e) {
    return 'Unknown';
  }
}

function showFollowReportStatus(type, message) {
  const statusEl = document.getElementById('follow-report-status');
  if (!statusEl) return;
  statusEl.className = `status-message ${type}`;
  statusEl.textContent = message;
  statusEl.style.display = 'block';

  if (type === 'success') {
    setTimeout(() => {
      statusEl.style.display = 'none';
    }, 3500);
  }
}
