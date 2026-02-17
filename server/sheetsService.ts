import { getUncachableGoogleSheetClient } from './sheetsClient';

const SPREADSHEET_ID = process.env.LEADS_SPREADSHEET_ID;
const SHEET_NAME = 'RxFit Leads';

async function ensureSheet(sheets: any, spreadsheetId: string): Promise<void> {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const sheetNames = meta.data.sheets?.map((s: any) => s.properties?.title) || [];

  if (!sheetNames.includes(SHEET_NAME)) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: SHEET_NAME } } }],
      },
    });

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${SHEET_NAME}'!A1:F1`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [['Date', 'Email', 'Name', 'Plan', 'Source', 'Status']],
      },
    });
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

    await ensureSheet(sheets, SPREADSHEET_ID);

    const now = new Date().toISOString();
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${SHEET_NAME}'!A:F`,
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
