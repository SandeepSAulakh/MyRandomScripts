# Google Apps Scripts

Google Apps Scripts to automate tasks in Google Drive, Sheets, and other Google services.

---

## Scripts

### 1. `google-drive-folder-list.gs`

Lists folders from Google Drive into a Google Sheet with options to find empty folders, track new uploads, and bulk remove.

**Features:**
- List folders only OR include subfolders (one level deep)
- **Status column** with date-based tags:
  - "New Upload" (green) - folders added in last 7 days
  - "Recent Upload" (yellow) - folders added in last 30 days
- **Update List** - add only new folders without re-scanning everything
- **Auto-update scheduling** - automatically update nightly
- **Find Empty Folders** - scans and marks empty folders (checks subfolders recursively)
- **Remove Empty Folders** - bulk delete all empty folders at once
- **Remove Marked Folders** - bulk delete folders marked for removal
- Live progress indicator with real-time status
- Batch processing for large folder structures
- Resume capability if script times out
- Built-in usage instructions in the sheet

**Menu Options:**
```
Folder List (menu)
├── List Folders Only          <- List top-level folders
├── List Folders + Subfolders  <- Include immediate subfolders
├────────────────────────────
├── Find Empty Folders         <- Scan and mark empty folders
├── Remove Empty Folders       <- Delete all empty folders
├────────────────────────────
├── Resume Listing             <- Continue if paused
├── Remove Marked Folders      <- Delete folders marked "Remove"
├────────────────────────────
├── Update List                <- Add only new folders
├── Schedule Auto-Update       <- Set up nightly updates
├── Stop Auto-Update           <- Remove scheduled updates
├────────────────────────────
└── Reset / Start Over         <- Clear progress and restart
```

---

## Installation

1. Open [Google Sheets](https://sheets.google.com) and create a new spreadsheet
2. Go to **Extensions > Apps Script**
3. Delete any default code in the editor
4. Copy and paste the script content
5. Click **Save** (Ctrl+S)
6. Refresh your spreadsheet
7. A new menu **"Folder List"** will appear

---

## How to Use

### Getting Your Folder ID

From a Google Drive folder URL:
```
https://drive.google.com/drive/folders/1ABC123xyz789
                                        └── This is the folder ID
```

### Listing Folders

1. Click **Folder List > List Folders Only** (or **List Folders + Subfolders**)
2. Enter your folder ID when prompted (or leave empty for "My Drive")
3. Watch the progress in column G
4. If paused due to timeout, click **Resume Listing**

### Status Column

The Status column (A) automatically shows:
- **New Upload** (green background) - folders created in the last 7 days
- **Recent Upload** (yellow background) - folders created in the last 30 days
- Empty for older folders

### Updating the List

Instead of re-scanning everything:
1. Click **Folder List > Update List**
2. Only new folders (not already in the sheet) will be added
3. Existing rows are preserved

### Auto-Update Scheduling

To automatically update the folder list every night:
1. Click **Folder List > Schedule Auto-Update**
2. The script will run nightly and add any new folders
3. To stop: Click **Folder List > Stop Auto-Update**

### Finding Empty Folders

1. First, list your folders using one of the list options
2. Click **Folder List > Find Empty Folders**
3. Empty folders will be marked in the Action column:
   - `Empty` - folder has no files and no subfolders
   - `Empty (subfolders empty too)` - folder and all subfolders are empty

### Removing Folders

**Option 1: Remove all empty folders**
1. After running "Find Empty Folders"
2. Click **Folder List > Remove Empty Folders**
3. All folders marked as empty will be deleted

**Option 2: Remove specific folders**
1. In the **Action** column, type `Remove`, `Delete`, or `X` for folders you want to delete
2. Click **Folder List > Remove Marked Folders**
3. Confirm the deletion
4. Folders are moved to Trash (recoverable for 30 days)

### Output Format (Folders Only)

| Status | Folder Name | Folder URL | Date Added | Action |
|--------|-------------|------------|------------|--------|
| New Upload | Projects | https://... | 2024-01-15 | |
| | Photos | https://... | 2023-05-10 | Empty |

### Output Format (With Subfolders)

| Status | Parent Folder | Subfolder | Subfolder URL | Date Added | Action |
|--------|---------------|-----------|---------------|------------|--------|
| New Upload | Projects | Design | https://... | 2024-01-15 | |
| Recent Upload | Projects | Code | https://... | 2024-01-01 | |
| | Photos | (no subfolders) | | 2023-05-10 | |

---

## Configuration

```javascript
const CONFIG = {
  FOLDER_ID: '',              // Set folder ID or leave empty to prompt
  BATCH_SIZE: 10,             // Folders processed before updating sheet
  MAX_RUNTIME_MS: 5 * 60 * 1000  // 5 min limit (1 min safety buffer)
};
```

---

## Tips

- For very large drives (1000+ folders), you may need to click "Resume" multiple times
- The script saves progress automatically, so you won't lose work if it times out
- Empty folder scan checks up to 5 levels of subfolders
- Deleted folders go to Trash and can be recovered within 30 days
- Use "Update List" for regular maintenance instead of full re-scans
- Schedule auto-update to keep your list current automatically

---

## Changelog

### google-drive-folder-list.gs
- **v3.0** - Added Status column with date-based tags, Update List, auto-update scheduling, Remove Empty Folders
- **v2.0** - Added Find Empty Folders, Remove Marked Folders, Action column
- **v1.3** - Added folders only vs subfolders option, date columns, removed folder IDs
- **v1.2** - Added live progress indicator with real-time status updates
- **v1.1** - Added batch processing, resume capability, progress tracking
- **v1.0** - Initial version
