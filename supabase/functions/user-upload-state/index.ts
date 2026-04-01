import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
};

const bucketName = 'schedule-snapshots';
let bucketEnsured = false;

function getSupabaseAdmin() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function ensureBucket() {
  if (bucketEnsured) return;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.storage.getBucket(bucketName);

  if (error && !String(error.message).toLowerCase().includes('not found')) {
    throw error;
  }

  if (!data) {
    const { error: createError } = await supabase.storage.createBucket(bucketName, {
      public: false,
      fileSizeLimit: 10 * 1024 * 1024,
      allowedMimeTypes: ['application/json'],
    });

    if (createError && !String(createError.message).toLowerCase().includes('already exists')) {
      throw createError;
    }
  }

  bucketEnsured = true;
}

function getClientIp(req: Request): string {
  const forwardedFor = req.headers.get('x-forwarded-for');
  if (forwardedFor) return forwardedFor.split(',')[0].trim();

  return (
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-real-ip') ||
    req.headers.get('fly-client-ip') ||
    'unknown'
  );
}

async function hashIp(ip: string): Promise<string> {
  const data = new TextEncoder().encode(ip);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function getSnapshotPath(req: Request): Promise<string> {
  const ip = getClientIp(req);
  const ipHash = await hashIp(ip);
  return `snapshots/${ipHash}.json`;
}

serve(async req => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    await ensureBucket();
    const supabase = getSupabaseAdmin();
    const snapshotPath = await getSnapshotPath(req);

    if (req.method === 'GET') {
      const { data, error } = await supabase.storage.from(bucketName).download(snapshotPath);

      if (error) {
        if (String(error.message).toLowerCase().includes('not found')) {
          return new Response(JSON.stringify({ snapshot: null }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        throw error;
      }

      const text = await data.text();
      return new Response(JSON.stringify({ snapshot: JSON.parse(text) }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (req.method === 'DELETE') {
      const { error } = await supabase.storage.from(bucketName).remove([snapshotPath]);
      if (error && !String(error.message).toLowerCase().includes('not found')) {
        throw error;
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (req.method === 'POST') {
      const { snapshot } = await req.json();
      if (!snapshot) {
        return new Response(JSON.stringify({ error: 'Snapshot payload is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { error } = await supabase.storage.from(bucketName).upload(snapshotPath, JSON.stringify(snapshot), {
        contentType: 'application/json',
        upsert: true,
      });

      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('user-upload-state error', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});