// Upitko CRM — Supabase Klijentska Konfiguracija
// Zamenite ove vrednosti vašim podacima sa Supabase Dashboard-a: Project Settings -> API

window.UPITKO_CONFIG = {
  // Supabase Project URL (npr. 'https://xyzcompany.supabase.co')
  supabaseUrl: localStorage.getItem('upitko_supabase_url') || '',
  
  // Supabase Anon / Public Key (javni ključ koji je bezbedan za browser)
  supabaseAnonKey: localStorage.getItem('upitko_supabase_anon_key') || '',
  
  // Da li je Supabase konfigurisan
  isConfigured: function() {
    return Boolean(this.supabaseUrl && this.supabaseAnonKey);
  },

  // Čuvanje novih ključeva
  saveConfig: function(url, anonKey) {
    if (url) localStorage.setItem('upitko_supabase_url', url.trim());
    if (anonKey) localStorage.setItem('upitko_supabase_anon_key', anonKey.trim());
    this.supabaseUrl = url;
    this.supabaseAnonKey = anonKey;
  }
};

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
