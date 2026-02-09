import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://oleiodivubhtcagrlfug.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9sZWlvZGl2dWJodGNhZ3JsZnVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzgwMzQwNTYsImV4cCI6MjA1MzYxMDA1Nn0.3yzD0c4xXo59AkSmLcWwXqNSzjhbXCNCl4-M_2cCqGw';

export const supabase = createClient(supabaseUrl, supabaseKey);

export async function invokeMomenceFunction(startDate?: string, endDate?: string) {
  const { data, error } = await supabase.functions.invoke('momence-sessions', {
    body: { startDate, endDate },
  });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}
