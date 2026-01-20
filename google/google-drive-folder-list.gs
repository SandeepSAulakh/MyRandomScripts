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
 * Format date for display (date only, no time)
 */
function formatDate_(date) {
  if (!date) return '';
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

/**
 * Get upload status tag based on date
 * Returns: { tag: string, color: string } or null if older than 30 days
 */
function getUploadStatus_(date) {
  if (!date) return null;

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays <= 7) {
    return { tag: 'New Upload', color: '#c8e6c9' };  // Light green (0-7 days)
  } else if (diffDays <= 30) {
    return { tag: 'Recent Upload', color: '#fff59d' };  // Brighter yellow (8-30 days)
  }
  return null;
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
  const statusData = [];  // Track status colors for later
  let processedThisRun = 0;
  let currentFolderName = '';

  // Determine number of columns based on mode
  // Folders only: Status, Name, URL, Date Added, Action (5 cols)
  // With subfolders: Status, Parent Folder, Subfolder, Subfolder URL, Date Added, Action (6 cols)
  const numCols = includeSubfolders ? 6 : 5;

  // Process folders
  while (state.currentIndex < state.folderIds.length) {
    // Check if we're running out of time
    if (Date.now() - startTime > CONFIG.MAX_RUNTIME_MS) {
      // Save progress and prompt to continue
      saveData_(sheet, data, numCols, statusData);
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
      const folderDate = folder.getLastUpdated();
      const folderDateFormatted = formatDate_(folderDate);
      const folderStatus = getUploadStatus_(folderDate);
      currentFolderName = folderName;

      if (includeSubfolders) {
        // Get subfolders (one level only)
        const subfolders = folder.getFolders();

        if (!subfolders.hasNext()) {
          const statusTag = folderStatus ? folderStatus.tag : '';
          data.push([statusTag, folderName, '(no subfolders)', '', folderDateFormatted, '']);
          statusData.push(folderStatus);
        } else {
          while (subfolders.hasNext()) {
            const sub = subfolders.next();
            const subDate = sub.getLastUpdated();
            const subStatus = getUploadStatus_(subDate);
            data.push([
              subStatus ? subStatus.tag : '',
              folderName,
              sub.getName(),
              sub.getUrl(),
              formatDate_(subDate),
              ''  // Action column
            ]);
            statusData.push(subStatus);
          }
        }
      } else {
        // Folders only - no subfolders
        const statusTag = folderStatus ? folderStatus.tag : '';
        data.push([statusTag, folderName, folderUrl, folderDateFormatted, '']);
        statusData.push(folderStatus);
      }
    } catch (e) {
      // Skip inaccessible folders
      if (includeSubfolders) {
        data.push(['', '(Error)', 'Could not access: ' + e.message, '', '', '']);
        statusData.push(null);
      } else {
        data.push(['', '(Error)', 'Could not access: ' + e.message, '', '']);
        statusData.push(null);
      }
    }

    state.currentIndex++;
    processedThisRun++;

    // Save in batches and update progress
    if (processedThisRun % CONFIG.BATCH_SIZE === 0) {
      saveData_(sheet, data, numCols, statusData);
      data.length = 0; // Clear array
      statusData.length = 0; // Clear status array

      const totalProcessed = state.processedCount + processedThisRun;
      const percent = Math.round((totalProcessed / state.totalFolders) * 100);
      updateStatus_(sheet, `🔄 Processing: ${totalProcessed}/${state.totalFolders} (${percent}%) - "${currentFolderName}"`, '#fff3cd');
    }
  }

  // Save any remaining data
  if (data.length > 0) {
    saveData_(sheet, data, numCols, statusData);
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
    headers = ['Status', 'Parent Folder', 'Subfolder', 'Subfolder URL', 'Date Added', 'Action'];
  } else {
    headers = ['Status', 'Folder Name', 'Folder URL', 'Date Added', 'Action'];
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
    ['📌 STATUS COLUMN:'],
    ['"New Upload" = last 7 days'],
    ['"Recent Upload" = last 30 days'],
    [''],
    ['📋 HOW TO FIND EMPTY FOLDERS:'],
    ['1. Menu → Find Empty Folders'],
    ['2. Empty folders get marked'],
    [''],
    ['📋 HOW TO REMOVE:'],
    ['• Menu → Remove Empty Folders'],
    ['• Or type "Remove" in Action'],
    ['   then → Remove Marked Folders'],
    [''],
    ['📌 ACTION COLUMN VALUES:'],
    ['"Remove"/"Delete"/"X" = delete'],
    ['"📭 Empty" = no files found']
  ];
  sheet.getRange(3, statusCol, instructions.length, 1).setValues(instructions);
  sheet.getRange(3, statusCol, 1, 1).setFontWeight('bold');  // "STATUS COLUMN"
  sheet.getRange(7, statusCol, 1, 1).setFontWeight('bold');  // "HOW TO FIND EMPTY"
  sheet.getRange(10, statusCol, 1, 1).setFontWeight('bold'); // "HOW TO REMOVE"
  sheet.getRange(15, statusCol, 1, 1).setFontWeight('bold'); // "ACTION COLUMN VALUES"

  return sheet;
}

