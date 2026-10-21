// Upitko — Javna konfiguracija za klijentski frontend (Vercel)
// Vraća sanitizovan Supabase URL i javni Anon ključ unete u Vercel Environment Variables

function cleanSupabaseUrl(rawUrl) {
  if (!rawUrl) return '';
  let url = String(rawUrl).trim();

  // Ako je unet dashboard link iz browsera: https://supabase.com/dashboard/project/<ref>
  const dashMatch = url.match(/supabase\.com\/dashboard\/project\/([a-zA-Z0-9_-]+)/);
  if (dashMatch) {
    return 'https://' + dashMatch[1] + '.supabase.co';
  }

  url = url.replace(/\/rest\/v1\/?$/, '').replace(/\/auth\/v1\/?$/, '').replace(/\/+$/, '');
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }
  return url;
}

function cleanSupabaseKey(rawKey) {
  if (!rawKey) return '';
  return String(rawKey).trim().replace(/^['"]|['"]$/g, '');
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const rawUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const rawKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  const supabaseUrl = cleanSupabaseUrl(rawUrl);
  const supabaseAnonKey = cleanSupabaseKey(rawKey);

  return res.status(200).json({
    supabaseUrl,
    supabaseAnonKey,
    configured: Boolean(supabaseUrl && supabaseAnonKey)
  });
};
