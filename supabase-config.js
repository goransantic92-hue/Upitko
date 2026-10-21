// Upitko CRM — Supabase Klijentska Konfiguracija
// Automatski povlači ključeve iz Vercel Environment Variables (/api/config) ili iz browser memorije

window.UPITKO_CONFIG = {
  supabaseUrl: localStorage.getItem('upitko_supabase_url') || '',
  supabaseAnonKey: localStorage.getItem('upitko_supabase_anon_key') || '',
  
  isConfigured: function() {
    return Boolean(this.supabaseUrl && this.supabaseAnonKey);
  },

  saveConfig: function(url, anonKey) {
    if (url) localStorage.setItem('upitko_supabase_url', url.trim());
    if (anonKey) localStorage.setItem('upitko_supabase_anon_key', anonKey.trim());
    this.supabaseUrl = url ? url.trim() : '';
    this.supabaseAnonKey = anonKey ? anonKey.trim() : '';
    window._supabaseInstance = null; // reset instance
  },

  // Automatsko preuzimanje sa Vercel Environment Variables
  fetchServerConfig: async function() {
    if (this.isConfigured()) return true;
    try {
      const res = await fetch('/api/config');
      if (res.ok) {
        const data = await res.json();
        if (data.supabaseUrl && data.supabaseAnonKey) {
          this.supabaseUrl = data.supabaseUrl;
          this.supabaseAnonKey = data.supabaseAnonKey;
          return true;
        }
      }
    } catch (_e) {}
    return false;
  }
};

// Automatski pokreni proveru sa servera pri učitavanju
if (!window.UPITKO_CONFIG.isConfigured()) {
  window.UPITKO_CONFIG.fetchServerConfig().then((ok) => {
    if (ok) console.info('[Upitko] Supabase automatski učitan iz Vercel Environment Variables!');
  });
}

// Inicijalizacija Supabase klijenta
window.getSupabase = function() {
  if (!window.supabase) {
    console.warn('[Upitko] Supabase biblioteka nije učitana.');
    return null;
  }
  if (!window.UPITKO_CONFIG.isConfigured()) {
    return null;
  }
  if (!window._supabaseInstance) {
    window._supabaseInstance = window.supabase.createClient(
      window.UPITKO_CONFIG.supabaseUrl,
      window.UPITKO_CONFIG.supabaseAnonKey
    );
  }
  return window._supabaseInstance;
};
