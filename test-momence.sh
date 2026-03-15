#!/bin/bash

echo "🧪 Testing Momence Edge Function..."
echo ""

# Test the deployed edge function
echo "Testing with sample date range..."
HTTP_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST https://oleiodivubhtcagrlfug.supabase.co/functions/v1/momence-sessions \
  -H "Content-Type: application/json" \
  -d '{"startDate": "Feb 10, 2026", "endDate": "Feb 16, 2026"}')

HTTP_STATUS=$(echo "$HTTP_RESPONSE" | tail -n 1)
RESPONSE=$(echo "$HTTP_RESPONSE" | sed '$d')

if [ "$HTTP_STATUS" = "401" ]; then
    echo "❌ Edge function returned 401 Unauthorized"
    echo ""
    echo "💡 Supabase is rejecting the request before the function runs."
    echo "   Redeploy the function as public:"
    echo "   supabase functions deploy momence-sessions --no-verify-jwt"
    exit 1
fi

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
if echo "$RESPONSE" | grep -q '"payload"\|"totalCount"'; then
    echo "✅ Edge function is working!"
    echo ""
    echo "Response summary:"
    echo "$RESPONSE" | jq '{
      sessionsReturned: (.payload | length),
      firstSession: (.payload[0].name // "none"),
      totalCount: (.pagination.totalCount // 0)
    }' 2>/dev/null || echo "$RESPONSE"
    exit 0
fi

echo "⚠️  Unexpected response:"
echo "$RESPONSE"
echo ""
echo "💡 Check deployment status with: supabase functions list"
