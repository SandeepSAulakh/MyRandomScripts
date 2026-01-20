# YouTube Watch Later Cleaner

Automatically removes watched videos from your Watch Later playlist.

**Auto-Update Enabled:** Script automatically updates via Tampermonkey when new versions are released.

---

## Script

### `youtube-remove-watched.user.js` (v1.5.1)

Runs automatically when you visit your Watch Later playlist and removes all watched videos.

**Features:**
- Runs automatically when you visit Watch Later
- Clicks the "Remove watched videos" menu option
- Auto-confirms the dialog
- Keeps your Watch Later clean without manual work
- Auto-updates via Tampermonkey

**URL:** Works on `https://www.youtube.com/playlist?list=WL`

---

## Installation

### Option 1: Auto-Install (Recommended)
1. Install [Tampermonkey](https://www.tampermonkey.net/) (Chrome/Edge/Firefox)
2. Click the raw script link on GitHub
3. Tampermonkey will prompt to install
4. Script auto-updates when new versions are released

### Option 2: Manual Install
1. Install [Tampermonkey](https://www.tampermonkey.net/)
2. Click on the Tampermonkey icon > "Create a new script"
3. Delete the default template
4. Copy and paste the script
5. Save (Ctrl+S)

---

## How It Works

1. Go to your Watch Later playlist
2. Script waits for page to load (3 seconds)
3. Clicks the 3-dot menu button
4. Clicks "Remove watched videos"
5. Auto-clicks "Remove" on confirmation dialog
6. Done! All watched videos removed.

---

## Tips

- If the script doesn't work, YouTube may have updated their UI - check the console (F12) for error messages
- You can temporarily disable the script in Tampermonkey if you don't want auto-removal

---

## Changelog

- **v1.5.1** - Added Tampermonkey auto-update support
- **v1.5** - Fixed confirmation dialog button selector
- **v1.4** - Improved element detection with waitForElement
- **v1.3** - Added confirmation dialog handling
- **v1.2** - Fixed selectors for YouTube updates
- **v1.0** - Initial version
