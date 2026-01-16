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

// Status cell location (column G, after Action column)
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
 * Format date for display
 */
function formatDate_(date) {
  if (!date) return '';
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
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

  // Determine number of columns based on mode
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
              ''  // Action column
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
    headers = ['Parent Folder', 'Subfolder', 'Subfolder URL', 'Date Created', 'Last Modified', 'Action'];
  } else {
    headers = ['Folder Name', 'Folder URL', 'Date Created', 'Last Modified', 'Action'];
  }

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  sheet.setFrozenRows(1);

  // Setup status area header (column G, after Action)
  const statusCol = 7; // Fixed column G for status
  sheet.getRange(1, statusCol).setValue('⏳ Starting...');
  sheet.getRange(1, statusCol).setFontWeight('bold');
  sheet.getRange(1, statusCol).setBackground('#fff3cd');
  sheet.setColumnWidth(statusCol, 300);

  // Add usage instructions below status
  const instructions = [
    ['📋 HOW TO FIND EMPTY FOLDERS:'],
    ['1. Review the folder list'],
    ['2. Menu → Find Empty Folders'],
    ['3. Empty folders get marked'],
    ['   in the Action column'],
    [''],
    ['📋 HOW TO MARK & REMOVE:'],
    ['1. Type "Remove" in Action column'],
    ['   (or "Delete" or "X")'],
    ['2. Menu → Remove Marked Folders'],
    ['3. Confirm deletion'],
    ['4. Folders move to Trash'],
    ['   (recoverable 30 days)'],
    [''],
    ['📌 ACTION COLUMN VALUES:'],
    ['"Remove"/"Delete"/"X" = delete'],
    ['"📭 Empty" = no files found']
  ];
  sheet.getRange(3, statusCol, instructions.length, 1).setValues(instructions);
  sheet.getRange(3, statusCol, 1, 1).setFontWeight('bold');  // "HOW TO FIND EMPTY"
  sheet.getRange(9, statusCol, 1, 1).setFontWeight('bold');  // "HOW TO MARK & REMOVE"
  sheet.getRange(17, statusCol, 1, 1).setFontWeight('bold'); // "ACTION COLUMN VALUES"

  return sheet;
}

/**
 * Append data to sheet
 */