/**
 * Append data to sheet and apply status colors
 */
function saveData_(sheet, data, numCols, statusData) {
  if (data.length === 0) return;

  // Get last row with data in column B (Folder Name) - avoids counting instruction text in column G
  const colBValues = sheet.getRange('B:B').getValues();
  let lastRow = 1; // Start after header
  for (let i = colBValues.length - 1; i >= 0; i--) {
    if (colBValues[i][0] !== '') {
      lastRow = i + 1;
      break;
    }
  }

  const startRow = lastRow + 1;
  sheet.getRange(startRow, 1, data.length, numCols).setValues(data);

  // Apply status colors to column A (Status column)
  if (statusData && statusData.length > 0) {
    for (let i = 0; i < statusData.length; i++) {
      if (statusData[i] && statusData[i].color) {
        sheet.getRange(startRow + i, 1).setBackground(statusData[i].color);
      }
    }
  }
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
 * Remove all folders marked as empty (📭 Empty) in the Action column
 * Moves folders to Trash (recoverable for 30 days)
 */
function removeEmptyFolders() {
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
    ui.alert('No data', 'No folders to process.', ui.ButtonSet.OK);
    return;
  }

  const dataRange = sheet.getRange(2, 1, lastRow - 1, actionCol);
  const data = dataRange.getValues();

  // Find rows marked as empty
  const foldersToRemove = [];

  for (let i = 0; i < data.length; i++) {
    const action = (data[i][actionCol - 1] || '').toString().trim();
    const url = data[i][urlCol - 1];

    // Check for empty folder markers
    if (action.includes('📭 Empty') && url && url.includes('drive.google.com')) {
      // Extract folder ID from URL
      const match = url.match(/folders\/([a-zA-Z0-9_-]+)/);
      if (match) {
        foldersToRemove.push({
          row: i + 2,
          name: data[i][0],
          folderId: match[1]
        });
      }
    }
  }

  if (foldersToRemove.length === 0) {
    ui.alert('No empty folders found',
      'No folders marked as empty (📭 Empty) in the Action column.\n\n' +
      'Run "Find Empty Folders" first to scan and mark empty folders.',
      ui.ButtonSet.OK);
    return;
  }

  // Confirm with user
  const confirmResponse = ui.alert(
    'Remove Empty Folders',
    `Found ${foldersToRemove.length} empty folder(s) to remove:\n\n` +
    foldersToRemove.slice(0, 10).map(f => `• ${f.name}`).join('\n') +
    (foldersToRemove.length > 10 ? `\n... and ${foldersToRemove.length - 10} more` : '') +
    '\n\nThese folders will be moved to Trash (recoverable for 30 days).\n\nContinue?',
    ui.ButtonSet.YES_NO
  );

  if (confirmResponse !== ui.Button.YES) {
    return;
  }

  // Update status
  updateStatus_(sheet, `🗑️ Removing ${foldersToRemove.length} empty folders...`, '#fff3cd');

  let removed = 0;
  let errors = 0;
  const errorMessages = [];

  for (const folder of foldersToRemove) {
    try {
      const driveFolder = DriveApp.getFolderById(folder.folderId);
      driveFolder.setTrashed(true);

      // Mark the row as removed
      sheet.getRange(folder.row, actionCol).setValue('✓ Removed');
      sheet.getRange(folder.row, 1, 1, actionCol).setBackground('#f0f0f0');

      removed++;

      if (removed % 5 === 0) {
        updateStatus_(sheet, `🗑️ Removed ${removed}/${foldersToRemove.length} empty folders...`, '#fff3cd');
      }
    } catch (e) {
      errors++;
      errorMessages.push(`${folder.name}: ${e.message}`);
      sheet.getRange(folder.row, actionCol).setValue('⚠️ Error');
    }
  }

  // Show completion status
  if (errors === 0) {
    updateStatus_(sheet, `✅ Removed ${removed} empty folder(s) to Trash`, '#d4edda');
    ui.alert('Complete!', `Successfully moved ${removed} empty folder(s) to Trash.\n\nYou can recover them from Trash within 30 days.`, ui.ButtonSet.OK);
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
 * Update list - only add new folders that aren't already in the sheet
 */
function updateFolderList() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const ui = SpreadsheetApp.getUi();
  const props = PropertiesService.getScriptProperties();

  // Check if we have a saved folder ID
  let rootFolderId = props.getProperty('ROOT_FOLDER_ID');
  if (!rootFolderId && rootFolderId !== '') {
    ui.alert('No folder configured',
      'Please run "List Folders" first to set up the folder to monitor.\n\n' +
      'After that, you can use "Update List" to add only new folders.',
      ui.ButtonSet.OK);
    return;
  }

  // Determine mode from headers
  const headers = sheet.getRange(1, 1, 1, 10).getValues()[0];
  const includeSubfolders = headers.includes('Subfolder');

  // Get existing folder URLs from sheet to avoid duplicates
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    ui.alert('No data', 'Sheet is empty. Please run "List Folders" first.', ui.ButtonSet.OK);
    return;
  }

  // Find URL column
  let urlCol = headers.indexOf('Folder URL') + 1;
  if (urlCol === 0) {
    urlCol = headers.indexOf('Subfolder URL') + 1;
  }
  if (urlCol === 0) {
    ui.alert('Error', 'Could not find URL column.', ui.ButtonSet.OK);
    return;
  }

  // Get all existing URLs
  const existingUrls = new Set();
  const urlData = sheet.getRange(2, urlCol, lastRow - 1, 1).getValues();
  for (const row of urlData) {
    if (row[0]) existingUrls.add(row[0]);
  }

  updateStatus_(sheet, '🔄 Checking for new folders...', '#fff3cd');

  // Get root folder
  let rootFolder;
  try {
    rootFolder = rootFolderId ? DriveApp.getFolderById(rootFolderId) : DriveApp.getRootFolder();
  } catch (e) {
    ui.alert('Error', 'Could not access folder: ' + e.message, ui.ButtonSet.OK);
    return;
  }

  const numCols = includeSubfolders ? 6 : 5;
  const data = [];
  const statusData = [];
  let newCount = 0;
  let scanned = 0;

  // Scan folders
  const folders = rootFolder.getFolders();
  while (folders.hasNext()) {
    const folder = folders.next();
    scanned++;

    if (includeSubfolders) {
      const subfolders = folder.getFolders();
      if (!subfolders.hasNext()) {
        // Check if parent folder URL already exists
        if (!existingUrls.has(folder.getUrl())) {
          // This case doesn't apply well for subfolders mode
        }
      } else {
        while (subfolders.hasNext()) {
          const sub = subfolders.next();
          const subUrl = sub.getUrl();

          if (!existingUrls.has(subUrl)) {
            const subDate = sub.getLastUpdated();
            const subStatus = getUploadStatus_(subDate);
            data.push([
              subStatus ? subStatus.tag : '',
              folder.getName(),
              sub.getName(),
              subUrl,
              formatDate_(subDate),
              ''
            ]);
            statusData.push(subStatus);
            newCount++;
          }
        }
      }
    } else {
      const folderUrl = folder.getUrl();
      if (!existingUrls.has(folderUrl)) {
        const folderDate = folder.getLastUpdated();
        const folderStatus = getUploadStatus_(folderDate);
        data.push([
          folderStatus ? folderStatus.tag : '',
          folder.getName(),
          folderUrl,
          formatDate_(folderDate),
          ''
        ]);
        statusData.push(folderStatus);
        newCount++;
      }
    }

    if (scanned % 20 === 0) {
      updateStatus_(sheet, `🔄 Scanned ${scanned} folders, found ${newCount} new...`, '#fff3cd');
    }
  }

  // Save new folders
  if (data.length > 0) {
    saveData_(sheet, data, numCols, statusData);
  }

  // Update status
  if (newCount === 0) {
    updateStatus_(sheet, `✅ No new folders found (scanned ${scanned})`, '#d4edda');
    ui.alert('Up to date', `Scanned ${scanned} folders.\n\nNo new folders found.`, ui.ButtonSet.OK);
  } else {
    updateStatus_(sheet, `✅ Added ${newCount} new folder(s)`, '#d4edda');
    ui.alert('Update complete', `Scanned ${scanned} folders.\n\nAdded ${newCount} new folder(s) to the list.`, ui.ButtonSet.OK);
  }
}

