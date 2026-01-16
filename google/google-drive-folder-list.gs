/**
 * Google Apps Script to list folders and their subfolders (one level deep) in a Google Sheet
 *
 * Handles LARGE folder structures with:
 * - Batch processing to avoid timeout
 * - Resume capability if interrupted
 * - LIVE progress indicator
 * - Option to list folders only OR include subfolders
 * - Remove folders marked with "Remove" in Action column
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
const STATUS_CELL = 'H1';

// Action column index (F = 6)
const ACTION_COL = 6;

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
  const timeCell = sheet.getRange('H2');
  timeCell.setValue(new Date().toLocaleTimeString());

  // Force the sheet to update visually
  SpreadsheetApp.flush();
}

/**
 * Format date for display
 */
function formatDate_(date) {
  if (!date) return '';
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
}

/**
 * Extract folder ID from Google Drive URL
 */
function extractFolderId_(url) {
  if (!url) return null;
  const match = url.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

/**
 * Remove folders marked with "Remove" in Action column
 */
function removeMarkedFolders() {
  const ui = SpreadsheetApp.getUi();
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

  // Get all data
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    ui.alert('No data found', 'Please run a folder listing first.', ui.ButtonSet.OK);
    return;
  }

  // Find URL column (B for folders only, C for subfolders mode)
  const headers = sheet.getRange(1, 1, 1, 6).getValues()[0];
  const urlColIndex = headers.indexOf('Folder URL') !== -1 ? 2 : 3; // B=2 or C=3

  // Get action column and URL column data
  const dataRange = sheet.getRange(2, 1, lastRow - 1, ACTION_COL);
  const data = dataRange.getValues();

  // Find rows marked for removal
  const toRemove = [];
  for (let i = 0; i < data.length; i++) {
    const action = String(data[i][ACTION_COL - 1]).toLowerCase().trim();
    if (action === 'remove' || action === 'delete' || action === 'x') {
      const url = data[i][urlColIndex - 1];
      const folderId = extractFolderId_(url);
      const folderName = data[i][0]; // Column A
      if (folderId) {
        toRemove.push({
          row: i + 2, // Sheet row (1-indexed, after header)
          folderId: folderId,
          folderName: folderName,
          url: url
        });
      }
    }
  }

  if (toRemove.length === 0) {
    ui.alert('No folders to remove', 'Type "Remove" in column F (Action) for folders you want to delete, then run this again.', ui.ButtonSet.OK);
    return;
  }

  // Confirm with user
  const confirm = ui.alert(
    '⚠️ Confirm Removal',
    `You are about to move ${toRemove.length} folder(s) to TRASH:\n\n` +
    toRemove.slice(0, 10).map(f => `• ${f.folderName}`).join('\n') +
    (toRemove.length > 10 ? `\n... and ${toRemove.length - 10} more` : '') +
    '\n\nFolders will be moved to Trash (recoverable for 30 days).\n\nContinue?',
    ui.ButtonSet.YES_NO
  );

  if (confirm !== ui.Button.YES) {
    ui.alert('Cancelled', 'No folders were removed.', ui.ButtonSet.OK);
    return;
  }

  // Process removals
  updateStatus_(sheet, `🗑️ Removing 0/${toRemove.length} folders...`, '#fff3cd');

  let removed = 0;
  let errors = 0;
  const errorMessages = [];

  for (let i = 0; i < toRemove.length; i++) {
    const item = toRemove[i];

    try {
      const folder = DriveApp.getFolderById(item.folderId);
      folder.setTrashed(true);

      // Update the row to show it was removed
      sheet.getRange(item.row, ACTION_COL).setValue('✓ Removed');
      sheet.getRange(item.row, ACTION_COL).setBackground('#d4edda');

      removed++;
    } catch (e) {
      // Mark as error
      sheet.getRange(item.row, ACTION_COL).setValue('⚠️ Error');
      sheet.getRange(item.row, ACTION_COL).setBackground('#f8d7da');
      errors++;
      errorMessages.push(`${item.folderName}: ${e.message}`);
    }

    // Update progress every 5 folders
    if ((i + 1) % 5 === 0 || i === toRemove.length - 1) {
      updateStatus_(sheet, `🗑️ Removing ${i + 1}/${toRemove.length} folders...`, '#fff3cd');
    }
  }

  // Show completion
  updateStatus_(sheet, `✅ Removed ${removed} folders (${errors} errors)`, removed > 0 ? '#d4edda' : '#f8d7da');

  let message = `Successfully moved ${removed} folder(s) to Trash.`;
  if (errors > 0) {
    message += `\n\n${errors} folder(s) could not be removed:\n` + errorMessages.slice(0, 5).join('\n');
    if (errorMessages.length > 5) {
      message += `\n... and ${errorMessages.length - 5} more errors`;
    }
  }

  ui.alert('Removal Complete', message, ui.ButtonSet.OK);
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

    // Show scanning status
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

  // Determine number of columns based on mode (now +1 for Action column)
  // Folders only: Name, URL, Created, Modified, Action (5 cols)
  // With subfolders: Parent Folder, Subfolder, Subfolder URL, Created, Modified, Action (6 cols)
  const numCols = includeSubfolders ? 6 : 5;

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
      const folderCreated = formatDate_(folder.getDateCreated());
      const folderModified = formatDate_(folder.getLastUpdated());
      currentFolderName = folderName;

      if (includeSubfolders) {
        // Get subfolders (one level only)
        const subfolders = folder.getFolders();

        if (!subfolders.hasNext()) {
          data.push([folderName, '(no subfolders)', '', folderCreated, folderModified, '']);
        } else {
          while (subfolders.hasNext()) {
            const sub = subfolders.next();
            data.push([
              folderName,
              sub.getName(),
              sub.getUrl(),
              formatDate_(sub.getDateCreated()),
              formatDate_(sub.getLastUpdated()),
              '' // Action column
            ]);
          }
        }
      } else {
        // Folders only - no subfolders
        data.push([folderName, folderUrl, folderCreated, folderModified, '']);
      }
    } catch (e) {
      // Skip inaccessible folders
      if (includeSubfolders) {
        data.push(['(Error)', 'Could not access: ' + e.message, '', '', '', '']);
      } else {
        data.push(['(Error)', 'Could not access: ' + e.message, '', '', '']);
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
  sheet.getRange('H2').setValue('Completed: ' + new Date().toLocaleString());

  ui.alert(
    'Complete!',
    `Finished listing ${state.totalFolders} folders.\n\nTo remove folders: Type "Remove" in the Action column (F), then click "Remove Marked Folders" from the menu.`,
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
    headers = ['Parent Folder', 'Subfolder', 'Subfolder URL', 'Date Created', 'Last Modified', 'Action'];
  } else {
    headers = ['Folder Name', 'Folder URL', 'Date Created', 'Last Modified', 'Action'];
  }

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  sheet.setFrozenRows(1);

  // Style the Action column header
  const actionHeaderCell = sheet.getRange(1, headers.length);
  actionHeaderCell.setBackground('#ffe6e6');
  actionHeaderCell.setNote('Type "Remove" to mark folders for deletion');

  // Setup status area header
  sheet.getRange('H1').setValue('⏳ Starting...');
  sheet.getRange('H1').setFontWeight('bold');
  sheet.getRange('H1').setBackground('#fff3cd');
  sheet.setColumnWidth(8, 350); // Make status column wider

  return sheet;
}

/**
 * Append data to sheet
 */
function saveData_(sheet, data, numCols) {
  if (data.length === 0) return;

  // Get last row with data in column A (ignore status column H)
  const colAValues = sheet.getRange('A:A').getValues();
  let lastRow = 1; // Start after header
  for (let i = colAValues.length - 1; i >= 0; i--) {
    if (colAValues[i][0] !== '') {
      lastRow = i + 1;
      break;
    }
  }

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
    .addSeparator()
    .addItem('🗑️ Remove Marked Folders', 'removeMarkedFolders')
    .addToUi();
}
