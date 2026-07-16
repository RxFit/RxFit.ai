import { getUncachableGoogleSheetClient } from './sheetsClient';

const SPREADSHEET_ID = process.env.LEADS_SPREADSHEET_ID;
const SHEET_NAME = 'RxFit Leads';
const ALERTS_SHEET_NAME = 'RxFit Alerts';
const META_SHEET_NAME = 'RxFit Meta';

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
  await appendAlertToSheet({
    title: `${alert.service.toUpperCase()} credentials are BROKEN (alert email could not be sent)`,
    message: alert.message,
  });
  console.log(`[credential-check] Fallback alert row appended to Google Sheet for ${alert.service}`);
}

/**
 * Generalized fallback alert channel: append a row to the "RxFit Alerts" tab
 * of the leads spreadsheet. Used when the Gmail alert email can't be sent
 * (e.g. the Gmail connection itself is what broke). Throws on failure so the
 * caller can log that BOTH channels failed.
 */
export async function appendAlertToSheet(alert: {
  title: string;
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
        alert.title,
        alert.message.slice(0, 2000),
      ]],
    },
  });
}

export interface AlertRow {
  date: string;
  title: string;
  details: string;
}

/**
 * Read every data row from the "RxFit Alerts" tab (used by the weekly digest).
 * Returns [] when the spreadsheet/tab doesn't exist yet (no alerts were ever
 * written). Throws on real API failures so the digest run can retry later.
 */
export async function getAlertRows(): Promise<AlertRow[]> {
  if (!SPREADSHEET_ID) {
    throw new Error('LEADS_SPREADSHEET_ID not set — cannot read alert rows');
  }
  const sheets = await getUncachableGoogleSheetClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const sheetNames = meta.data.sheets?.map((s: any) => s.properties?.title) || [];
  if (!sheetNames.includes(ALERTS_SHEET_NAME)) return [];

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${ALERTS_SHEET_NAME}'!A2:C`,
  });
  const values: string[][] = res.data.values || [];
  return values
    .filter((row) => row.length > 0 && (row[0] || row[1]))
    .map((row) => ({ date: row[0] || '', title: row[1] || '', details: row[2] || '' }));
}

async function ensureMetaSheet(sheets: any, spreadsheetId: string): Promise<void> {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const sheetNames = meta.data.sheets?.map((s: any) => s.properties?.title) || [];
  if (!sheetNames.includes(META_SHEET_NAME)) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: META_SHEET_NAME, hidden: true } } }],
      },
    });
  }
}

/**
 * Read the last-digest-sent timestamp from the hidden "RxFit Meta" tab.
 * Returns null when never sent (missing tab/cell or unparseable value).
 */
export async function getAlertsDigestLastSentAt(): Promise<Date | null> {
  if (!SPREADSHEET_ID) {
    throw new Error('LEADS_SPREADSHEET_ID not set — cannot read digest state');
  }
  const sheets = await getUncachableGoogleSheetClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const sheetNames = meta.data.sheets?.map((s: any) => s.properties?.title) || [];
  if (!sheetNames.includes(META_SHEET_NAME)) return null;

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${META_SHEET_NAME}'!B1`,
  });
  const raw = res.data.values?.[0]?.[0];
  if (!raw) return null;
  const parsed = new Date(raw);
  return isNaN(parsed.getTime()) ? null : parsed;
}

/** Persist the last-digest-sent timestamp to the hidden "RxFit Meta" tab. */
export async function setAlertsDigestLastSentAt(sentAt: Date): Promise<void> {
  if (!SPREADSHEET_ID) {
    throw new Error('LEADS_SPREADSHEET_ID not set — cannot write digest state');
  }
  const sheets = await getUncachableGoogleSheetClient();
  await ensureMetaSheet(sheets, SPREADSHEET_ID);
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${META_SHEET_NAME}'!A1:B1`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [['alertsDigestLastSentAt', sentAt.toISOString()]],
    },
  });
}