/**
 * Auto-update function for scheduled trigger (runs silently)
 */
function autoUpdateFolderList() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const props = PropertiesService.getScriptProperties();

  let rootFolderId = props.getProperty('ROOT_FOLDER_ID');
  if (!rootFolderId && rootFolderId !== '') {
    return; // No folder configured, skip
  }

  // Determine mode from headers
  const headers = sheet.getRange(1, 1, 1, 10).getValues()[0];
  const includeSubfolders = headers.includes('Subfolder');

  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return;

  // Find URL column
  let urlCol = headers.indexOf('Folder URL') + 1;
  if (urlCol === 0) urlCol = headers.indexOf('Subfolder URL') + 1;
  if (urlCol === 0) return;

  // Get existing URLs
  const existingUrls = new Set();
  const urlData = sheet.getRange(2, urlCol, lastRow - 1, 1).getValues();
  for (const row of urlData) {
    if (row[0]) existingUrls.add(row[0]);
  }

  let rootFolder;
  try {
    rootFolder = rootFolderId ? DriveApp.getFolderById(rootFolderId) : DriveApp.getRootFolder();
  } catch (e) {
    return;
  }

  const numCols = includeSubfolders ? 6 : 5;
  const data = [];
  const statusData = [];

  const folders = rootFolder.getFolders();
  while (folders.hasNext()) {
    const folder = folders.next();

    if (includeSubfolders) {
      const subfolders = folder.getFolders();
      while (subfolders.hasNext()) {
        const sub = subfolders.next();
        const subUrl = sub.getUrl();
        if (!existingUrls.has(subUrl)) {
          const subDate = sub.getLastUpdated();
          const subStatus = getUploadStatus_(subDate);
          data.push([
            subStatus ? subStatus.tag : '',
            folder.getName(),
            sub.getName(),
            subUrl,
            formatDate_(subDate),
            ''
          ]);
          statusData.push(subStatus);
        }
      }
    } else {
      const folderUrl = folder.getUrl();
      if (!existingUrls.has(folderUrl)) {
        const folderDate = folder.getLastUpdated();
        const folderStatus = getUploadStatus_(folderDate);
        data.push([
          folderStatus ? folderStatus.tag : '',
          folder.getName(),
          folderUrl,
          formatDate_(folderDate),
          ''
        ]);
        statusData.push(folderStatus);
      }
    }
  }

  if (data.length > 0) {
    saveData_(sheet, data, numCols, statusData);
    // Update timestamp
    sheet.getRange('G2').setValue('Auto-updated: ' + new Date().toLocaleString());
  }
}

