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

type ThemeMatchRejection = {
  match: ThemeMatch;
  reason: string;
};

function createRequestId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function summarizeRow(row: PdfThemeVisionRow) {
  return {
    day: row.day || '',
    time: row.time || '',
    className: row.className || '',
    trainer: row.trainer || '',
    theme: row.theme || '',
    uniqueKey: row.uniqueKey || '',
  };
}

function summarizePageImage(image: PdfThemePageImage) {
  const imageDataUrl = image.imageDataUrl || '';
  const mimeMatch = imageDataUrl.match(/^data:([^;]+);/);
  return {
    pageIndex: image.pageIndex ?? 0,
    mimeType: mimeMatch?.[1] || '',
    dataUrlLength: imageDataUrl.length,
  };
}

function summarizeMatch(match: ThemeMatch) {
  return {
    day: match.day,
    time: match.time,
    className: match.className,
    trainer: match.trainer,
    theme: match.theme,
    confidence: match.confidence,
  };
}

function normalizeSimpleText(value: string | undefined): string {
  return (value || '')
    .toLowerCase()
    .replace(/^studio\s+/i, '')
    .replace(/[()[\]{}]/g, ' ')
    .replace(/[^a-z0-9\s'/:]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeThemeName(theme: string | undefined): string {
  return (theme || '')
    .replace(/[⚡✨⭐🔥💥🎵🎶]\uFE0F?/gu, ' ')
    .replace(/[()[\]{}]/g, ' ')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/gi, ' ')
    .replace(/\bthe\s*week(?:e)?nd\b/gi, 'the weeknd')
    .replace(/\bweekend\b/gi, 'weeknd')
    .replace(/\bvs\b/gi, ' vs ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeTimeForKey(value: string | undefined): string {
  const raw = (value || '').trim();
  if (!raw) return '';

  const twentyFourHour = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (twentyFourHour) {
    return `${twentyFourHour[1].padStart(2, '0')}:${twentyFourHour[2]}`;
  }

  const twelveHour = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (!twelveHour) return raw;

  let hours = Number(twelveHour[1]);
  const minutes = twelveHour[2] || '00';
  const period = twelveHour[3].toUpperCase();
  if (period === 'PM' && hours !== 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;

  return `${String(hours).padStart(2, '0')}:${minutes}`;
}

function fullRowKey(row: Pick<PdfThemeVisionRow, 'day' | 'time' | 'className' | 'trainer'>): string {
  return [
    normalizeSimpleText(row.day),
    normalizeTimeForKey(row.time),
    normalizeSimpleText(row.className),
    normalizeSimpleText(row.trainer),
  ].join('|');
}

function partialRowKey(row: Pick<PdfThemeVisionRow, 'day' | 'time' | 'className'>): string {
  return [
    normalizeSimpleText(row.day),
    normalizeTimeForKey(row.time),
    normalizeSimpleText(row.className),
  ].join('|');
}

function incrementCount(counts: Map<string, number>, key: string) {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

function filterThemeMatches(
  matches: ThemeMatch[],
  rows: PdfThemeVisionRow[],
  themeCandidates: string[]
): { matches: ThemeMatch[]; rejected: ThemeMatchRejection[] } {
  const candidateByNormalizedTheme = new Map(
    themeCandidates.map(candidate => [normalizeThemeName(candidate), candidate])
  );
  const rowFullKeys = new Set(rows.map(fullRowKey));
  const rowPartialKeyCounts = new Map<string, number>();
  rows.forEach(row => incrementCount(rowPartialKeyCounts, partialRowKey(row)));

  const accepted: ThemeMatch[] = [];
  const rejected: ThemeMatchRejection[] = [];

  for (const match of matches) {
    let theme = match.theme.trim();

    if (candidateByNormalizedTheme.size > 0) {
      const canonicalTheme = candidateByNormalizedTheme.get(normalizeThemeName(theme));
      if (!canonicalTheme) {
        rejected.push({
          match,
          reason: 'theme did not exactly match one of the CSV theme candidates',
        });
        continue;
      }
      theme = canonicalTheme;
    }

    const exactKey = fullRowKey(match);
    const partialKey = partialRowKey(match);
    const partialCount = rowPartialKeyCounts.get(partialKey) ?? 0;
    if (!rowFullKeys.has(exactKey) && partialCount !== 1) {
      rejected.push({
        match,
        reason: `row did not match exactly and partial day/time/class key matched ${partialCount} PDF rows`,
      });
      continue;
    }

    accepted.push({ ...match, theme });
  }

  const matchesByAssignment = new Map<string, ThemeMatch[]>();
  accepted.forEach(match => {
    const exactKey = fullRowKey(match);
    const assignmentKey = rowFullKeys.has(exactKey)
      ? `exact:${exactKey}`
      : `partial:${partialRowKey(match)}`;
    matchesByAssignment.set(assignmentKey, [
      ...(matchesByAssignment.get(assignmentKey) || []),
      match,
    ]);
  });

  const unambiguousAccepted: ThemeMatch[] = [];
  for (const assignmentMatches of matchesByAssignment.values()) {
    const bestByTheme = new Map<string, ThemeMatch>();

    for (const match of assignmentMatches) {
      const normalizedTheme = normalizeThemeName(match.theme);
      const current = bestByTheme.get(normalizedTheme);
      if (!current || match.confidence > current.confidence) {
        bestByTheme.set(normalizedTheme, match);
      }
    }

    if (bestByTheme.size === 1) {
      unambiguousAccepted.push([...bestByTheme.values()][0]);
      continue;
    }

    rejected.push(
      ...assignmentMatches.map(match => ({
        match,
        reason: 'multiple different themes matched the same PDF row assignment',
      }))
    );
  }

  const overassignedThreshold = Math.max(8, Math.ceil(rows.length * 0.15));
  const matchesByTheme = new Map<string, ThemeMatch[]>();
  unambiguousAccepted.forEach(match => {
    const key = normalizeThemeName(match.theme);
    matchesByTheme.set(key, [...(matchesByTheme.get(key) || []), match]);
  });

  const overassignedThemes = new Set(
    [...matchesByTheme.entries()]
      .filter(([, themeMatches]) => themeMatches.length > overassignedThreshold)
      .map(([theme]) => theme)
  );

  if (overassignedThemes.size === 0) {
    return { matches: unambiguousAccepted, rejected };
  }

  return {
    matches: unambiguousAccepted.filter(match => !overassignedThemes.has(normalizeThemeName(match.theme))),
    rejected: [
      ...rejected,
      ...unambiguousAccepted
        .filter(match => overassignedThemes.has(normalizeThemeName(match.theme)))
        .map(match => ({
          match,
          reason: `theme was assigned to too many rows (${matchesByTheme.get(normalizeThemeName(match.theme))?.length || 0}; threshold ${overassignedThreshold})`,
        })),
    ],
  };
}

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

  const candidatesByTheme = new Map<string, string>();

  for (const candidate of themeCandidates) {
    if (typeof candidate !== 'string') continue;

    const label = candidate.trim();
    const normalized = normalizeThemeName(label);
    if (!label || !normalized || candidatesByTheme.has(normalized)) continue;

    candidatesByTheme.set(normalized, label);
  }

  return [...candidatesByTheme.values()].slice(0, 80);
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
  const requestId = createRequestId();

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

    console.info('[pdf-theme-vision] request received', {
      requestId,
      rowCount: rows.length,
      rowsWithExistingTheme: rows.filter(row => row.theme?.trim()).length,
      pageImageCount: pageImages.length,
      themeCandidateCount: themeCandidates.length,
      themeCandidates,
      pageImages: pageImages.map(summarizePageImage),
    });

    console.info('[pdf-theme-vision] rows to enrich', {
      requestId,
      rows: rows.map(summarizeRow),
    });

    if (rows.length === 0) {
      console.warn('[pdf-theme-vision] no valid rows after sanitization', { requestId });
      return new Response(JSON.stringify({ matches: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (pageImages.length === 0) {
      throw new Error('No rendered PDF page images were provided for visual theme extraction.');
    }

    const apiKey = getOpenAiApiKey();
    const model = Deno.env.get('OPENAI_VISION_MODEL')?.trim() || DEFAULT_MODEL;
    const themeSchema = themeCandidates.length > 0
      ? { type: 'string', enum: themeCandidates }
      : { type: 'string' };

    console.info('[pdf-theme-vision] invoking OpenAI vision model', {
      requestId,
      model,
      rowCount: rows.length,
      pageImageCount: pageImages.length,
    });

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
          'A legend label by itself is not a class-row match. Only return a class row when that row has its own visible inline theme tag or visible row marker/strip/dot that clearly maps to the legend color.',
          'Do not assign one visible legend/theme label to every class on the page, column, day, or full schedule.',
          'Do not return partial theme fragments or concatenated theme names.',
          'Return at most one theme for a parsed PDF row. If multiple theme candidates seem possible for one row, omit that row.',
          'Do not infer or invent themes. If a class has no visible theme indicator, omit it.',
          themeCandidates.length
            ? 'The theme field must be exactly one of the known CSV theme names listed below.'
            : 'Use the exact visible theme text as printed.',
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
                      theme: themeSchema,
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
      console.error('[pdf-theme-vision] OpenAI request failed', {
        requestId,
        status: response.status,
        responsePayload,
      });
      throw new Error(`OpenAI vision request failed (${response.status}): ${JSON.stringify(responsePayload)}`);
    }

    const outputText = extractOutputText(responsePayload);
    const rawMatches = parseThemeMatches(responsePayload);
    const filtered = filterThemeMatches(rawMatches, rows, themeCandidates);

    console.info('[pdf-theme-vision] OpenAI response parsed', {
      requestId,
      outputTextLength: outputText.length,
      outputTextPreview: outputText.slice(0, 1200),
      rawMatchCount: rawMatches.length,
      returnedMatchCount: filtered.matches.length,
      rejectedMatchCount: filtered.rejected.length,
      rawMatches: rawMatches.map(summarizeMatch),
      returnedMatches: filtered.matches.map(summarizeMatch),
      rejectedMatches: filtered.rejected.map(item => ({
        match: summarizeMatch(item.match),
        reason: item.reason,
      })),
    });

    return new Response(JSON.stringify({
      matches: filtered.matches,
      rejected: filtered.rejected,
      requestId,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('pdf-theme-vision error', { requestId, error });
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Internal server error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
