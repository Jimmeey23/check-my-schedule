import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

declare const Deno: {
  env: {
    get(name: string): string | undefined;
  };
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const DEFAULT_SPREADSHEET_ID = '1OhhnD-9R_876ehw1xROZpyd0VcCLTwuuUUnh3A1Alv4';
const DEFAULT_SHEET_NAME = 'Cleaned-PDF';
const GOOGLE_TOKEN_AUDIENCE = 'https://oauth2.googleapis.com/token';

type CleanedPdfSheetRow = {
  day?: string;
  time?: string;
  location?: string;
  className?: string;
  trainer?: string;
  notes?: string;
  date?: string;
  theme?: string;
};

function getRequiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function createGoogleAccessToken(): Promise<string> {
  const clientId = getRequiredEnv('GOOGLE_CLIENT_ID');
  const clientSecret = getRequiredEnv('GOOGLE_CLIENT_SECRET');
  const refreshToken = getRequiredEnv('GOOGLE_REFRESH_TOKEN');

  const tokenResponse = await fetch(GOOGLE_TOKEN_AUDIENCE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!tokenResponse.ok) {
    throw new Error(`Failed to obtain Google access token (${tokenResponse.status}): ${await tokenResponse.text()}`);
  }

  const tokenPayload = await tokenResponse.json();
  if (!tokenPayload?.access_token) {
    throw new Error('Google token response did not contain an access token.');
  }

  return tokenPayload.access_token as string;
}

function getTargetSheetConfig(spreadsheetId?: string, sheetName?: string) {
  return {
    spreadsheetId: spreadsheetId?.trim() || Deno.env.get('GOOGLE_SHEETS_SPREADSHEET_ID')?.trim() || DEFAULT_SPREADSHEET_ID,
    sheetName: sheetName?.trim() || Deno.env.get('GOOGLE_SHEETS_CLEANED_PDF_SHEET_NAME')?.trim() || DEFAULT_SHEET_NAME,
  };
}

function buildSheetValues(rows: CleanedPdfSheetRow[]): string[][] {
  return [
    ['Day', 'Time', 'Location', 'Class', 'Trainer', 'Notes', 'Date', 'Theme'],
    ...rows.map(row => [
      row.day?.trim() || '',
      row.time?.trim() || '',
      row.location?.trim() || '',
      row.className?.trim() || '',
      row.trainer?.trim() || '',
      row.notes?.trim() || '',
      row.date?.trim() || '',
      row.theme?.trim() || '',
    ]),
  ];
}

async function writeSheetValues(accessToken: string, spreadsheetId: string, sheetName: string, values: string[][]) {
  const escapedRange = encodeURIComponent(`'${sheetName}'!A:Z`);
  const clearResponse = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${escapedRange}:clear`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!clearResponse.ok) {
    if (clearResponse.status === 404) {
      throw new Error(
        `Google Sheet or tab not found. Confirm spreadsheet ID "${spreadsheetId}", tab "${sheetName}", and that the Google account behind your OAuth refresh token has edit access.`
      );
    }
    throw new Error(`Failed to clear Google Sheet (${clearResponse.status}): ${await clearResponse.text()}`);
  }

  const updateRange = encodeURIComponent(`'${sheetName}'!A1:H${Math.max(values.length, 1)}`);
  const updateResponse = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${updateRange}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        range: `'${sheetName}'!A1:H${Math.max(values.length, 1)}`,
        majorDimension: 'ROWS',
        values,
      }),
    }
  );

  if (!updateResponse.ok) {
    if (updateResponse.status === 404) {
      throw new Error(
        `Google Sheet or tab not found. Confirm spreadsheet ID "${spreadsheetId}", tab "${sheetName}", and that the Google account behind your OAuth refresh token has edit access.`
      );
    }
    throw new Error(`Failed to update Google Sheet (${updateResponse.status}): ${await updateResponse.text()}`);
  }

  return updateResponse.json();
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json();
    const rows = Array.isArray(body?.rows) ? (body.rows as CleanedPdfSheetRow[]) : [];
    const { spreadsheetId, sheetName } = getTargetSheetConfig(body?.spreadsheetId, body?.sheetName);
    const accessToken = await createGoogleAccessToken();
    const values = buildSheetValues(rows);
    const result = await writeSheetValues(accessToken, spreadsheetId, sheetName, values);

    return new Response(JSON.stringify({
      success: true,
      rowCount: rows.length,
      spreadsheetId,
      sheetName,
      updatedRange: result?.updatedRange,
      updatedRows: result?.updatedRows,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('google-sheets-sync error', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Internal server error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
