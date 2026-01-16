/**
 * Google Apps Script to list folders and their subfolders (one level deep) in a Google Sheet
 *
 * Handles LARGE folder structures with:
 * - Batch processing to avoid timeout
 * - Resume capability if interrupted
 * - Progress tracking
 *
 * Usage:
 * 1. Open Google Sheets
 * 2. Go to Extensions > Apps Script
 * 3. Paste this code and save
 * 4. Run listFolders() - it will prompt for folder ID on first run
 * 5. Grant permissions when asked
 */

// Configuration
const CONFIG = {
  FOLDER_ID: '',              // Set your folder ID here, or leave empty to prompt
  BATCH_SIZE: 50,             // Folders to process before saving progress
  MAX_RUNTIME_MS: 5 * 60 * 1000  // 5 minutes (leave 1 min buffer before 6 min limit)
};

/**
 * Main function - starts fresh listing
 */
function listFolders() {
  clearProgress_();
  const sheet = setupSheet_();

  // Get folder ID
  let folderId = CONFIG.FOLDER_ID;
  if (!folderId) {
    const ui = SpreadsheetApp.getUi();
    const response = ui.prompt(
      'Enter Folder ID',
      'Paste the Google Drive folder ID (from the URL after /folders/):\n\nLeave empty to list from root "My Drive"',
      ui.ButtonSet.OK_CANCEL
    );
    if (response.getSelectedButton() === ui.Button.CANCEL) return;
    folderId = response.getResponseText().trim();
  }

  // Save folder ID for resume capability
  PropertiesService.getScriptProperties().setProperty('ROOT_FOLDER_ID', folderId);

  processAllFolders_(folderId);
}

/**
 * Resume function - continues from where it left off
 */
function resumeListing() {
  const props = PropertiesService.getScriptProperties();
  const folderId = props.getProperty('ROOT_FOLDER_ID');

  if (!folderId && folderId !== '') {
    SpreadsheetApp.getUi().alert('Nothing to resume. Run "List Folders" first.');
    return;
  }

  processAllFolders_(folderId);
}

/**
 * Process all folders with timeout protection
 */
function processAllFolders_(rootFolderId) {
  const startTime = Date.now();
  const props = PropertiesService.getScriptProperties();
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const ui = SpreadsheetApp.getUi();

  // Get or initialize state
  let state = JSON.parse(props.getProperty('PROCESS_STATE') || 'null');

  if (!state) {
    // First run - collect all folder IDs to process
    let rootFolder;
    try {
      rootFolder = rootFolderId ? DriveApp.getFolderById(rootFolderId) : DriveApp.getRootFolder();
    } catch (e) {
      ui.alert('Error: Could not access folder.\n\n' + e.message);
      return;
    }

    ui.alert('Scanning...', 'Collecting folder list. This may take a moment for large drives.', ui.ButtonSet.OK);

    // Collect all top-level folder IDs
    const folderIds = [];
    const folders = rootFolder.getFolders();
    while (folders.hasNext()) {
      folderIds.push(folders.next().getId());
    }

    state = {
      folderIds: folderIds,
      currentIndex: 0,
      totalFolders: folderIds.length,
      processedCount: 0
    };

    // Setup fresh sheet
    setupSheet_();
  }

  const data = [];
  let processedThisRun = 0;

  // Process folders
  while (state.currentIndex < state.folderIds.length) {
    // Check if we're running out of time
    if (Date.now() - startTime > CONFIG.MAX_RUNTIME_MS) {
      // Save progress and prompt to continue
      saveData_(sheet, data);
      state.processedCount += processedThisRun;
      props.setProperty('PROCESS_STATE', JSON.stringify(state));

      ui.alert(
        'Paused - Time Limit',
        `Processed ${state.processedCount} of ${state.totalFolders} folders.\n\n` +
        'Click "Resume Listing" from the menu to continue.',
        ui.ButtonSet.OK
      );
      return;
    }

    const folderId = state.folderIds[state.currentIndex];

    try {
      const folder = DriveApp.getFolderById(folderId);
      const folderName = folder.getName();

      // Get subfolders (one level only)
      const subfolders = folder.getFolders();

      if (!subfolders.hasNext()) {
        data.push([folderName, folderId, '(no subfolders)', '', '']);
      } else {
        while (subfolders.hasNext()) {
          const sub = subfolders.next();
          data.push([
            folderName,
            folderId,
            sub.getName(),
            sub.getId(),
            sub.getUrl()
          ]);
        }
      }
    } catch (e) {
      // Skip inaccessible folders
      data.push(['(Error)', folderId, 'Could not access: ' + e.message, '', '']);
    }

    state.currentIndex++;
    processedThisRun++;

    // Save in batches to prevent data loss
    if (data.length >= CONFIG.BATCH_SIZE) {
      saveData_(sheet, data);
      data.length = 0; // Clear array
    }
  }

  // Save any remaining data
  if (data.length > 0) {
    saveData_(sheet, data);
  }

  // Done! Clean up
  clearProgress_();

  // Auto-resize columns
  for (let i = 1; i <= 5; i++) {
    sheet.autoResizeColumn(i);
  }

  state.processedCount += processedThisRun;
  ui.alert(
    'Complete!',
    `Finished listing ${state.totalFolders} folders.`,
    ui.ButtonSet.OK
  );
}

/**
 * Setup sheet with headers
 */
function setupSheet_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  sheet.clear();

  const headers = ['Parent Folder', 'Parent Folder ID', 'Subfolder', 'Subfolder ID', 'Subfolder URL'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  sheet.setFrozenRows(1);

  return sheet;
}

/**
 * Append data to sheet
 */
function saveData_(sheet, data) {
  if (data.length === 0) return;

  const lastRow = Math.max(sheet.getLastRow(), 1);
  sheet.getRange(lastRow + 1, 1, data.length, 5).setValues(data);
}

/**
 * Clear saved progress
 */
function clearProgress_() {
  const props = PropertiesService.getScriptProperties();
  props.deleteProperty('PROCESS_STATE');
  props.deleteProperty('ROOT_FOLDER_ID');
}

/**
 * Reset everything if something goes wrong
 */
function resetAndStartOver() {
  clearProgress_();
  SpreadsheetApp.getUi().alert('Progress cleared. You can now start fresh with "List Folders".');
}

/**
 * Add custom menu when spreadsheet opens
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Folder List')
    .addItem('List Folders & Subfolders', 'listFolders')
    .addItem('Resume Listing', 'resumeListing')
    .addSeparator()
    .addItem('Reset / Start Over', 'resetAndStartOver')
    .addToUi();
}
