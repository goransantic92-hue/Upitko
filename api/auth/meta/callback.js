// Upitko CRM — Meta (Facebook & Instagram) OAuth Callback Handler
// Endpoint: GET /api/auth/meta/callback?code=...&state=...

function cleanSupabaseUrl(rawUrl) {
  if (!rawUrl) return '';
  let url = String(rawUrl).trim();
  const dashMatch = url.match(/supabase\.com\/dashboard\/project\/([a-zA-Z0-9_-]+)/);
  if (dashMatch) return 'https://' + dashMatch[1] + '.supabase.co';
  url = url.replace(/\/rest\/v1\/?$/, '').replace(/\/auth\/v1\/?$/, '').replace(/\/+$/, '');
  if (!url.startsWith('http://') && !url.startsWith('https://')) url = 'https://' + url;
  return url;
}

function buildRedirectUrl(rawTarget, params = {}) {
  let base = rawTarget || '/app.html';
  let hash = '';
  if (base.includes('#')) {
    const parts = base.split('#');
    base = parts[0];
    hash = '#' + parts[1];
  }
  const sep = base.includes('?') ? '&' : '?';
  const queryStr = Object.entries(params)
    .filter(([_, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  return `${base}${queryStr ? sep + queryStr : ''}${hash}`;
}

module.exports = async function handler(req, res) {
  const { code, state, error, error_description } = req.query;

  let orgId = '';
  let returnUrl = '/app.html#channels';
  if (state) {
    try {
      const decoded = JSON.parse(Buffer.from(state, 'base64').toString('utf8'));
      orgId = decoded.orgId || '';
      returnUrl = decoded.returnUrl || returnUrl;
    } catch (_e) {}
  }

  if (error) {
    console.error('[Meta OAuth Error]', error, error_description);
    return res.redirect(buildRedirectUrl(returnUrl, { error: error_description || error }));
  }

  if (!code) {
    return res.status(400).send('Nedostaje autorizacioni kod.');
  }

  const metaAppId = process.env.META_APP_ID || process.env.FACEBOOK_APP_ID;
  const metaAppSecret = process.env.META_APP_SECRET || process.env.FACEBOOK_APP_SECRET;
  const baseUrl = `https://${req.headers.host || 'upitko1.vercel.app'}`;
  const redirectUri = `${baseUrl}/api/auth/meta/callback`;

  try {
    // 1. Zameni privremeni code za kratkoživeći User Access Token
    const tokenUrl = `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${metaAppId}&client_secret=${metaAppSecret}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${code}`;
    const tokenRes = await fetch(tokenUrl);
    const tokenData = await tokenRes.json();

    if (!tokenRes.ok || !tokenData.access_token) {
      throw new Error(tokenData.error?.message || 'Greška pri preuzimanju Meta tokena.');
    }

    let userAccessToken = tokenData.access_token;

    // 2. Zameni kratkoživeći token za dugoživeći (60 dana)
    try {
      const longUrl = `https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${metaAppId}&client_secret=${metaAppSecret}&fb_exchange_token=${userAccessToken}`;
      const longRes = await fetch(longUrl);
      const longData = await longRes.json();
      if (longData.access_token) userAccessToken = longData.access_token;
    } catch (_longErr) {}

    const rawSupabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseUrl = cleanSupabaseUrl(rawSupabaseUrl);
    const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '').trim();

    // Ako orgId nije prosleđen u state, pronađi poslednje kreiranu organizaciju
    if (!orgId && supabaseUrl && supabaseKey) {
      try {
        const orgRes = await fetch(`${supabaseUrl}/rest/v1/organizations?select=id&order=created_at.desc&limit=1`, {
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`
          }
        });
        const orgList = await orgRes.json();
        if (Array.isArray(orgList) && orgList[0]?.id) {
          orgId = orgList[0].id;
        }
      } catch (_orgErr) {}
    }

    // 3. Preuzmi Facebook Stranice i povezani Instagram Business profil
    const accountsUrl = `https://graph.facebook.com/v19.0/me/accounts?fields=id,name,access_token,instagram_business_account{id,username,name}&access_token=${userAccessToken}`;
    const accountsRes = await fetch(accountsUrl);
    const accountsData = await accountsRes.json();

    const pages = accountsData.data || [];
    let connectedAccounts = [];

    for (const page of pages) {
      const pageToken = page.access_token;

      // 4. Automatski pretplati naš Webhook na poruke ove stranice (Meta Subscribed Apps)
      try {
        await fetch(`https://graph.facebook.com/v19.0/${page.id}/subscribed_apps`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subscribed_fields: ['messages', 'messaging_postbacks'],
            access_token: pageToken
          })
        });
      } catch (_subErr) {
        console.warn('[Meta App Subscription warning]:', _subErr.message);
      }

      // Ako je povezan Instagram profil
      const ig = page.instagram_business_account;
      if (ig) {
        const handle = `@${ig.username || ig.name}`;
        connectedAccounts.push(handle);
        if (supabaseUrl && supabaseKey && orgId) {
          try {
            await fetch(`${supabaseUrl}/rest/v1/channel_connections`, {
              method: 'POST',
              headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
                'Content-Type': 'application/json',
                'Prefer': 'resolution=merge-duplicates'
              },
              body: JSON.stringify({
                organization_id: orgId,
                channel: 'instagram',
                account_identifier: ig.id,
                account_name: handle,
                access_token: pageToken,
                is_active: true,
                metadata: { page_id: page.id, ig_id: ig.id }
              })
            });
          } catch (_dbErr) {}
        }
      }

      // Snimi i Facebook stranicu
      if (supabaseUrl && supabaseKey && orgId) {
        try {
          await fetch(`${supabaseUrl}/rest/v1/channel_connections`, {
            method: 'POST',
            headers: {
              'apikey': supabaseKey,
              'Authorization': `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json',
              'Prefer': 'resolution=merge-duplicates'
            },
            body: JSON.stringify({
              organization_id: orgId,
              channel: 'facebook',
              account_identifier: page.id,
              account_name: page.name,
              access_token: pageToken,
              is_active: true,
              metadata: { page_id: page.id }
            })
          });
        } catch (_dbErr) {}
      }
    }

    if (pages.length === 0 && connectedAccounts.length === 0) {
      // Korisnik se prijavio na Meta, ali nema nijednu povezanu Facebook stranicu sa Instagramom
      return res.redirect(buildRedirectUrl(returnUrl, {
        connected: 'meta_no_pages'
      }));
    }

    const firstConnected = connectedAccounts[0] || (pages[0] ? pages[0].name : 'Meta Stranica');
    return res.redirect(buildRedirectUrl(returnUrl, {
      connected: 'meta',
      account: firstConnected
    }));

  } catch (err) {
    console.error('[Meta OAuth Callback Error]:', err);
    return res.redirect(buildRedirectUrl(returnUrl, { error: err.message }));
  }
};
