import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://niawddsarzcrhfliufmw.supabase.co'
const supabaseKey = 'sb_publishable_BjD8rcZYbKUAABZAWvT1hQ_YL9E_6YD'

export const supabase = createClient(supabaseUrl, supabaseKey)