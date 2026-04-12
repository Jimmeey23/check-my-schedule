# Google Sheets `Cleaned-PDF` Sync Setup

The app now syncs parsed PDF class rows into the Google Sheet:

- Spreadsheet ID: `1OhhnD-9R_876ehw1xROZpyd0VcCLTwuuUUnh3A1Alv4`
- Sheet name: `Cleaned-PDF`

## What gets synced

Whenever a PDF schedule is:

- uploaded
- edited in the PDF files tab
- removed
- cleared from the app

…the current parsed PDF rows are rewritten into `Cleaned-PDF` with these columns:

- `Day`
- `Time`
- `Location`
- `Class`
- `Trainer`
- `Notes`
- `Date`
- `Theme`

## Required Supabase edge-function secrets

Set these secrets for the `google-sheets-sync` edge function:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REFRESH_TOKEN`

Optional overrides:

- `GOOGLE_SHEETS_SPREADSHEET_ID`
- `GOOGLE_SHEETS_CLEANED_PDF_SHEET_NAME`

## Important: the OAuth Google account must have edit access

The Google account used to generate `GOOGLE_REFRESH_TOKEN` must have **Editor** access to:

- spreadsheet `1OhhnD-9R_876ehw1xROZpyd0VcCLTwuuUUnh3A1Alv4`
- tab `Cleaned-PDF`

If that account cannot access the sheet, the sync will fail even though the PDF upload itself still works.

## OAuth scope

When generating the refresh token, include Google Sheets access:

- `https://www.googleapis.com/auth/spreadsheets`

If you also use Google Drive file pickers or metadata tools elsewhere, broader scopes may work too, but Sheets access is the minimum required here.

## Deploy the function

Deploy the new Supabase edge function after setting secrets:

- `google-sheets-sync`

If you use the Supabase CLI, deploy it the same way as the existing edge functions in this repo.

## If you get a 401 from the edge function

This app does not require users to sign in before uploading PDFs.

Because of that, you should deploy `google-sheets-sync` with JWT verification disabled, or otherwise allow anon-token invocation.

If you use the Supabase CLI, deploy it with:

- `supabase functions deploy google-sheets-sync --no-verify-jwt`

The client now also retries with explicit anon auth headers, but if the function is locked to authenticated user JWTs only, you will still see a 401 until deployment settings are corrected.

## If you get a 404 from Google Sheets

That usually means one of these is wrong:

- the spreadsheet ID
- the target sheet/tab name (`Cleaned-PDF`)
- the OAuth Google account tied to the refresh token does not have access to the spreadsheet
