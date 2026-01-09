# Udemy Auto-Enrollment Scripts

Automated scripts for enrolling in free Udemy courses. These two scripts work together for a fully hands-free experience.

---

## Scripts

### 1. `udemy-auto-enroll.user.js`

Automatically enrolls in free (100% off) Udemy courses and closes tabs for paid courses.

**Features:**
- ✅ Auto-detects free courses (100% off or $0)
- ✅ Auto-clicks "Enroll now" button
- ✅ Auto-closes tabs for paid courses
- ✅ Auto-closes tabs for already enrolled courses
- ✅ Handles slow Udemy page loads with smart retry logic
- ✅ Works in background tabs (uses Web Workers)
- ✅ Human-like delays to avoid bot detection
- ✅ Global throttle - processes one tab at a time
- ✅ Handles "Forbidden" rate-limit pages automatically

**Configuration:**
```javascript
const CONFIG = {
    MAX_RETRIES: 3,              // Retries for stuck pages
    MAX_WAIT_TIME: 20000,        // Max wait for elements (20s)
    MIN_ACTION_DELAY: 1500,      // Min delay before clicks (1.5s)
    MAX_ACTION_DELAY: 4000,      // Max delay before clicks (4s)
    FORBIDDEN_WAIT_MIN: 30000,   // Min wait on rate-limit (30s)
    FORBIDDEN_WAIT_MAX: 60000,   // Max wait on rate-limit (60s)
};
```

---

### 2. `gmail-open-udemy-links.user.js`

Adds a floating button to Gmail that opens all "REDEEM OFFER" links in background tabs.

**Features:**
- ✅ Floating blue button in Gmail
- ✅ Opens all REDEEM OFFER links at once
- ✅ Tabs open in background (stays on Gmail)
- ✅ Works with Udemy coupon emails

---

## Installation

1. Install [Tampermonkey](https://www.tampermonkey.net/) (Chrome/Edge/Firefox)
2. Click on the Tampermonkey icon → "Create a new script"
3. Delete the default template
4. Copy and paste the script
5. Save (Ctrl+S)
6. Repeat for the second script

---

## How It Works

```
📧 Gmail                    🎓 Udemy Course Page           ✅ Success
   │                              │                            │
   │ Click "Open All             │ Auto-detects               │ Auto-closes
   │ REDEEM OFFER"               │ if free                    │ tab
   │                              │                            │
   ▼                              ▼                            │
Opens all tabs ────────────► Enrolls if free ─────────────────┘
in background                Closes if paid
                             Closes if enrolled
```

1. Open your Udemy deals email in Gmail
2. Click the "🎓 Open All REDEEM OFFER" button
3. All course links open in background tabs
4. The auto-enroll script handles each tab automatically
5. Sit back and watch your Udemy library grow! 📚

---

## Tips

- If you're opening many tabs at once, the script processes them one at a time to avoid triggering Udemy's rate limits
- If you still get rate-limited, increase the delay values in CONFIG
- Check browser console (F12) for logs to see what the script is doing

---

## Changelog

### udemy-auto-enroll.user.js
- **v2.3** - Added Forbidden page detection, global lock for tab throttling
- **v2.2** - Added Web Worker for background tab support
- **v2.1** - Added human-like delays to avoid bot detection
- **v2.0** - Added smart element waiting and retry logic
- **v1.4** - Initial version with basic auto-enroll

### gmail-open-udemy-links.user.js
- **v1.1** - Opens tabs in background (stays on Gmail)
- **v1.0** - Initial version
