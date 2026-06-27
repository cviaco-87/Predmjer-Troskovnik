import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://hojtbvodaadwofxgayip.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhvanRidm9kYWFkd29meGdheWlwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1Mjc2MzQsImV4cCI6MjA5ODEwMzYzNH0.9FfY4u3B8W_m8ltl3D6_xa78uEp9jOgaMst9JS5gy74'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