/**
 * Set up automatic nightly updates
 */
function setupAutoUpdate() {
  const ui = SpreadsheetApp.getUi();

  // Remove existing triggers first
  const triggers = ScriptApp.getProjectTriggers();
  for (const trigger of triggers) {
    if (trigger.getHandlerFunction() === 'autoUpdateFolderList') {
      ScriptApp.deleteTrigger(trigger);
    }
  }

  // Create new daily trigger (runs between 1-2 AM)
  ScriptApp.newTrigger('autoUpdateFolderList')
    .timeBased()
    .everyDays(1)
    .atHour(1)
    .create();

  ui.alert('Auto-Update Enabled',
    'The folder list will automatically update every night (1-2 AM).\n\n' +
    'New folders will be added to the list automatically.\n\n' +
    'To disable, run "Disable Auto-Update" from the menu.',
    ui.ButtonSet.OK);
}

/**
 * Disable automatic updates
 */
function disableAutoUpdate() {
  const ui = SpreadsheetApp.getUi();

  const triggers = ScriptApp.getProjectTriggers();
  let removed = 0;
  for (const trigger of triggers) {
    if (trigger.getHandlerFunction() === 'autoUpdateFolderList') {
      ScriptApp.deleteTrigger(trigger);
      removed++;
    }
  }

  if (removed > 0) {
    ui.alert('Auto-Update Disabled', 'Automatic nightly updates have been disabled.', ui.ButtonSet.OK);
  } else {
    ui.alert('No Auto-Update', 'Auto-update was not enabled.', ui.ButtonSet.OK);
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
    .addItem('🔄 Update List (Add New Only)', 'updateFolderList')
    .addSeparator()
    .addItem('🔍 Find Empty Folders', 'markEmptyFolders')
    .addItem('🗑️ Remove Empty Folders', 'removeEmptyFolders')
    .addSeparator()
    .addItem('▶️ Resume Listing', 'resumeListing')
    .addItem('🗑️ Remove Marked Folders', 'removeMarkedFolders')
    .addSeparator()
    .addItem('⏰ Enable Auto-Update (Nightly)', 'setupAutoUpdate')
    .addItem('⏹️ Disable Auto-Update', 'disableAutoUpdate')
    .addItem('🔄 Reset / Start Over', 'resetAndStartOver')
    .addToUi();
}
