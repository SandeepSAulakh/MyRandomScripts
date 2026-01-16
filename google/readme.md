# Google Apps Scripts

Google Apps Scripts to automate tasks in Google Drive, Sheets, and other Google services.

---

## Scripts

### 1. `google-drive-folder-list.gs`

Lists folders from Google Drive into a Google Sheet with options to find empty folders and bulk remove them.

**Features:**
- List folders only OR include subfolders (one level deep)
- Shows folder name, URL, date created, and last modified
- **Find Empty Folders** - scans and marks empty folders (checks subfolders recursively)
- **Remove Marked Folders** - bulk delete folders marked for removal
- Live progress indicator with real-time status
- Batch processing for large folder structures
- Resume capability if script times out
- Built-in usage instructions in the sheet

**Menu Options:**
```
Folder List (menu)
├── List Folders Only          ← List top-level folders
├── List Folders + Subfolders  ← Include immediate subfolders
├── Resume Listing             ← Continue if paused
├── Find Empty Folders         ← Scan and mark empty folders
├── Remove Marked Folders      ← Delete folders marked "Remove"
└── Reset / Start Over         ← Clear progress and restart
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

### Finding Empty Folders

1. First, list your folders using one of the list options
2. Click **Folder List > Find Empty Folders**
3. Empty folders will be marked in the Action column:
   - `📭 Empty` - folder has no files and no subfolders
   - `📭 Empty (subfolders empty too)` - folder and all subfolders are empty

### Removing Folders

1. In the **Action** column, type `Remove`, `Delete`, or `X` for folders you want to delete
2. Click **Folder List > Remove Marked Folders**
3. Confirm the deletion
4. Folders are moved to Trash (recoverable for 30 days)

### Output Format (Folders Only)

| Folder Name | Folder URL | Date Created | Last Modified | Action |
|-------------|------------|--------------|---------------|--------|
| Projects | https://... | 2024-01-15 | 2024-06-20 | |
| Photos | https://... | 2023-05-10 | 2024-01-05 | 📭 Empty |

### Output Format (With Subfolders)

| Parent Folder | Subfolder | Subfolder URL | Date Created | Last Modified | Action |
|---------------|-----------|---------------|--------------|---------------|--------|
| Projects | Design | https://... | 2024-01-15 | 2024-06-20 | |
| Projects | Code | https://... | 2024-02-01 | 2024-06-18 | |
| Photos | (no subfolders) | | 2023-05-10 | 2024-01-05 | |

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

---

## Changelog

### google-drive-folder-list.gs
- **v2.0** - Added Find Empty Folders, Remove Marked Folders, Action column
- **v1.3** - Added folders only vs subfolders option, date columns, removed folder IDs
- **v1.2** - Added live progress indicator with real-time status updates
- **v1.1** - Added batch processing, resume capability, progress tracking
- **v1.0** - Initial version
