/**
 * Google Apps Script to list folders and their subfolders (one level deep) in a Google Sheet
 *
 * Usage:
 * 1. Open Google Sheets
 * 2. Go to Extensions > Apps Script
 * 3. Paste this code and save
 * 4. Run listFolders() - it will prompt for folder ID on first run
 * 5. Grant permissions when asked
 */

// Configuration - Set your folder ID here, or leave empty to use a prompt
const FOLDER_ID = ''; // e.g., '1ABC123def456' from the folder URL

/**
 * Main function to list folders and subfolders
 */
function listFolders() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

  // Get folder ID from config or prompt user
  let folderId = FOLDER_ID;
  if (!folderId) {
    const ui = SpreadsheetApp.getUi();
    const response = ui.prompt(
      'Enter Folder ID',
      'Paste the Google Drive folder ID (from the URL after /folders/):\n\nLeave empty to list from root "My Drive"',
      ui.ButtonSet.OK_CANCEL
    );

    if (response.getSelectedButton() === ui.Button.CANCEL) {
      return;
    }
    folderId = response.getResponseText().trim();
  }

  // Clear existing content
  sheet.clear();

  // Set up headers
  const headers = ['Parent Folder', 'Parent Folder ID', 'Subfolder', 'Subfolder ID', 'Subfolder URL'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');

  // Get the starting folder
  let parentFolder;
  try {
    if (folderId) {
      parentFolder = DriveApp.getFolderById(folderId);
    } else {
      parentFolder = DriveApp.getRootFolder();
    }
  } catch (e) {
    SpreadsheetApp.getUi().alert('Error: Could not access folder. Check the folder ID and permissions.\n\n' + e.message);
    return;
  }

  const data = [];

  // Get all folders in the parent folder
  const folders = parentFolder.getFolders();

  while (folders.hasNext()) {
    const folder = folders.next();
    const folderName = folder.getName();
    const folderIdStr = folder.getId();

    // Get subfolders (one level deep only)
    const subfolders = folder.getFolders();

    if (!subfolders.hasNext()) {
      // Folder has no subfolders - still list it
      data.push([
        folderName,
        folderIdStr,
        '(no subfolders)',
        '',
        ''
      ]);
    } else {
      // List each subfolder
      while (subfolders.hasNext()) {
        const subfolder = subfolders.next();
        const subfolderName = subfolder.getName();
        const subfolderId = subfolder.getId();
        const subfolderUrl = subfolder.getUrl();

        data.push([
          folderName,
          folderIdStr,
          subfolderName,
          subfolderId,
          subfolderUrl
        ]);
      }
    }
  }

  // Write data to sheet
  if (data.length > 0) {
    sheet.getRange(2, 1, data.length, headers.length).setValues(data);
  }

  // Auto-resize columns
  for (let i = 1; i <= headers.length; i++) {
    sheet.autoResizeColumn(i);
  }

  // Show summary
  const folderCount = new Set(data.map(row => row[0])).size;
  const subfolderCount = data.filter(row => row[2] !== '(no subfolders)').length;

  SpreadsheetApp.getUi().alert(
    'Done!',
    `Listed ${folderCount} folders with ${subfolderCount} subfolders.`,
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

/**
 * Add a custom menu when the spreadsheet opens
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Folder List')
    .addItem('List Folders & Subfolders', 'listFolders')
    .addToUi();
}