function saveData_(sheet, data, numCols) {
  if (data.length === 0) return;

  // Get last row with data in column A (ignore status column G)
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
 * Check if a folder is empty (recursively checks subfolders too)
 * Returns: 'empty' | 'has_files' | 'empty_tree' (has subfolders but all are empty)
 */
function checkFolderEmpty_(folder, depth = 0) {
  // Limit recursion depth to avoid timeout
  const MAX_DEPTH = 5;

  const hasFiles = folder.getFiles().hasNext();
  if (hasFiles) {
    return 'has_files';
  }

  const subfolders = folder.getFolders();
  if (!subfolders.hasNext()) {
    // No files and no subfolders = completely empty
    return 'empty';
  }

  // Has subfolders - check if they're all empty
  if (depth >= MAX_DEPTH) {
    // Too deep, just report as having subfolders
    return 'has_subfolders';
  }

  while (subfolders.hasNext()) {
    const sub = subfolders.next();
    const subStatus = checkFolderEmpty_(sub, depth + 1);
    if (subStatus === 'has_files') {
      return 'has_files';
    }
  }

  // All subfolders are empty
  return 'empty_tree';
}

/**
 * Scan folders and mark empty ones (no files) in the Action column
 */
function markEmptyFolders() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const ui = SpreadsheetApp.getUi();

  // Find columns dynamically from headers
  const headers = sheet.getRange(1, 1, 1, 10).getValues()[0];

  const actionCol = headers.indexOf('Action') + 1;
  if (actionCol === 0) {
    ui.alert('Error', 'Could not find Action column. Please re-run the folder listing.', ui.ButtonSet.OK);
    return;
  }

  // Find URL column (either "Folder URL" or "Subfolder URL")
  let urlCol = headers.indexOf('Folder URL') + 1;
  if (urlCol === 0) {
    urlCol = headers.indexOf('Subfolder URL') + 1;
  }
  if (urlCol === 0) {
    ui.alert('Error', 'Could not find URL column. Please re-run the folder listing.', ui.ButtonSet.OK);
    return;
  }

  // Get all data (skip header row)
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    ui.alert('No data', 'No folders to scan.', ui.ButtonSet.OK);
    return;
  }

  const dataRange = sheet.getRange(2, 1, lastRow - 1, actionCol);
  const data = dataRange.getValues();

  // Confirm with user
  const confirmResponse = ui.alert(
    'Scan for Empty Folders',
    `This will scan ${data.length} folder(s) and check if they're empty.\n\n` +
    '• Checks for files in the folder\n' +
    '• Also checks subfolders recursively\n' +
    '• May take a while for large lists\n\nContinue?',
    ui.ButtonSet.YES_NO
  );

  if (confirmResponse !== ui.Button.YES) {
    return;
  }

  updateStatus_(sheet, `🔍 Scanning ${data.length} folders (checking subfolders too)...`, '#fff3cd');

  let scanned = 0;
  let emptyCount = 0;
  let emptyTreeCount = 0;
  let errorCount = 0;

  for (let i = 0; i < data.length; i++) {
    const url = data[i][urlCol - 1];
    const currentAction = (data[i][actionCol - 1] || '').toString().trim();

    // Skip rows that are already marked as removed or have errors
    if (currentAction.includes('Removed') || currentAction.includes('Error') || !url) {
      scanned++;
      continue;
    }

    // Skip rows without valid Drive URLs
    if (!url.includes('drive.google.com')) {
      scanned++;
      continue;
    }

    // Extract folder ID from URL
    const match = url.match(/folders\/([a-zA-Z0-9_-]+)/);
    if (!match) {
      scanned++;
      continue;
    }

    try {
      const folder = DriveApp.getFolderById(match[1]);
      const status = checkFolderEmpty_(folder);

      if (status === 'empty') {
        sheet.getRange(i + 2, actionCol).setValue('📭 Empty');
        emptyCount++;
      } else if (status === 'empty_tree') {
        sheet.getRange(i + 2, actionCol).setValue('📭 Empty (subfolders empty too)');
        emptyTreeCount++;
      }
      // If has files, leave Action column as is

    } catch (e) {
      errorCount++;
    }

    scanned++;

    // Update progress every 10 folders
    if (scanned % 10 === 0) {
      const totalEmpty = emptyCount + emptyTreeCount;
      updateStatus_(sheet, `🔍 Scanned ${scanned}/${data.length} (${totalEmpty} empty)...`, '#fff3cd');
    }
  }

  // Show completion
  const totalEmpty = emptyCount + emptyTreeCount;
  if (errorCount === 0) {
    updateStatus_(sheet, `✅ Scan complete: ${totalEmpty} empty folder(s) found`, '#d4edda');
    ui.alert('Scan Complete',
      `Scanned ${scanned} folder(s).\n\n` +
      `📭 Completely empty: ${emptyCount}\n` +
      `📭 Empty (with empty subfolders): ${emptyTreeCount}\n\n` +
      'Empty folders are marked in the Action column.\n' +
      'Change the marker to "Remove" to delete them.',
      ui.ButtonSet.OK);
  } else {
    updateStatus_(sheet, `✅ Scan done: ${totalEmpty} empty, ${errorCount} errors`, '#fff3cd');
    ui.alert('Scan Complete',
      `Scanned ${scanned} folder(s).\n\n` +
      `📭 Completely empty: ${emptyCount}\n` +
      `📭 Empty (with empty subfolders): ${emptyTreeCount}\n` +
      `⚠️ Errors (couldn't access): ${errorCount}\n\n` +
      'Empty folders are marked in the Action column.',
      ui.ButtonSet.OK);
  }
}

/**
 * Remove folders marked with "Remove", "Delete", or "X" in the Action column
 * Moves folders to Trash (recoverable for 30 days)
 */
