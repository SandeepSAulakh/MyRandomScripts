# MyRandomScripts

Just some random browser scripts I made to make my life a little easier.

---

## What's Inside

| Folder | What it does |
|--------|--------------|
| **[google/](./google/)** | Google Apps Scripts - List folders, find empty folders, track new uploads, bulk remove |
| **[udemy/](./udemy/)** | Auto-enroll in free Udemy courses + open coupon links from Gmail (with batch processing) |
| **[youtube/](./youtube/)** | Auto-remove watched videos from Watch Later playlist |

---

## Highlights

### Google Drive Folder Manager
List all your Google Drive folders in a spreadsheet, find empty ones, and bulk delete them.
- List folders only or include subfolders
- **Status tags** - "New Upload" / "Recent Upload" based on date
- **Update List** - add only new folders without re-scanning
- **Auto-update scheduling** - runs nightly automatically
- Find and remove empty folders
- Mark folders with "Remove" and delete them in bulk
- [See details](./google/)

### Udemy Auto-Enrollment
Automatically enroll in free Udemy courses from deal emails.
- Gmail button opens all coupon links (**batch processing** with stop button)
- Auto-enrolls in 100% off courses
- Auto-closes paid or already-enrolled tabs (**fast close**)
- **Auto-updates** via Tampermonkey
- [See details](./udemy/)

### YouTube Watch Later Cleaner
Keep your Watch Later playlist clean automatically.
- Auto-removes watched videos when you visit the playlist
- **Auto-updates** via Tampermonkey
- [See details](./youtube/)

---

## Requirements

- **Browser scripts** (udemy/, youtube/): [Tampermonkey](https://www.tampermonkey.net/) extension
- **Google scripts** (google/): Just a Google account

---

## Quick Start

### For Tampermonkey Scripts (Auto-Install)
1. Install Tampermonkey
2. Click the raw script file on GitHub
3. Tampermonkey prompts to install
4. Scripts auto-update when new versions are released!

### For Tampermonkey Scripts (Manual)
1. Install Tampermonkey
2. Pick a script from udemy/ or youtube/
3. Create new script in Tampermonkey
4. Paste the code
5. Save & enjoy!

### For Google Apps Scripts
1. Open Google Sheets
2. Go to Extensions > Apps Script
3. Paste the code
4. Save & run from the custom menu

---
