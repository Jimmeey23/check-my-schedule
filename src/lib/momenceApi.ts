// Momence API integration

const CLIENT_ID = 'api-13752-8AYbTllyoq5NMWWQ';
const CLIENT_SECRET = '1dT02Bv303wji6abpL1eGiwaWA7fYAPn';
const USERNAME = 'jimmygonda@gmail.com';
const PASSWORD = 'Jimmeey@123';
const API_BASE = 'https://api.momence.com/api/v2';

const basicAuth = btoa(`${CLIENT_ID}:${CLIENT_SECRET}`);

export interface MomenceSession {
  id: number;
  name: string;
  type: string;
  description: string;
  startsAt: string;
  endsAt: string;
  durationInMinutes: number;
  capacity: number;
  bookingCount: number;
  teacher: {
    id: number;
    firstName: string;
    lastName: string;
    pictureUrl?: string;
  };
  isRecurring: boolean;
  isCancelled: boolean;
  isInPerson: boolean;
  isDraft: boolean;
  inPersonLocation?: {
    id: number;
    name: string;
  };
  onlineStreamUrl?: string;
  onlineStreamPassword?: string;
  bannerImageUrl?: string;
  hostPhotoUrl?: string;
  tags?: Array<{
    id: number;
    name: string;
    isCustomerBadge: boolean;
    badgeLabel: string;
    badgeColor: string;
  }>;
}

export interface MomenceSessionsResponse {
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    sortBy: string;
    sortOrder: string;
  };
  payload: MomenceSession[];
}

let cachedToken: string | null = null;
let tokenExpiry: number | null = null;

async function getAccessToken(): Promise<string> {
  // Return cached token if still valid (with 5 min buffer)
  if (cachedToken && tokenExpiry && Date.now() < tokenExpiry - 5 * 60 * 1000) {
    return cachedToken;
  }

  const response = await fetch(`${API_BASE}/auth/token`, {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'authorization': `Basic ${basicAuth}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'password',
      username: USERNAME,
      password: PASSWORD,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to get access token: ${response.statusText}`);
  }

  const data = await response.json();
  cachedToken = data.access_token;
  // Assume token expires in 1 hour if not specified
  tokenExpiry = Date.now() + (data.expires_in || 3600) * 1000;
  
  return cachedToken;
}

export async function fetchMomenceSessions(
  startDate?: Date,
  endDate?: Date
): Promise<MomenceSession[]> {
  const token = await getAccessToken();
  
  const allSessions: MomenceSession[] = [];
  let page = 0;
  const pageSize = 200;
  let hasMore = true;

  while (hasMore) {
    const url = new URL(`${API_BASE}/host/sessions`);
    url.searchParams.set('page', page.toString());
    url.searchParams.set('pageSize', pageSize.toString());
    url.searchParams.set('sortOrder', 'DESC');
    url.searchParams.set('sortBy', 'startsAt');
    url.searchParams.set('includeCancelled', 'false');

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'accept': 'application/json',
        'authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch sessions: ${response.statusText}`);
    }

    const data: MomenceSessionsResponse = await response.json();
    
    // Filter by date range if provided
    let sessions = data.payload;
    if (startDate || endDate) {
      sessions = sessions.filter(session => {
        const sessionDate = new Date(session.startsAt);
        if (startDate && sessionDate < startDate) return false;
        if (endDate && sessionDate > endDate) return false;
        return true;
      });
    }

    allSessions.push(...sessions);

    // Check if there are more pages
    const totalPages = Math.ceil(data.pagination.totalCount / pageSize);
    hasMore = page < totalPages - 1;
    page++;

    // Safety break to avoid infinite loops
    if (page > 50) break;
  }

  return allSessions;
}

export function parseDateRange(weekStart: string, weekEnd: string): { startDate: Date; endDate: Date } {
  // Parse formats like "Jan 6" or "January 6, 2025"
  const parseDate = (dateStr: string, year?: number): Date => {
    // Try parsing with year first
    let date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      return date;
    }

    // If no year provided, try current year and next year
    const currentYear = year || new Date().getFullYear();
    date = new Date(`${dateStr}, ${currentYear}`);
    if (!isNaN(date.getTime())) {
      return date;
    }

    // Try next year
    date = new Date(`${dateStr}, ${currentYear + 1}`);
    return date;
  };

  const startDate = parseDate(weekStart);
  const endDate = parseDate(weekEnd);

  return { startDate, endDate };
}
