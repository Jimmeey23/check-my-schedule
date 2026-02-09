# Momence Integration Setup Guide

## Overview

The Momence integration uses a **Supabase Edge Function** to securely fetch class data from the Momence API and compare it with your PDF/CSV schedules.

## ✅ What's Already Configured

- ✅ Edge function code at `supabase/functions/momence-sessions/index.ts`
- ✅ Supabase client integration in `src/lib/supabaseClient.ts`
- ✅ MomenceTab component integrated in the app
- ✅ Date range extraction from PDF files
- ✅ Comparison logic with CSV/PDF data

## 🚀 Quick Deploy

Run the deployment script:

```bash
./deploy-momence.sh
```

Or manually:

```bash
# 1. Install Supabase CLI (if not installed)
npm install -g supabase

# 2. Login
supabase login

# 3. Link to project
supabase link --project-ref oleiodivubhtcagrlfug

# 4. Deploy function
supabase functions deploy momence-sessions --no-verify-jwt
```

## 🧪 Testing

### Test Edge Function Directly

```bash
curl -X POST https://oleiodivubhtcagrlfug.supabase.co/functions/v1/momence-sessions \
  -H "Content-Type: application/json" \
  -d '{"startDate": "Jan 6, 2025", "endDate": "Jan 12, 2025"}'
```

### Test in App

1. Upload a PDF schedule (date range is extracted automatically)
2. Navigate to the **Momence** tab
3. Click **"Fetch Sessions"**
4. Sessions will load and compare with CSV/PDF data

## 📋 Features

### Edge Function Capabilities

- **Authentication**: Handles Momence API authentication with token caching
- **Date Parsing**: Accepts multiple date formats ("Jan 6", "January 6, 2025", ISO dates)
- **Token Caching**: Reduces API calls by caching access tokens (1 hour expiry)
- **Auto-Retry**: Automatically refreshes tokens on 401 errors
- **CORS Enabled**: Works from browser applications
- **Error Handling**: Comprehensive error messages

### App Integration

- **Auto Date Range**: Extracts `weekStart` and `weekEnd` from uploaded PDFs
- **Smart Comparison**: Matches Momence sessions with CSV/PDF classes
- **Status Indicators**: 
  - ✅ Green checkmark for matches
  - ❌ Red cross for mismatches
  - ⚠️ Yellow triangle for missing classes
- **Detailed View**: Shows booking counts, capacity, trainer info, location

## 🔧 Local Development

### Option 1: Use Deployed Edge Function (Recommended)

The app is configured to use the deployed edge function by default. Just run:

```bash
npm run dev
```

### Option 2: Run Edge Function Locally

```bash
# Terminal 1: Start Supabase locally
supabase start

# Terminal 2: Serve the function
supabase functions serve momence-sessions

# Terminal 3: Run the app
npm run dev
```

Then update `src/lib/supabaseClient.ts` to use local URL:

```typescript
const supabaseUrl = 'http://localhost:54321';
```

## 📁 File Structure

```
├── supabase/
│   └── functions/
│       └── momence-sessions/
│           └── index.ts          # Edge function (handles Momence API)
├── src/
│   ├── lib/
│   │   ├── supabaseClient.ts     # Supabase client & edge function caller
│   │   └── momenceNormalizer.ts  # (unused) Direct API integration
│   └── components/
│       └── MomenceTab.tsx        # UI component for Momence integration
├── deploy-momence.sh             # Deployment script
└── MOMENCE_SETUP.md              # This file
```

## 🔐 Security

- Credentials are hardcoded in the edge function (server-side only)
- Never exposed to browser/client
- Edge function runs in Supabase secure environment
- CORS configured for your domain only (update as needed)

## 📊 API Response Format

```json
{
  "pagination": {
    "page": 0,
    "pageSize": 200,
    "totalCount": 45,
    "sortBy": "startsAt",
    "sortOrder": "ASC"
  },
  "payload": [
    {
      "id": 123,
      "name": "Studio Yoga Flow",
      "startsAt": "2025-01-06T10:00:00Z",
      "endsAt": "2025-01-06T11:00:00Z",
      "durationInMinutes": 60,
      "capacity": 20,
      "bookingCount": 15,
      "teacher": {
        "id": 456,
        "firstName": "Jane",
        "lastName": "Doe"
      },
      "inPersonLocation": {
        "id": 789,
        "name": "Main Studio"
      },
      "isCancelled": false,
      "isDraft": false
    }
  ]
}
```

## 🐛 Troubleshooting

### "Date range not available"
- Ensure you've uploaded a PDF first
- Check that the PDF has a valid date range in the header

### "Authentication failed"
- Edge function credentials may need updating
- Check Supabase function logs: `supabase functions logs momence-sessions`

### "Failed to fetch sessions"
- Verify the edge function is deployed: `supabase functions list`
- Check network tab in browser DevTools for error details
- Test edge function directly with curl (see Testing section)

### Sessions not matching CSV/PDF
- Check normalization logic in `MomenceTab.tsx`
- Verify class names, trainer names match between sources
- Times must match (handles 12h/24h format conversion)

## 📞 Support

For issues with:
- **Momence API**: Contact Momence support
- **Supabase Edge Functions**: See [Supabase Docs](https://supabase.com/docs/guides/functions)
- **This Integration**: Check the code or create an issue

---

**Last Updated**: February 9, 2026
