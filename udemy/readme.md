# Udemy Auto-Enrollment Scripts

Automated scripts for enrolling in free Udemy courses. These two scripts work together for a fully hands-free experience.

**Auto-Update Enabled:** Scripts automatically update via Tampermonkey when new versions are released.

---

## Scripts

### 1. `udemy-auto-enroll.user.js` (v2.9)

Automatically enrolls in free (100% off) Udemy courses and closes tabs for paid courses.

**Features:**
- Auto-detects free courses (100% off or $0)
- Auto-clicks "Enroll now" button
- Auto-closes tabs for paid courses
- **Fast close for already enrolled courses** (no delays)
- Handles slow Udemy page loads with smart retry logic
- Works in background tabs (uses Web Workers)
- Human-like delays to avoid bot detection
- Global throttle - processes one tab at a time
- Handles "Forbidden" rate-limit pages automatically

**Configuration:**
```javascript
const CONFIG = {
    MAX_RETRIES: 3,              // Retries for stuck pages
    MAX_WAIT_TIME: 20000,        // Max wait for elements (20s)
    MIN_ACTION_DELAY: 1500,      // Min delay before clicks (1.5s)
    MAX_ACTION_DELAY: 4000,      // Max delay before clicks (4s)
    FORBIDDEN_WAIT_MIN: 45000,   // Min wait on rate-limit (45s)
    FORBIDDEN_WAIT_MAX: 90000,   // Max wait on rate-limit (90s)
};
```

---

### 2. `gmail-open-udemy-links.user.js` (v1.4)

Adds a floating button to Gmail that opens all "REDEEM OFFER" links in background tabs with batch processing.

**Works on:** Gmail

**Features:**
- **Button only appears when REDEEM OFFER links are found**
- Shows count of links found (e.g., "Open 15 REDEEM OFFER")
- **Batch processing** - opens 5 tabs at a time
- **Random delays** between tabs (2-4s) and batches (10-15s)
- **Stop button** - cancel anytime during processing
- Tabs open in background (stays on Gmail)
- Progress indicator shows current batch and count

---

### 3. `reddit-open-udemy-links.user.js` (v1.2)

Adds a floating button on Reddit to open all "REDEEM OFFER" links from idownloadcoupon.com.

**Works on:** Reddit (www, old, new)

**Features:**
- **Button only appears when REDEEM OFFER links are found**
- Only targets links from idownloadcoupon.com
- **Batch processing** - opens 5 tabs at a time
- **Random delays** between tabs (2-4s) and batches (10-15s)
- **Stop button** - cancel anytime during processing
- Tabs open in background
- Auto-detects new links as you scroll (Reddit SPA)

**Configuration:**
```javascript
const CONFIG = {
    BATCH_SIZE: 5,               // Tabs per batch
    MIN_DELAY_IN_BATCH: 2000,    // 2-4 sec between tabs
    MAX_DELAY_IN_BATCH: 4000,
    MIN_BATCH_PAUSE: 10000,      // 10-15 sec between batches
    MAX_BATCH_PAUSE: 15000
};
```

---

## Installation

### Option 1: Auto-Install (Recommended)
1. Install [Tampermonkey](https://www.tampermonkey.net/) (Chrome/Edge/Firefox)
2. Click the raw script link on GitHub
3. Tampermonkey will prompt to install
4. Scripts auto-update when new versions are released

### Option 2: Manual Install
1. Install [Tampermonkey](https://www.tampermonkey.net/)
2. Click on the Tampermonkey icon > "Create a new script"
3. Delete the default template
4. Copy and paste the script
5. Save (Ctrl+S)
6. Repeat for the second script

---

## How It Works

```
Gmail                       Udemy Course Page           Success
  |                              |                         |
  | Click "Open All             | Auto-detects            | Auto-closes
  | REDEEM OFFER"               | if free                 | tab
  |                              |                         |
  v                              v                         |
Opens 5 tabs ──────────────> Enrolls if free ─────────────┘
(batch mode)                 Closes if paid
  |                          Closes if enrolled (fast!)
  v
Pauses 10-15s
  |
  v
Next batch...
```

1. Open your Udemy deals email in Gmail
2. Click the "Open All REDEEM OFFER" button
3. All course links open in background tabs (batched)
4. The auto-enroll script handles each tab automatically
5. Click STOP anytime if needed
6. Sit back and watch your Udemy library grow!

---

## Tips

- The Gmail script batches tabs to avoid overwhelming your browser
- Already enrolled courses close instantly (no waiting)
- If you get rate-limited, the script waits 45-90 seconds automatically
- Check browser console (F12) for logs to see what's happening

---

## Changelog

### udemy-auto-enroll.user.js
- **v2.9** - Fixed background tab detection with longer wait time
- **v2.8** - Improved enrolled detection with debug logging
- **v2.7** - Added fast close for already enrolled courses
- **v2.6** - Added new UI selectors for enrolled detection
- **v2.5** - Added Tampermonkey auto-update support
- **v2.4** - Increased forbidden wait times (45-90s)
- **v2.3** - Added Forbidden page detection, global lock for tab throttling
- **v2.2** - Added Web Worker for background tab support
- **v2.1** - Added human-like delays to avoid bot detection
- **v2.0** - Added smart element waiting and retry logic

### gmail-open-udemy-links.user.js
- **v1.4** - Button only shows when REDEEM OFFER links found, shows link count
- **v1.3** - Added STOP button, reduced batch pause times (10-15s)
- **v1.2** - Added batch processing with random delays
- **v1.1** - Opens tabs in background (stays on Gmail)
- **v1.0** - Initial version

### reddit-open-udemy-links.user.js
- **v1.2** - Fixed button styling, simplified version format for auto-updates
- **v1.1** - Fixed button text cutoff with proper height/line-height
- **v1.0** - Initial version with batch processing, stop button, idownloadcoupon.com filter
