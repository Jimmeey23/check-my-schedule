import { createClient } from '@supabase/supabase-js';
import type { PersistedScheduleSnapshot } from '@/lib/persistedScheduleState';
import type { CleanedPdfSheetRow } from '@/lib/cleanedPdfSheet';
import type { PdfClassData } from '@/types/schedule';
import type { PdfThemePageImage, PdfThemeVisionMatch } from '@/lib/pdfThemeVision';

export interface PersistedUploadStateResponse {
  snapshot: PersistedScheduleSnapshot | null;
  pdfPreviewUrls?: Record<string, string>;
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://oleiodivubhtcagrlfug.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9sZWlvZGl2dWJodGNhZ3JsZnVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzgwMzQwNTYsImV4cCI6MjA1MzYxMDA1Nn0.3yzD0c4xXo59AkSmLcWwXqNSzjhbXCNCl4-M_2cCqGw';

export const supabase = createClient(supabaseUrl, supabaseKey);

async function invokeEdgeFunctionWithAnonAuth<TResponse>(
  functionName: string,
  body?: unknown,
  method: 'GET' | 'POST' | 'DELETE' = 'POST'
): Promise<TResponse> {
  const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
    },
    body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(errorText || `Edge Function returned ${response.status}`);
  }

  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  if (!contentType.includes('application/json')) {
    return undefined as TResponse;
  }

  return response.json() as Promise<TResponse>;
}

export async function invokeMomenceFunction(startDate?: string, endDate?: string) {
  const { data, error } = await supabase.functions.invoke('momence-sessions', {
    body: { startDate, endDate },
  });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function syncCleanedPdfSheet(
  rows: CleanedPdfSheetRow[],
  options?: { spreadsheetId?: string; sheetName?: string }
) {
  const requestBody = {
    rows,
    spreadsheetId: options?.spreadsheetId,
    sheetName: options?.sheetName,
  };

  const { data, error } = await supabase.functions.invoke('google-sheets-sync', {
    body: requestBody,
  });

  if (!error) {
    return data;
  }

  const statusCode = typeof error.context === 'object' && error.context && 'status' in error.context
    ? Number((error.context as { status?: number }).status)
    : undefined;

  if (statusCode === 401 || /401|non-2xx status code/i.test(error.message)) {
    return invokeEdgeFunctionWithAnonAuth('google-sheets-sync', requestBody);
  }

  throw new Error(error.message);
}

export async function invokePdfThemeVision(
  rows: PdfClassData[],
  pageImages: PdfThemePageImage[],
  themeCandidates: string[] = []
): Promise<PdfThemeVisionMatch[]> {
  const requestBody = { rows, pageImages, themeCandidates };
  const { data, error } = await supabase.functions.invoke('pdf-theme-vision', {
    body: requestBody,
  });

  if (!error) {
    return Array.isArray(data?.matches) ? data.matches : [];
  }

  const statusCode = typeof error.context === 'object' && error.context && 'status' in error.context
    ? Number((error.context as { status?: number }).status)
    : undefined;

  if (statusCode === 401 || /401|non-2xx status code/i.test(error.message)) {
    const fallback = await invokeEdgeFunctionWithAnonAuth<{ matches?: PdfThemeVisionMatch[] }>('pdf-theme-vision', requestBody);
    return Array.isArray(fallback?.matches) ? fallback.matches : [];
  }

  throw new Error(error.message);
}

export async function loadPersistedUploadState(): Promise<PersistedUploadStateResponse> {
  const { data, error } = await supabase.functions.invoke('user-upload-state', {
    method: 'GET',
  });

  if (error) {
    throw new Error(error.message);
  }

  return {
    snapshot: data?.snapshot ?? null,
    pdfPreviewUrls: data?.pdfPreviewUrls ?? {},
  };
}

export async function urlLooksLikePdf(url: string): Promise<boolean> {
  if (!url) return false;
  if (url.startsWith('blob:')) return true;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Range: 'bytes=0-4',
      },
    });

    if (!response.ok) return false;

    const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
    if (contentType.includes('application/pdf')) {
      return true;
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length < 4) return false;

    return bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
  } catch {
    return false;
  }
}

export async function savePersistedUploadState(snapshot: PersistedScheduleSnapshot) {
  const { error } = await supabase.functions.invoke('user-upload-state', {
    body: { snapshot },
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function clearPersistedUploadState() {
  const { error } = await supabase.functions.invoke('user-upload-state', {
    method: 'DELETE',
  });

  if (error) {
    throw new Error(error.message);
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

async function uploadPersistedPdfLegacy(file: File, fileId: string): Promise<{ storagePath: string; signedUrl?: string }> {
  const buffer = await file.arrayBuffer();
  const contentBase64 = arrayBufferToBase64(buffer);

  const { data, error } = await supabase.functions.invoke('user-upload-state', {
    body: {
      action: 'uploadPdf',
      fileId,
      fileName: file.name,
      contentBase64,
      contentType: file.type || 'application/pdf',
    },
  });

  if (error) {
    throw new Error(error.message);
  }

  return {
    storagePath: data?.storagePath,
    signedUrl: data?.signedUrl,
  };
}

export async function uploadPersistedPdf(file: File, fileId: string): Promise<{ storagePath: string; signedUrl?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('user-upload-state', {
      body: {
        action: 'createPdfUploadUrl',
        fileId,
        fileName: file.name,
      },
    });

    if (error) {
      throw new Error(error.message);
    }

    const storagePath = data?.storagePath as string | undefined;
    const token = data?.token as string | undefined;

    if (!storagePath || !token) {
      throw new Error('Upload URL could not be created for this PDF.');
    }

    const { error: uploadError } = await supabase.storage
      .from('schedule-uploaded-pdfs')
      .uploadToSignedUrl(storagePath, token, file, {
        contentType: file.type || 'application/pdf',
        upsert: true,
      });

    if (uploadError) {
      throw new Error(uploadError.message);
    }

    const { data: signedUrlData, error: signedUrlError } = await supabase.functions.invoke('user-upload-state', {
      body: {
        action: 'getPdfSignedUrl',
        storagePath,
      },
    });

    if (signedUrlError) {
      throw new Error(signedUrlError.message);
    }

    return {
      storagePath,
      signedUrl: signedUrlData?.signedUrl,
    };
  } catch (error) {
    console.warn('Signed PDF upload flow failed, falling back to legacy edge-function upload.', error);
    return uploadPersistedPdfLegacy(file, fileId);
  }
}

export async function deletePersistedPdf(storagePath: string) {
  const { error } = await supabase.functions.invoke('user-upload-state', {
    method: 'DELETE',
    body: {
      action: 'deletePdf',
      storagePath,
    },
  });

  if (error) {
    throw new Error(error.message);
  }
}
