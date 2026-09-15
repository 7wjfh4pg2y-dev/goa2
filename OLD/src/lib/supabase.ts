import { createClient } from '@supabase/supabase-js'

// Supabase project for the Guards of Atlantis II digital table.
//
// The anon/public key is intended to be embedded in client-side code — it is
// shipped in the browser bundle regardless of where it lives. Real access
// control is enforced by Row-Level Security (RLS) and Realtime authorization,
// which we configure on the database side (Phase 1+), NOT by hiding this key.
//
// Never put the service_role / secret key or the database password in here.
export const SUPABASE_URL = 'https://fsbnndmryjbowquzdtfq.supabase.co'
export const SUPABASE_ANON_KEY =
	'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZzYm5uZG1yeWpib3dxdXpkdGZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkwMTkzNTcsImV4cCI6MjEwNDU5NTM1N30.o6rbm5kdo8g0FMbYVxRjXschvzf9Ee1ieNjcXXR-A9A'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
	realtime: {
		// Keep cursor updates snappy without flooding the free-tier limits.
		params: { eventsPerSecond: 30 },
	},
})
