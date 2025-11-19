# Sora Follow Tracker & Video Exporter

A Chrome extension that tracks mutual follow relationships on Sora (sora.chatgpt.com) and exports user videos with one click.

## Features

### 1. Follow Status Tracking
- **Zero-Setup Auto-Fetch**: Automatically loads your first 100 following/followers on first visit—no manual setup required
- **Automatic Interception**: Monitors network requests to Sora's API to track who follows you back
- **Badge Indicators**: Shows ✓ (green) for mutual follows, ✗ (red) for non-followers next to usernames
- **DNF Labels**: Appends "(DNF)" to display names for users who don't follow you back
- **Smart Caching**: Stores relationship data for 12 hours to minimize API calls

### 2. Video Export
- **One-Click Export**: Copy all videos from any profile to clipboard
- **Optional Pagination**: Toggle to fetch all videos or just the first page
- **Comprehensive Data**: Exports title, URL, description, stats (likes, views, remixes, comments), and prompt

### 3. Analytics Report
- **Top Followers**: See users with highest follower counts who follow you back
- **Top Non-Followers**: Identify influential users who don't follow back
- **Engagement Stats**: Track total users, mutual follows, and non-followers
- **Quick Stats**: View summary metrics in the export view
- **Full Analysis Export**: Copy the entire mutual/non-follow list or download a CSV with one click

## Installation

### Step 1: Generate Icons
1. Open `icons/generate-icons.html` in your browser
2. Download the three generated icons:
   - `icon16.png`
   - `icon48.png`
   - `icon128.png`
3. Save them in the `icons/` directory

### Step 2: Load Extension in Chrome
1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right corner)
3. Click **Load unpacked**
4. Select the `sora-chrome-plugin` directory
5. The extension icon should appear in your toolbar

## Usage

### Initial Setup
The extension works automatically with no manual setup required!

