# Google Apps Scripts

Google Apps Scripts to automate tasks in Google Drive, Sheets, and other Google services.

---

## Scripts

### 1. `google-drive-folder-list.gs`

Lists all folders and their immediate subfolders (one level deep) from Google Drive into a Google Sheet.

**Features:**
- ✅ Lists folders and subfolders (one level only, no sub-sub-folders)
- ✅ Outputs folder names, IDs, and URLs to a spreadsheet
- ✅ Batch processing for large folder structures
- ✅ Resume capability if script times out
- ✅ Progress tracking
- ✅ Handles inaccessible folders gracefully

**Configuration:**
```javascript
const CONFIG = {
  FOLDER_ID: '',              // Set folder ID or leave empty to prompt
  BATCH_SIZE: 50,             // Folders processed before saving
  MAX_RUNTIME_MS: 5 * 60 * 1000  // 5 min limit (1 min safety buffer)
};
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

### Running the Script

```
Folder List (menu)
├── List Folders & Subfolders   ← Start fresh scan
├── Resume Listing              ← Continue if paused
└── Reset / Start Over          ← Clear progress and restart
```

1. Click **Folder List > List Folders & Subfolders**
2. Enter your folder ID when prompted (or leave empty for entire "My Drive")
3. Wait for processing
4. If you have many folders and it pauses, click **Resume Listing**

### Output Format

| Parent Folder | Parent Folder ID | Subfolder | Subfolder ID | Subfolder URL |
|---------------|------------------|-----------|--------------|---------------|
| Projects | abc123... | Design | xyz789... | https://... |
| Projects | abc123... | Code | def456... | https://... |
| Photos | qwe456... | (no subfolders) | | |

---

## Tips

- For very large drives (1000+ folders), you may need to click "Resume" multiple times
- The script saves progress every 50 folders, so you won't lose work if it times out
- Check the browser console (F12) if you encounter issues

---

## Changelog

### google-drive-folder-list.gs
- **v1.1** - Added batch processing, resume capability, progress tracking
- **v1.0** - Initial version
