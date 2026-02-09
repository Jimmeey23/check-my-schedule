import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

let accessToken = "";
let refreshToken = "";

async function authenticate(): Promise<void> {
  const basicAuth = Deno.env.get("MOMENCE_BASIC_AUTH");
  const username = Deno.env.get("MOMENCE_USERNAME");
  const password = Deno.env.get("MOMENCE_PASSWORD");

  if (!basicAuth || !username || !password) {
    throw new Error("Missing Momence credentials in secrets");
  }

  const response = await fetch("https://api.momence.com/api/v2/auth/token", {
    method: "POST",
    headers: {
      accept: "application/json",
      authorization: `Basic ${basicAuth}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "password",
      username,
      password,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Auth failed: ${response.status} ${text}`);
  }

  const data = await response.json();
  accessToken = data.access_token;
  refreshToken = data.refreshToken || data.refresh_token;
}

async function refreshAccessToken(): Promise<void> {
  const basicAuth = Deno.env.get("MOMENCE_BASIC_AUTH");

  const response = await fetch("https://api.momence.com/api/v2/auth/token", {
    method: "POST",
    headers: {
      accept: "application/json",
      authorization: `Basic ${basicAuth}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    // If refresh fails, do full auth
    await authenticate();
    return;
  }

  const data = await response.json();
  accessToken = data.access_token;
  refreshToken = data.refreshToken || data.refresh_token;
}

async function fetchSessions(startDate: string, endDate: string): Promise<any> {
  if (!accessToken) {
    await authenticate();
  }

  const params = new URLSearchParams({
    page: "0",
    pageSize: "200",
    sortOrder: "ASC",
    sortBy: "startsAt",
    includeCancelled: "false",
    types: "",
    startAfter: startDate,
    endBefore: endDate,
  });

  let response = await fetch(
    `https://api.momence.com/api/v2/host/sessions?${params.toString()}`,
    {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${accessToken}`,
      },
    }
  );

  // If unauthorized, refresh token and retry
  if (response.status === 401) {
    await refreshAccessToken();
    response = await fetch(
      `https://api.momence.com/api/v2/host/sessions?${params.toString()}`,
      {
        method: "GET",
        headers: {
          accept: "application/json",
          authorization: `Bearer ${accessToken}`,
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

serve(async (req) => {
  // CORS preflight
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
      return new Response(
        JSON.stringify({ error: "startDate and endDate are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Format dates for Momence API (ISO 8601)
    // Try to parse various date formats
    const parseDate = (d: string): string => {
      // If already ISO format, return as-is
      if (d.includes("T")) return d;
      // Try DD/MM/YYYY
      const parts = d.split(/[\/\-\.]/);
      if (parts.length === 3) {
        const [a, b, c] = parts;
        // If c is 4 digits, it's DD/MM/YYYY or MM/DD/YYYY
        if (c.length === 4) {
          return `${c}-${b.padStart(2, "0")}-${a.padStart(2, "0")}T00:00:00Z`;
        }
        // YYYY-MM-DD
        if (a.length === 4) {
          return `${a}-${b.padStart(2, "0")}-${c.padStart(2, "0")}T00:00:00Z`;
        }
      }
      return d;
    };

    const formattedStart = parseDate(startDate);
    const formattedEnd = parseDate(endDate);

    const data = await fetchSessions(formattedStart, formattedEnd);

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Momence edge function error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
