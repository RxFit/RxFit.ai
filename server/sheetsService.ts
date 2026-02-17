import { getUncachableGoogleSheetClient } from './sheetsClient';

const SPREADSHEET_ID = process.env.LEADS_SPREADSHEET_ID;

async function ensureHeaderRow(sheets: any, spreadsheetId: string): Promise<void> {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Sheet1!A1:F1',
    });

    if (!response.data.values || response.data.values.length === 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'Sheet1!A1:F1',
        valueInputOption: 'RAW',
        requestBody: {
          values: [['Date', 'Email', 'Name', 'Plan', 'Source', 'Status']],
        },
      });
    }
  } catch (error) {
    console.error('Error ensuring header row:', error);
  }
}

export async function appendLeadToSheet(data: {
  email: string;
  name?: string;
  plan?: string;
  source: 'lead_capture' | 'stripe_checkout';
  status: 'lead' | 'paid';
}): Promise<void> {
  if (!SPREADSHEET_ID) {
    console.warn('LEADS_SPREADSHEET_ID not set — skipping Google Sheets sync.');
    return;
  }

  try {
    const sheets = await getUncachableGoogleSheetClient();

    await ensureHeaderRow(sheets, SPREADSHEET_ID);

    const now = new Date().toISOString();
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Sheet1!A:F',
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [[
          now,
          data.email,
          data.name || '',
          data.plan || '',
          data.source,
          data.status,
        ]],
      },
    });
    console.log(`Lead appended to Google Sheet: ${data.email}`);
  } catch (error) {
    console.error('Failed to append lead to Google Sheet:', error);
  }
}
