import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://qhsxtpywfczqopcimykk.supabase.co'
const SUPABASE_KEY = 'sb_publishable_eXj0rGtAqMRX2Q3B9kgc1w_CE8rzWei'

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  global: {
    fetch: (url, options = {}) => fetch(url, { ...options, cache: 'no-store' }),
  },
})
