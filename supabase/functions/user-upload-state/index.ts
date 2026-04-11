import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
};

const snapshotBucketName = 'schedule-snapshots';
const pdfBucketName = 'schedule-uploaded-pdfs';
let bucketEnsured = false;

type PersistedUploadFile = {
  id: string;
  type: 'pdf' | 'csv';
  storagePath?: string;
};

type PersistedUploadSnapshot = {
  uploadedFiles?: PersistedUploadFile[];
};

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
  const { data, error } = await supabase.storage.getBucket(snapshotBucketName);

  if (error && !String(error.message).toLowerCase().includes('not found')) {
    throw error;
  }

  if (!data) {
    const { error: createError } = await supabase.storage.createBucket(snapshotBucketName, {
      public: false,
      fileSizeLimit: 10 * 1024 * 1024,
      allowedMimeTypes: ['application/json'],
    });

    if (createError && !String(createError.message).toLowerCase().includes('already exists')) {
      throw createError;
    }
  }

  const { data: pdfBucket, error: pdfBucketError } = await supabase.storage.getBucket(pdfBucketName);
  if (pdfBucketError && !String(pdfBucketError.message).toLowerCase().includes('not found')) {
    throw pdfBucketError;
  }

  if (!pdfBucket) {
    const { error: createPdfBucketError } = await supabase.storage.createBucket(pdfBucketName, {
      public: false,
      fileSizeLimit: 10 * 1024 * 1024,
      allowedMimeTypes: ['application/pdf'],
    });

    if (createPdfBucketError && !String(createPdfBucketError.message).toLowerCase().includes('already exists')) {
      throw createPdfBucketError;
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

async function getClientFolder(req: Request): Promise<string> {
  return hashIp(getClientIp(req));
}

async function loadSnapshot(supabase: ReturnType<typeof getSupabaseAdmin>, snapshotPath: string): Promise<PersistedUploadSnapshot | null> {
  const { data, error } = await supabase.storage.from(snapshotBucketName).download(snapshotPath);

  if (error) {
    if (String(error.message).toLowerCase().includes('not found')) {
      return null;
    }

    throw error;
  }

  const text = await data.text();
  return JSON.parse(text);
}

async function createSignedUrlsForSnapshot(supabase: ReturnType<typeof getSupabaseAdmin>, snapshot: PersistedUploadSnapshot | null) {
  const pdfFiles = (snapshot?.uploadedFiles ?? []).filter(file => file.type === 'pdf' && file.storagePath);
  const previewUrls: Record<string, string> = {};

  if (!pdfFiles.length) {
    return previewUrls;
  }

  const paths = pdfFiles.map(file => file.storagePath!) as string[];
  const { data, error } = await supabase.storage.from(pdfBucketName).createSignedUrls(paths, 60 * 60 * 24);
  if (error) throw error;

  data.forEach((entry, index) => {
    const fileId = pdfFiles[index]?.id;
    if (fileId && entry?.signedUrl) {
      previewUrls[fileId] = entry.signedUrl;
    }
  });

  return previewUrls;
}

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-');
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
      const snapshot = await loadSnapshot(supabase, snapshotPath);
      const pdfPreviewUrls = await createSignedUrlsForSnapshot(supabase, snapshot);

      return new Response(JSON.stringify({ snapshot, pdfPreviewUrls }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (req.method === 'DELETE') {
      let body: { action?: string; storagePath?: string } | null = null;
      try {
        body = await req.json();
      } catch {
        body = null;
      }

      if (body?.action === 'deletePdf' && body.storagePath) {
        const { error } = await supabase.storage.from(pdfBucketName).remove([body.storagePath]);
        if (error && !String(error.message).toLowerCase().includes('not found')) {
          throw error;
        }

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const snapshot = await loadSnapshot(supabase, snapshotPath);
      const pdfPaths = (snapshot?.uploadedFiles ?? [])
        .filter(file => file.type === 'pdf' && file.storagePath)
        .map(file => file.storagePath!) as string[];

      if (pdfPaths.length) {
        const { error: pdfRemoveError } = await supabase.storage.from(pdfBucketName).remove(pdfPaths);
        if (pdfRemoveError && !String(pdfRemoveError.message).toLowerCase().includes('not found')) {
          throw pdfRemoveError;
        }
      }

      const { error } = await supabase.storage.from(snapshotBucketName).remove([snapshotPath]);
      if (error && !String(error.message).toLowerCase().includes('not found')) {
        throw error;
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (req.method === 'POST') {
      const body = await req.json();
      const { action, snapshot } = body;

      if (action === 'createPdfUploadUrl') {
        const clientFolder = await getClientFolder(req);
        const fileId = String(body.fileId ?? 'unknown');
        const fileName = sanitizeFileName(String(body.fileName ?? `${fileId}.pdf`));
        const storagePath = `${clientFolder}/${fileId}-${fileName}`;

        const { data: signedUploadData, error: signedUploadError } = await supabase
          .storage
          .from(pdfBucketName)
          .createSignedUploadUrl(storagePath, { upsert: true });

        if (signedUploadError) throw signedUploadError;

        return new Response(JSON.stringify({
          success: true,
          storagePath,
          token: signedUploadData.token,
          signedUploadUrl: signedUploadData.signedUrl,
          path: signedUploadData.path,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (action === 'getPdfSignedUrl') {
        const storagePath = String(body.storagePath ?? '');

        if (!storagePath) {
          return new Response(JSON.stringify({ error: 'storagePath is required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const { data: signedUrlData, error: signedUrlError } = await supabase
          .storage
          .from(pdfBucketName)
          .createSignedUrl(storagePath, 60 * 60 * 24);

        if (signedUrlError) throw signedUrlError;

        return new Response(JSON.stringify({ success: true, storagePath, signedUrl: signedUrlData.signedUrl }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (action === 'uploadPdf') {
        const clientFolder = await getClientFolder(req);
        const fileId = String(body.fileId ?? 'unknown');
        const fileName = sanitizeFileName(String(body.fileName ?? `${fileId}.pdf`));
        const storagePath = `${clientFolder}/${fileId}-${fileName}`;
        const contentType = String(body.contentType ?? 'application/pdf');
        const contentBase64 = String(body.contentBase64 ?? '');

        if (!contentBase64) {
          return new Response(JSON.stringify({ error: 'PDF payload is required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const binary = Uint8Array.from(atob(contentBase64), char => char.charCodeAt(0));
        const { error: uploadError } = await supabase.storage.from(pdfBucketName).upload(storagePath, binary, {
          contentType,
          upsert: true,
        });
        if (uploadError) throw uploadError;

        const { data: signedUrlData, error: signedUrlError } = await supabase.storage.from(pdfBucketName).createSignedUrl(storagePath, 60 * 60 * 24);
        if (signedUrlError) throw signedUrlError;

        return new Response(JSON.stringify({ success: true, storagePath, signedUrl: signedUrlData.signedUrl }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (!snapshot) {
        return new Response(JSON.stringify({ error: 'Snapshot payload is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { error } = await supabase.storage.from(snapshotBucketName).upload(snapshotPath, JSON.stringify(snapshot), {
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