**Automatic Data Collection:**
1. Visit [sora.chatgpt.com](https://sora.chatgpt.com)
2. On first load, the extension automatically fetches your first 100 following and 100 followers
3. As you browse, it continuously captures additional data from API responses
4. Badges appear immediately on profile pages

**Manual Cache Population (Optional):**
For users with 100+ following/followers, you can populate more data by:
1. Navigate to your **Following** page and scroll through the list
2. Visit your **Followers** page and scroll through
3. The extension intercepts API responses and stores all relationship data automatically

### Viewing Follow Status

**On Profile Pages:**
- Navigate to any user's profile at `sora.chatgpt.com/profile/{username}`
- A badge will appear next to their display name:
  - ✓ (green) = They follow you back
  - ✗ (red) = They don't follow you

**On Following/Followers Lists:**
- Users who don't follow back will show "(DNF)" after their name
- Badge indicators appear next to all usernames

### Exporting Videos

1. Navigate to any Sora profile page
2. Click the extension icon in your toolbar
3. Ensure you're on the **Export** tab
4. Toggle **Auto-paginate all videos** if you want to fetch all videos (can take time for prolific users)
5. Click **Copy Videos to Clipboard**
6. Wait for the export to complete
7. Paste the data anywhere (text file, spreadsheet, etc.)

**Export Format:**
```
=== Videos from @username ===
Total: X video(s)

--- Video 1 ---
Title: Video title text
URL: https://sora.chatgpt.com/p/{post-id}
Stats: X likes, Y views, Z remixes, W replies
Prompt: The generation prompt used
Video File: Direct video URL

--- Video 2 ---
...
```

### Viewing Analytics Report

1. Click the extension icon
2. Switch to the **Report** tab
3. View statistics:
   - **Overview**: Total tracked users, mutual follows, non-followers
   - **Top Users Who Follow You**: Ranked by follower count
   - **Top Users Who Don't Follow Back**: Ranked by follower count
4. Click any user card to open their profile
5. Scroll to **Full Analysis Export** and choose:
   - **Copy Full Follow Report** for a clipboard-friendly text summary of every tracked account
   - **Download Follow Report** for a CSV saved to your Downloads folder (includes category, follower counts, timestamps)

### Settings

**Auto-paginate all videos** (Export tab):
- **ON**: Fetches all videos from a profile (can be 100+ for active users)
- **OFF**: Fetches only the first page (~20 videos)

**Cache Duration**: 12 hours (hardcoded, can be modified in `background.js`)

## Technical Architecture

### Files
```
sora-chrome-plugin/
├── manifest.json          # Extension configuration
├── background.js          # Service worker (data storage)
├── content.js            # Content script (DOM + network interception)
├── popup.html            # Extension popup UI
├── popup.js              # Popup logic
├── styles.css            # Content script styles
├── icons/
│   ├── generate-icons.html  # Icon generator
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

### Data Flow
1. **Network Interception**: Content script intercepts `fetch()` calls to Sora's user listing endpoints
2. **Data Extraction**: Parses `follows_you` boolean from each user object
3. **Storage**: Sends data to background service worker via `chrome.runtime.sendMessage()`
4. **Caching**: Background worker stores data in `chrome.storage.local` with timestamps
5. **Visual Updates**: Content script queries storage and injects badge elements into DOM
6. **Export**: Popup makes authenticated API calls to fetch video data

### Network Endpoints Monitored
- `GET /backend/project_y/{user-id}/following/user_listing` - Following list
- `GET /backend/project_y/{user-id}/followers/user_listing` - Followers list
- `GET /backend/project_y/profile_feed/{user-id}` - User videos (export only)

## Troubleshooting

### Badges Not Appearing
- **Solution 1**: Visit your following/followers pages to populate the cache
- **Solution 2**: Refresh the profile page after visiting your lists
- **Solution 3**: Check browser console for errors (F12 → Console tab)

### "Profile not found in cache" Error
- **Cause**: The extension hasn't seen this user in your following/followers lists yet
- **Solution**: Navigate to your following/followers pages and scroll through

### Export Shows Auth Error
- **Cause**: Not logged into Sora
- **Solution**: Log into sora.chatgpt.com and try again

### Export Only Gets First Page
- **Cause**: Auto-paginate is disabled
- **Solution**: Enable "Auto-paginate all videos" toggle in the extension popup

### Cache Is Stale
- **Cause**: Data is older than 12 hours
- **Solution**: Re-visit your following/followers pages to refresh

## Privacy & Permissions

### Required Permissions
- **storage**: To cache follow relationship data locally
- **activeTab**: To access current Sora page content
- **clipboardWrite**: To copy video data to clipboard
- **host_permissions** (sora.chatgpt.com): To intercept API calls and inject badges

### Data Storage
- All data is stored **locally** in your browser via `chrome.storage.local`
- No external servers are contacted
- No analytics or tracking
- Data includes: user IDs, usernames, display names, follow status, follower counts

### Security Notes
- Extension only works on `sora.chatgpt.com`
- Uses existing authentication (your Sora session cookies)
- Network requests are read-only (except video export, which uses GET requests)
- No credentials are stored or transmitted

## Customization

### Changing Cache Duration
Edit `background.js`:
```javascript
const CACHE_DURATION = 12 * 60 * 60 * 1000; // Change to desired duration in ms
```

### Styling Badges
Edit `styles.css` or the inline styles in `content.js`:
```css
.sft-follow-badge[data-follows="true"] {
  background: #10b981 !important; /* Change green color */
}

.sft-follow-badge[data-follows="false"] {
  background: #dc2626 !important; /* Change red color */
}
```

### Modifying DNF Label
Edit `content.js`:
```javascript
dnfText.textContent = ' (DNF)'; // Change to ' (No Follow)' or other text
```

## Limitations

- **SPA Navigation**: May need manual refresh on some pages due to Sora's single-page app architecture
- **Rate Limiting**: Rapid exports of many videos may trigger rate limits (not currently handled)
- **Cache Invalidation**: No automatic refresh of stale data (requires manual re-visit to lists)
- **API Changes**: Extension depends on Sora's internal API structure, which may change

## Future Enhancements

Potential features for future versions:
- [ ] Bulk unfollows for non-followers
- [ ] Export to CSV/JSON formats
- [ ] Visual charts and graphs in report view
- [ ] Notification when someone unfollows you
- [ ] Historical tracking of follower changes
- [ ] Filter/search in report view
- [ ] Export settings (custom format templates)
- [ ] Dark/light theme toggle

## Development

### Testing
1. Make code changes
2. Navigate to `chrome://extensions/`
3. Click the refresh icon on the extension card
4. Test on sora.chatgpt.com

### Debugging
- **Content Script**: Open DevTools on Sora page (F12 → Console)
- **Background Worker**: Click "service worker" link on extension card
- **Popup**: Right-click extension icon → Inspect popup

### Building for Production
This is a development version. For production:
1. Replace placeholder icons with professional designs
2. Add error reporting/logging
3. Implement rate limiting protection
4. Add automated tests
5. Submit to Chrome Web Store (if desired)

## License

This extension is provided as-is for personal use. Feel free to modify and extend as needed.

## Credits

Created for tracking mutual follows and exporting content on Sora (sora.chatgpt.com).

---

**Version**: 1.0.0
**Last Updated**: 2025-11-11