function removeMarkedFolders() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const ui = SpreadsheetApp.getUi();

  // Determine which column has the URL based on headers
  const headers = sheet.getRange(1, 1, 1, 6).getValues()[0];
  let urlCol, actionCol;

  if (headers[0] === 'Folder Name') {
    // Folders only mode: Folder Name, Folder URL, Date Created, Last Modified, Action
    urlCol = 2;  // Column B
    actionCol = 5; // Column E (but we added Action as col F, so it's 5 for 0-indexed headers)
  } else {
    // Subfolders mode: Parent Folder, Subfolder, Subfolder URL, Date Created, Last Modified, Action
    urlCol = 3;  // Column C
    actionCol = 6; // Column F
  }

  // Actually, let's find Action column dynamically
  actionCol = headers.indexOf('Action') + 1;
  if (actionCol === 0) {
    ui.alert('Error', 'Could not find Action column. Please re-run the folder listing.', ui.ButtonSet.OK);
    return;
  }

  // Find URL column dynamically too
  urlCol = headers.indexOf('Folder URL') + 1;
  if (urlCol === 0) {
    urlCol = headers.indexOf('Subfolder URL') + 1;
  }
  if (urlCol === 0) {
    ui.alert('Error', 'Could not find URL column. Please re-run the folder listing.', ui.ButtonSet.OK);
    return;
  }

  // Get all data (skip header row)
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    ui.alert('No data', 'No folders to process.', ui.ButtonSet.OK);
    return;
  }

  const dataRange = sheet.getRange(2, 1, lastRow - 1, actionCol);
  const data = dataRange.getValues();

  // Find rows marked for removal
  const foldersToRemove = [];
  const rowsToMark = [];

  for (let i = 0; i < data.length; i++) {
    const action = (data[i][actionCol - 1] || '').toString().trim().toLowerCase();
    const url = data[i][urlCol - 1];

    if (['remove', 'delete', 'x'].includes(action) && url && url.includes('drive.google.com')) {
      // Extract folder ID from URL
      const match = url.match(/folders\/([a-zA-Z0-9_-]+)/);
      if (match) {
        foldersToRemove.push({
          row: i + 2, // Actual row number (1-indexed, after header)
          name: data[i][0],
          folderId: match[1]
        });
        rowsToMark.push(i + 2);
      }
    }
  }

  if (foldersToRemove.length === 0) {
    ui.alert('No folders marked',
      'No folders found with "Remove", "Delete", or "X" in the Action column.\n\n' +
      'To remove folders:\n' +
      '1. Type "Remove" (or "Delete" or "X") in the Action column for folders you want to delete\n' +
      '2. Run this function again',
      ui.ButtonSet.OK);
    return;
  }

  // Confirm with user
  const confirmResponse = ui.alert(
    'Confirm Removal',
    `Found ${foldersToRemove.length} folder(s) marked for removal:\n\n` +
    foldersToRemove.slice(0, 10).map(f => `• ${f.name}`).join('\n') +
    (foldersToRemove.length > 10 ? `\n... and ${foldersToRemove.length - 10} more` : '') +
    '\n\nThese folders will be moved to Trash (recoverable for 30 days).\n\nContinue?',
    ui.ButtonSet.YES_NO
  );

  if (confirmResponse !== ui.Button.YES) {
    return;
  }

  // Update status
  updateStatus_(sheet, `🗑️ Removing ${foldersToRemove.length} folders...`, '#fff3cd');

  let removed = 0;
  let errors = 0;
  const errorMessages = [];

  for (const folder of foldersToRemove) {
    try {
      const driveFolder = DriveApp.getFolderById(folder.folderId);
      driveFolder.setTrashed(true);

      // Mark the row as removed
      sheet.getRange(folder.row, actionCol).setValue('✓ Removed');
      sheet.getRange(folder.row, 1, 1, actionCol).setBackground('#f0f0f0'); // Gray out row

      removed++;

      // Update progress every 5 folders
      if (removed % 5 === 0) {
        updateStatus_(sheet, `🗑️ Removed ${removed}/${foldersToRemove.length} folders...`, '#fff3cd');
      }
    } catch (e) {
      errors++;
      errorMessages.push(`${folder.name}: ${e.message}`);
      sheet.getRange(folder.row, actionCol).setValue('⚠️ Error');
    }
  }

  // Show completion status
  if (errors === 0) {
    updateStatus_(sheet, `✅ Removed ${removed} folder(s) to Trash`, '#d4edda');
    ui.alert('Complete!', `Successfully moved ${removed} folder(s) to Trash.\n\nYou can recover them from Trash within 30 days.`, ui.ButtonSet.OK);
  } else {
    updateStatus_(sheet, `⚠️ Removed ${removed}, ${errors} error(s)`, '#f8d7da');
    ui.alert('Completed with errors',
      `Removed: ${removed}\nErrors: ${errors}\n\n` +
      errorMessages.slice(0, 5).join('\n') +
      (errorMessages.length > 5 ? `\n... and ${errorMessages.length - 5} more errors` : ''),
      ui.ButtonSet.OK);
  }
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
    .addItem('🔍 Find Empty Folders', 'markEmptyFolders')
    .addItem('🗑️ Remove Marked Folders', 'removeMarkedFolders')
    .addSeparator()
    .addItem('🔄 Reset / Start Over', 'resetAndStartOver')
    .addToUi();
}
