import { createClient } from '@supabase/supabase-js';
import type { CleanedPdfSheetRow } from '@/lib/cleanedPdfSheet';
import type { PdfClassData } from '@/types/schedule';
import type { PdfThemePageImage, PdfThemeVisionMatch } from '@/lib/pdfThemeVision';

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
