/**
 * Google Apps Script to list folders and their subfolders (one level deep) in a Google Sheet
 *
 * Handles LARGE folder structures with:
 * - Batch processing to avoid timeout
 * - Resume capability if interrupted
 * - LIVE progress indicator
 * - Option to list folders only OR include subfolders
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
  BATCH_SIZE: 10,             // Folders to process before updating sheet (lower = more frequent updates)
  MAX_RUNTIME_MS: 5 * 60 * 1000  // 5 minutes (leave 1 min buffer before 6 min limit)
};

// Status cell location (top-right corner)
const STATUS_CELL = 'G1';

/**
 * List folders only (no subfolders)
 */
function listFoldersOnly() {
  startListing_(false);
}

/**
 * List folders with their subfolders
 */
function listFoldersWithSubfolders() {
  startListing_(true);
}

/**
 * Main function - starts fresh listing
 */
function startListing_(includeSubfolders) {
  clearProgress_();
  const sheet = setupSheet_(includeSubfolders);

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

  // Save settings for resume capability
  const props = PropertiesService.getScriptProperties();
  props.setProperty('ROOT_FOLDER_ID', folderId);
  props.setProperty('INCLUDE_SUBFOLDERS', includeSubfolders.toString());

  processAllFolders_(folderId, includeSubfolders);
}

/**
 * Resume function - continues from where it left off
 */
function resumeListing() {
  const props = PropertiesService.getScriptProperties();
  const folderId = props.getProperty('ROOT_FOLDER_ID');
  const includeSubfolders = props.getProperty('INCLUDE_SUBFOLDERS') === 'true';

  if (!folderId && folderId !== '') {
    SpreadsheetApp.getUi().alert('Nothing to resume. Run "List Folders" first.');
    return;
  }

  processAllFolders_(folderId, includeSubfolders);
}

/**
 * Update the status indicator
 */
function updateStatus_(sheet, message, color) {
  const statusCell = sheet.getRange(STATUS_CELL);
  statusCell.setValue(message);
  statusCell.setFontWeight('bold');
  statusCell.setBackground(color || '#fff3cd'); // Yellow by default

  // Also update next row for extra visibility
  const timeCell = sheet.getRange('G2');
  timeCell.setValue(new Date().toLocaleTimeString());

  // Force the sheet to update visually
  SpreadsheetApp.flush();
}

/**
 * Process all folders with timeout protection
 */
function processAllFolders_(rootFolderId, includeSubfolders) {
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

    // Setup fresh sheet
    setupSheet_(includeSubfolders);
    updateStatus_(sheet, '⏳ Scanning folders...', '#fff3cd');

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
      processedCount: 0,
      includeSubfolders: includeSubfolders
    };

    updateStatus_(sheet, `📁 Found ${folderIds.length} folders to process`, '#fff3cd');
  }

  // Use saved setting if resuming
  includeSubfolders = state.includeSubfolders;

  const data = [];
  let processedThisRun = 0;
  let currentFolderName = '';

  // Determine number of columns based on mode
  const numCols = includeSubfolders ? 5 : 3;

  // Process folders
  while (state.currentIndex < state.folderIds.length) {
    // Check if we're running out of time
    if (Date.now() - startTime > CONFIG.MAX_RUNTIME_MS) {
      // Save progress and prompt to continue
      saveData_(sheet, data, numCols);
      state.processedCount += processedThisRun;
      props.setProperty('PROCESS_STATE', JSON.stringify(state));

      const percent = Math.round((state.processedCount / state.totalFolders) * 100);
      updateStatus_(sheet, `⏸️ PAUSED: ${state.processedCount}/${state.totalFolders} (${percent}%) - Click Resume`, '#f8d7da');

      ui.alert(
        'Paused - Time Limit',
        `Processed ${state.processedCount} of ${state.totalFolders} folders (${percent}%).\n\n` +
        'Click "Resume Listing" from the menu to continue.',
        ui.ButtonSet.OK
      );
      return;
    }

    const folderId = state.folderIds[state.currentIndex];

    try {
      const folder = DriveApp.getFolderById(folderId);
      const folderName = folder.getName();
      const folderUrl = folder.getUrl();
      currentFolderName = folderName;

      if (includeSubfolders) {
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
      } else {
        // Folders only - no subfolders
        data.push([folderName, folderId, folderUrl]);
      }
    } catch (e) {
      // Skip inaccessible folders
      if (includeSubfolders) {
        data.push(['(Error)', folderId, 'Could not access: ' + e.message, '', '']);
      } else {
        data.push(['(Error)', folderId, 'Could not access: ' + e.message]);
      }
    }

    state.currentIndex++;
    processedThisRun++;

    // Save in batches and update progress
    if (processedThisRun % CONFIG.BATCH_SIZE === 0) {
      saveData_(sheet, data, numCols);
      data.length = 0; // Clear array

      const totalProcessed = state.processedCount + processedThisRun;
      const percent = Math.round((totalProcessed / state.totalFolders) * 100);
      updateStatus_(sheet, `🔄 Processing: ${totalProcessed}/${state.totalFolders} (${percent}%) - "${currentFolderName}"`, '#fff3cd');
    }
  }

  // Save any remaining data
  if (data.length > 0) {
    saveData_(sheet, data, numCols);
  }

  // Done! Clean up
  clearProgress_();

  // Auto-resize columns
  for (let i = 1; i <= numCols; i++) {
    sheet.autoResizeColumn(i);
  }

  state.processedCount += processedThisRun;

  // Show completion status
  updateStatus_(sheet, `✅ DONE! Listed ${state.totalFolders} folders`, '#d4edda');
  sheet.getRange('G2').setValue('Completed: ' + new Date().toLocaleString());

  ui.alert(
    'Complete!',
    `Finished listing ${state.totalFolders} folders.`,
    ui.ButtonSet.OK
  );
}

/**
 * Setup sheet with headers
 */
function setupSheet_(includeSubfolders) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  sheet.clear();

  let headers;
  if (includeSubfolders) {
    headers = ['Parent Folder', 'Parent Folder ID', 'Subfolder', 'Subfolder ID', 'Subfolder URL'];
  } else {
    headers = ['Folder Name', 'Folder ID', 'Folder URL'];
  }

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  sheet.setFrozenRows(1);

  // Setup status area header
  sheet.getRange('G1').setValue('⏳ Starting...');
  sheet.getRange('G1').setFontWeight('bold');
  sheet.getRange('G1').setBackground('#fff3cd');
  sheet.setColumnWidth(7, 350); // Make status column wider

  return sheet;
}

/**
 * Append data to sheet
 */
function saveData_(sheet, data, numCols) {
  if (data.length === 0) return;

  const lastRow = Math.max(sheet.getLastRow(), 1);
  sheet.getRange(lastRow + 1, 1, data.length, numCols).setValues(data);
}

/**
 * Clear saved progress
 */
function clearProgress_() {
  const props = PropertiesService.getScriptProperties();
  props.deleteProperty('PROCESS_STATE');
  props.deleteProperty('ROOT_FOLDER_ID');
  props.deleteProperty('INCLUDE_SUBFOLDERS');
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
    .addItem('📁 List Folders Only', 'listFoldersOnly')
    .addItem('📂 List Folders + Subfolders', 'listFoldersWithSubfolders')
    .addSeparator()
    .addItem('▶️ Resume Listing', 'resumeListing')
    .addItem('🔄 Reset / Start Over', 'resetAndStartOver')
    .addToUi();
}
