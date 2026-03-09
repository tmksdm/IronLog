// src/lib/supabase.ts

/**
 * Supabase client singleton.
 * URL and anon key are public — security is enforced via RLS on the server.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://khnepdfkjwpxwtbjvqiv.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtobmVwZGZrandweHd0Ymp2cWl2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwNTg0NTAsImV4cCI6MjA4ODYzNDQ1MH0.3eOC_PhzRWZXpBPH6vO57HUauM-g1vOGXqB-AkNEViU';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
