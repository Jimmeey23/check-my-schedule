import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

declare const Deno: {
  env: {
    get(name: string): string | undefined;
  };
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const DEFAULT_MODEL = 'gpt-5-nano';

type PdfThemeVisionRow = {
  day?: string;
  time?: string;
  className?: string;
  trainer?: string;
  location?: string;
  theme?: string;
  uniqueKey?: string;
};

type PdfThemePageImage = {
  pageIndex?: number;
  imageDataUrl?: string;
};

type ThemeMatch = {
  day: string;
  time: string;
  className: string;
  trainer: string;
  theme: string;
  confidence: number;
};

function getOpenAiApiKey(): string {
  const value = Deno.env.get('OPENAI_API_KEY')?.trim();
  if (!value) {
    throw new Error('Missing required environment variable: OPENAI_API_KEY');
  }
  return value;
}

function sanitizeRows(rows: unknown): PdfThemeVisionRow[] {
  if (!Array.isArray(rows)) return [];

  return rows.slice(0, 250).map(row => {
    const source = row && typeof row === 'object' ? row as Record<string, unknown> : {};
    return {
      day: typeof source.day === 'string' ? source.day : '',
      time: typeof source.time === 'string' ? source.time : '',
      className: typeof source.className === 'string' ? source.className : '',
      trainer: typeof source.trainer === 'string' ? source.trainer : '',
      location: typeof source.location === 'string' ? source.location : '',
      theme: typeof source.theme === 'string' ? source.theme : '',
      uniqueKey: typeof source.uniqueKey === 'string' ? source.uniqueKey : '',
    };
  }).filter(row => row.day && row.time && row.className);
}

function sanitizePageImages(pageImages: unknown): PdfThemePageImage[] {
  if (!Array.isArray(pageImages)) return [];

  return pageImages.slice(0, 6).map(image => {
    const source = image && typeof image === 'object' ? image as Record<string, unknown> : {};
    return {
      pageIndex: typeof source.pageIndex === 'number' ? source.pageIndex : 0,
      imageDataUrl: typeof source.imageDataUrl === 'string' ? source.imageDataUrl : '',
    };
  }).filter(image => image.imageDataUrl?.startsWith('data:image/'));
}

function sanitizeThemeCandidates(themeCandidates: unknown): string[] {
  if (!Array.isArray(themeCandidates)) return [];

  return Array.from(new Set(
    themeCandidates
      .filter(candidate => typeof candidate === 'string')
      .map(candidate => candidate.trim())
      .filter(Boolean)
  )).slice(0, 80);
}

function extractOutputText(responsePayload: unknown): string {
  if (!responsePayload || typeof responsePayload !== 'object') return '';

  const directText = (responsePayload as { output_text?: unknown }).output_text;
  if (typeof directText === 'string') return directText;

  const output = (responsePayload as { output?: unknown }).output;
  if (!Array.isArray(output)) return '';

  for (const item of output) {
    const content = item && typeof item === 'object' ? (item as { content?: unknown }).content : undefined;
    if (!Array.isArray(content)) continue;

    for (const contentItem of content) {
      if (!contentItem || typeof contentItem !== 'object') continue;
      const text = (contentItem as { text?: unknown }).text;
      if (typeof text === 'string') return text;
    }
  }

  return '';
}

function parseThemeMatches(responsePayload: unknown): ThemeMatch[] {
  const outputText = extractOutputText(responsePayload);
  const parsed = outputText ? JSON.parse(outputText) : { matches: [] };

  const matches = typeof parsed === 'object' && parsed && Array.isArray((parsed as { matches?: unknown }).matches)
    ? (parsed as { matches: unknown[] }).matches
    : [];

  return matches.map(match => {
    const source = match && typeof match === 'object' ? match as Record<string, unknown> : {};
    return {
      day: typeof source.day === 'string' ? source.day.trim() : '',
      time: typeof source.time === 'string' ? source.time.trim() : '',
      className: typeof source.className === 'string' ? source.className.trim() : '',
      trainer: typeof source.trainer === 'string' ? source.trainer.trim() : '',
      theme: typeof source.theme === 'string' ? source.theme.trim() : '',
      confidence: typeof source.confidence === 'number' ? source.confidence : 0,
    };
  }).filter(match => match.day && match.time && match.className && match.theme && match.confidence >= 0);
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json();
    const rows = sanitizeRows(body?.rows);
    const pageImages = sanitizePageImages(body?.pageImages);
    const themeCandidates = sanitizeThemeCandidates(body?.themeCandidates);

    if (rows.length === 0) {
      return new Response(JSON.stringify({ matches: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (pageImages.length === 0) {
      throw new Error('No rendered PDF page images were provided for visual theme extraction.');
    }

    const apiKey = getOpenAiApiKey();
    const model = Deno.env.get('OPENAI_VISION_MODEL')?.trim() || DEFAULT_MODEL;
    const candidateText = themeCandidates.length
      ? `Known CSV theme names, if visible in the PDF or legend: ${themeCandidates.join(' | ')}`
      : 'No CSV theme candidates were provided. Extract only theme names visibly present in the PDF image.';

    const inputContent = [
      {
        type: 'input_text',
        text: [
          'You are extracting visible theme names from Physique 57 schedule PDF images.',
          'Return only themes that are visibly printed in the page image, including themes in colored legend labels and inline theme tags.',
          'Match each theme to the correct class row by day, time, class name, trainer, and color/legend relationship.',
          'Do not infer or invent themes. If a class has no visible theme indicator, omit it.',
          'Use 24-hour HH:mm times in the JSON if the supplied row uses that format.',
          candidateText,
          `Parsed PDF rows to enrich:\n${JSON.stringify(rows)}`,
        ].join('\n'),
      },
      ...pageImages.map(image => ({
        type: 'input_image',
        image_url: image.imageDataUrl,
        detail: 'high',
      })),
    ];

    const response = await fetch(OPENAI_RESPONSES_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: 'user',
            content: inputContent,
          },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'pdf_theme_matches',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                matches: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      day: { type: 'string' },
                      time: { type: 'string' },
                      className: { type: 'string' },
                      trainer: { type: 'string' },
                      theme: { type: 'string' },
                      confidence: { type: 'number', minimum: 0, maximum: 1 },
                    },
                    required: ['day', 'time', 'className', 'trainer', 'theme', 'confidence'],
                  },
                },
              },
              required: ['matches'],
            },
          },
        },
      }),
    });

    const responsePayload = await response.json().catch(async () => ({ error: await response.text() }));
    if (!response.ok) {
      throw new Error(`OpenAI vision request failed (${response.status}): ${JSON.stringify(responsePayload)}`);
    }

    return new Response(JSON.stringify({ matches: parseThemeMatches(responsePayload) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('pdf-theme-vision error', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Internal server error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
