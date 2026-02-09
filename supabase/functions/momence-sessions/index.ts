import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

// Cache token to avoid re-authenticating on every request
let cachedToken: string | null = null;
let tokenExpiry: number = 0;

async function getAccessToken(): Promise<string> {
  // Return cached token if still valid (5 min buffer)
  if (cachedToken && Date.now() < tokenExpiry - 5 * 60 * 1000) {
    return cachedToken;
  }

  const CLIENT_ID = "api-13752-8AYbTllyoq5NMWWQ";
  const CLIENT_SECRET = "1dT02Bv303wji6abpL1eGiwaWA7fYAPn";
  const basicAuth = btoa(`${CLIENT_ID}:${CLIENT_SECRET}`);

  const response = await fetch("https://api.momence.com/api/v2/auth/token", {
    method: "POST",
    headers: {
      accept: "application/json",
      authorization: `Basic ${basicAuth}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "password",
      username: "jimmygonda@gmail.com",
      password: "Jimmeey@123",
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Auth failed: ${response.status} ${text}`);
  }

  const data = await response.json();
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in || 3600) * 1000;

  return cachedToken;
}

async function fetchSessions(startDate: string, endDate: string): Promise<any> {
  const token = await getAccessToken();

  const params = new URLSearchParams({
    page: "0",
    pageSize: "200",
    sortOrder: "ASC",
    sortBy: "startsAt",
    includeCancelled: "false",
    startAfter: startDate,
    endBefore: endDate,
  });

  let response = await fetch(
    `https://api.momence.com/api/v2/host/sessions?${params.toString()}`,
    {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${token}`,
      },
    }
  );

  // If unauthorized, clear cache and retry once
  if (response.status === 401) {
    cachedToken = null;
    const newToken = await getAccessToken();
    
    response = await fetch(
      `https://api.momence.com/api/v2/host/sessions?${params.toString()}`,
      {
        method: "GET",
        headers: {
          accept: "application/json",
          authorization: `Bearer ${newToken}`,
        },
      }
    );
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Sessions fetch failed: ${response.status} ${text}`);
  }

  return await response.json();
}

function parseToISO(dateStr: string): string {
  // Handle formats like "Jan 6", "January 6", "Jan 6, 2025"
  const currentYear = new Date().getFullYear();
  
  // If already ISO format, return as-is
  if (dateStr.includes("T") && dateStr.includes("-")) {
    return dateStr.split("T")[0];
  }
  
  let date = new Date(dateStr);
  
  // If no year in string, try current and next year
  if (!dateStr.match(/\d{4}/)) {
    date = new Date(`${dateStr}, ${currentYear}`);
    if (isNaN(date.getTime())) {
      date = new Date(`${dateStr}, ${currentYear + 1}`);
    }
  }
  
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date format: ${dateStr}`);
  }
  
  return date.toISOString().split("T")[0];
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    let startDate = url.searchParams.get("startDate") || "";
    let endDate = url.searchParams.get("endDate") || "";

    // Also check POST body
    if (req.method === "POST") {
      try {
        const body = await req.json();
        startDate = body.startDate || startDate;
        endDate = body.endDate || endDate;
      } catch {
        // ignore parse errors
      }
    }

    if (!startDate || !endDate) {
      // Default to next 30 days if no dates provided
      const today = new Date();
      const nextMonth = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
      startDate = today.toISOString().split('T')[0];
      endDate = nextMonth.toISOString().split('T')[0];
    }

    // Parse dates to ISO format
    const isoStart = parseToISO(startDate);
    const isoEnd = parseToISO(endDate);

    console.log(`Fetching sessions from ${isoStart} to ${isoEnd}`);

    const data = await fetchSessions(isoStart, isoEnd);

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Momence edge function error:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Internal server error" 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});
