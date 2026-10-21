// Upitko CRM — Supabase Klijentska Konfiguracija
// Automatski sanitizuje i ispravlja URL i povlači ključeve iz Vercel-a ili browser memorije

function cleanSupabaseUrl(rawUrl) {
  if (!rawUrl) return '';
  let url = String(rawUrl).trim();

  // Ako je korisnik slučajno kopirao link iz browsera: https://supabase.com/dashboard/project/<ref>
  const dashMatch = url.match(/supabase\.com\/dashboard\/project\/([a-zA-Z0-9_-]+)/);
  if (dashMatch) {
    return 'https://' + dashMatch[1] + '.supabase.co';
  }

  // Ukloni sufikse ako su slučajno dodati (/rest/v1, /auth/v1)
  url = url.replace(/\/rest\/v1\/?$/, '');
  url = url.replace(/\/auth\/v1\/?$/, '');
  // Ukloni kose crte na kraju
  url = url.replace(/\/+$/, '');

  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }
  return url;
}

function cleanSupabaseKey(rawKey) {
  if (!rawKey) return '';
  return String(rawKey).trim().replace(/^['"]|['"]$/g, '');
}

window.UPITKO_CONFIG = {
  supabaseUrl: cleanSupabaseUrl(localStorage.getItem('upitko_supabase_url') || ''),
  supabaseAnonKey: cleanSupabaseKey(localStorage.getItem('upitko_supabase_anon_key') || ''),

  isConfigured: function() {
    return Boolean(this.supabaseUrl && this.supabaseAnonKey);
  },

  saveConfig: function(url, anonKey) {
    const cleanUrl = cleanSupabaseUrl(url);
    const cleanKey = cleanSupabaseKey(anonKey);
    if (cleanUrl) localStorage.setItem('upitko_supabase_url', cleanUrl);
    if (cleanKey) localStorage.setItem('upitko_supabase_anon_key', cleanKey);
    this.supabaseUrl = cleanUrl;
    this.supabaseAnonKey = cleanKey;
    window._supabaseInstance = null; // reset instance
  },

  fetchServerConfig: async function() {
    try {
      const res = await fetch('/api/config');
      if (res.ok) {
        const data = await res.json();
        const serverUrl = cleanSupabaseUrl(data.supabaseUrl);
        const serverKey = cleanSupabaseKey(data.supabaseAnonKey);
        if (serverUrl && serverKey) {
          this.supabaseUrl = serverUrl;
          this.supabaseAnonKey = serverKey;
          return true;
        }
      }
    } catch (_e) {}
    return false;
  }
};

// Automatska provera
window.UPITKO_CONFIG.fetchServerConfig().then((ok) => {
  if (ok) console.info('[Upitko] Supabase automatski učitan i sanitizovan iz Vercel-a:', window.UPITKO_CONFIG.supabaseUrl);
});

// Inicijalizacija Supabase klijenta
window.getSupabase = function() {
  if (!window.supabase) {
    console.warn('[Upitko] Supabase biblioteka nije učitana.');
    return null;
  }
  const url = cleanSupabaseUrl(window.UPITKO_CONFIG.supabaseUrl);
  const key = cleanSupabaseKey(window.UPITKO_CONFIG.supabaseAnonKey);

  if (!url || !key) {
    return null;
  }
  if (!window._supabaseInstance || window._supabaseInstanceUrl !== url) {
    window._supabaseInstance = window.supabase.createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });
    window._supabaseInstanceUrl = url;
  }
  return window._supabaseInstance;
};
