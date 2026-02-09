#!/bin/bash

# Deploy Momence Edge Function to Supabase

echo "🚀 Deploying Momence Edge Function..."

# Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI not found. Installing..."
    npm install -g supabase
fi

# Link to project (if not already linked)
if [ ! -f ".supabase/config.toml" ]; then
    echo "🔗 Linking to Supabase project..."
    supabase link --project-ref oleiodivubhtcagrlfug
fi

# Deploy the function
echo "📦 Deploying momence-sessions function..."
supabase functions deploy momence-sessions --no-verify-jwt

echo "✅ Deployment complete!"
echo ""
echo "Function URL: https://oleiodivubhtcagrlfug.supabase.co/functions/v1/momence-sessions"
echo ""
echo "Test with:"
echo 'curl -X POST https://oleiodivubhtcagrlfug.supabase.co/functions/v1/momence-sessions \'
echo '  -H "Content-Type: application/json" \'
echo '  -d '"'"'{"startDate": "Jan 6, 2025", "endDate": "Jan 12, 2025"}'"'"
