import { supabase } from '../lib/supabase';

export async function listAccessibleSites() {
  const { data, error } = await supabase
    .from('sites')
    .select('id, name, type')
    .order('name', { ascending: true });

  if (error) {
    throw error;
  }

  return data ?? [];
}
