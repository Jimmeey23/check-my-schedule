#!/bin/bash

echo "🧪 Testing Momence Edge Function..."
echo ""

# Test the deployed edge function
echo "Testing with sample date range..."
RESPONSE=$(curl -s -X POST https://oleiodivubhtcagrlfug.supabase.co/functions/v1/momence-sessions \
  -H "Content-Type: application/json" \
  -d '{"startDate": "Feb 10, 2026", "endDate": "Feb 16, 2026"}')

# Check if response contains error
if echo "$RESPONSE" | grep -q "error"; then
    echo "❌ Error response:"
    echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
    echo ""
    echo "💡 The edge function may not be deployed yet."
    echo "   Run: ./deploy-momence.sh"
    exit 1
fi

# Check if response contains sessions
if echo "$RESPONSE" | grep -q "sessions"; then
    echo "✅ Edge function is working!"
    echo ""
    echo "Response summary:"
    echo "$RESPONSE" | jq '{
      sessionsReturned: (.sessions | length),
      firstSession: (.sessions[0].name // "none")
    }' 2>/dev/null || echo "$RESPONSE"
    exit 0
fi

echo "⚠️  Unexpected response:"
echo "$RESPONSE"
echo ""
echo "💡 Check deployment status with: supabase functions list"
