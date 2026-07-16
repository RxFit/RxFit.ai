import { getUncachableGoogleSheetClient } from './sheetsClient';

const SPREADSHEET_ID = process.env.LEADS_SPREADSHEET_ID;
const SHEET_NAME = 'RxFit Leads';
const ALERTS_SHEET_NAME = 'RxFit Alerts';

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

async function ensureAlertsSheet(sheets: any, spreadsheetId: string): Promise<void> {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const sheetNames = meta.data.sheets?.map((s: any) => s.properties?.title) || [];

  if (!sheetNames.includes(ALERTS_SHEET_NAME)) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: ALERTS_SHEET_NAME } } }],
      },
    });

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${ALERTS_SHEET_NAME}'!A1:C1`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [['Date', 'Alert', 'Details']],
      },
    });
  }
}

/**
 * Fallback alert channel for when the Gmail alert email can't be sent
 * (e.g. the Gmail connection itself is what broke). Appends a row to the
 * "RxFit Alerts" tab of the leads spreadsheet via the separate google-sheet
 * connector. Throws on failure so the caller can log that BOTH channels failed.
 */
export async function appendCredentialAlertToSheet(alert: {
  service: string;
  message: string;
}): Promise<void> {
  if (!SPREADSHEET_ID) {
    throw new Error('LEADS_SPREADSHEET_ID not set — cannot write alert to Google Sheets');
  }

  const sheets = await getUncachableGoogleSheetClient();
  await ensureAlertsSheet(sheets, SPREADSHEET_ID);

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${ALERTS_SHEET_NAME}'!A:C`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [[
        new Date().toISOString(),
        `${alert.service.toUpperCase()} credentials are BROKEN (alert email could not be sent)`,
        alert.message.slice(0, 2000),
      ]],
    },
  });
  console.log(`[credential-check] Fallback alert row appended to Google Sheet for ${alert.service}`);
}
