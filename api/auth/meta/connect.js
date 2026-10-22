// Upitko CRM — Meta (Facebook & Instagram) OAuth Connect Initiator
// Endpoint: GET /api/auth/meta/connect?org_id=UUID

module.exports = async function handler(req, res) {
  const orgId = req.query.org_id || '';
  const returnUrl = req.query.return_url || '/app.html#channels';

  const metaAppId = process.env.META_APP_ID || process.env.FACEBOOK_APP_ID;
  const baseUrl = `https://${req.headers.host || 'upitko1.vercel.app'}`;
  const redirectUri = `${baseUrl}/api/auth/meta/callback`;

  // Ako Meta App ID još nije unet u Vercel Environment Variables, prikaži jasno objašnjenje
  if (!metaAppId) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(`
      <!DOCTYPE html>
      <html lang="sr">
      <head>
        <meta charset="UTF-8">
        <title>Povezivanje Meta naloga — Upitko CRM</title>
        <style>
          body { font-family: -apple-system, system-ui, sans-serif; background: #04060f; color: #f3f6ff; padding: 40px 20px; line-height: 1.6; }
          .card { max-width: 580px; margin: 0 auto; background: #0c1226; border: 1px solid rgba(150,175,230,.2); border-radius: 16px; padding: 32px; }
          h2 { color: #5df0a8; margin-top: 0; }
          code { background: rgba(93,240,168,.12); color: #5df0a8; padding: 3px 8px; border-radius: 6px; font-size: 13px; }
          .btn { display: inline-block; background: #5df0a8; color: #04060f; font-weight: 700; text-decoration: none; padding: 10px 20px; border-radius: 999px; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="card">
          <h2>⚙️ Korak za aktivaciju 1-klik Meta prijave</h2>
          <p>Da bi se vaši klijenti (i vaš profil @lenkolino) povezivali na tačno <strong>2 klika</strong> bez ikakvih Webhook-ova i koda, potrebno je da u vaš <strong>Vercel Dashboard (Environment Variables)</strong> unesete:</p>
          <ul>
            <li><code>META_APP_ID</code> (vaš App ID sa developers.facebook.com)</li>
            <li><code>META_APP_SECRET</code> (vaš App Secret)</li>
          </ul>
          <p style="font-size: 13px; color: #9aa6c4;">Ovo firma koja pravi softver uradi samo <strong>jednom</strong>, i od tog trenutka svaki klijent klikne dugme i povezan je u sekundi.</p>
          <a href="/app.html#channels" class="btn">← Nazad u CRM</a>
        </div>
      </body>
      </html>
    `);
  }

  // Zvanični Meta OAuth URL sa svim potrebnim dozvolama za Instagram i Facebook
  const scopes = [
    'pages_show_list',
    'pages_read_engagement',
    'pages_manage_metadata',
    'pages_manage_posts',
    'pages_messaging',
    'instagram_basic',
    'instagram_manage_messages'
  ].join(',');

  const statePayload = Buffer.from(JSON.stringify({ orgId, returnUrl })).toString('base64');
  const oauthUrl = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${metaAppId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&state=${encodeURIComponent(statePayload)}&response_type=code`;

  return res.redirect(302, oauthUrl);
};
