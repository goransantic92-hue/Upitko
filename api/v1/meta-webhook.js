// Upitko CRM — Zvanični Meta (Instagram & Facebook) Webhook Receiver
// Endpoint: /api/v1/meta-webhook

function cleanSupabaseUrl(rawUrl) {
  if (!rawUrl) return '';
  let url = String(rawUrl).trim();
  const dashMatch = url.match(/supabase\.com\/dashboard\/project\/([a-zA-Z0-9_-]+)/);
  if (dashMatch) return 'https://' + dashMatch[1] + '.supabase.co';
  url = url.replace(/\/rest\/v1\/?$/, '').replace(/\/auth\/v1\/?$/, '').replace(/\/+$/, '');
  if (!url.startsWith('http://') && !url.startsWith('https://')) url = 'https://' + url;
  return url;
}

module.exports = async function handler(req, res) {
  // 1. Zvanična verifikacija Meta Webhook-a (GET Handshake)
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    const expectedToken = process.env.META_VERIFY_TOKEN || 'upitko_meta_verify_2026';

    if (mode === 'subscribe' && token === expectedToken) {
      console.log('[Meta Webhook Verified]');
      res.setHeader('Content-Type', 'text/plain');
      return res.status(200).send(challenge);
    } else {
      console.warn('[Meta Webhook Verification Failed]:', { token, expectedToken });
      return res.status(403).send('Verification token mismatch.');
    }
  }

  // 2. Prijem dolaznih poruka sa Instagrama i Facebooka (POST)
  if (req.method === 'POST') {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (_e) {
        body = {};
      }
    }
    body = body || {};

    // Meta očekuje brz odgovor 200 OK da ne bi ponavljala slanje
    res.status(200).json({ status: 'ok' });

    try {
      const rawSupabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseUrl = cleanSupabaseUrl(rawSupabaseUrl);
      const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '').trim();

      if (!supabaseUrl || !supabaseKey) {
        console.warn('[Meta Webhook] Supabase env promenljive nisu podešene.');
        return;
      }

      const entries = body.entry || [];
      for (const entry of entries) {
        const recipientId = entry.id; // Instagram Business Account ID ili Page ID
        const messagingList = entry.messaging || [];

        for (const event of messagingList) {
          // Ignoriši poruke koje smo mi poslali (echo) ili potvrde čitanja
          if (!event.message || event.message.is_echo) continue;

          const senderId = event.sender?.id;
          const messageText = event.message.text || 'Poslat prilog / medij';
          const isInstagram = body.object === 'instagram' || Boolean(event.recipient?.id && event.sender?.id);

          // 1. Pronađi firmu u bazi koja je vlasnik ovog naloga
          let targetOrgId = null;
          let pageToken = null;
          try {
            const connRes = await fetch(`${supabaseUrl}/rest/v1/channel_connections?account_identifier=eq.${encodeURIComponent(recipientId)}&select=organization_id,access_token`, {
              headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
            });
            const conns = await connRes.json();
            if (Array.isArray(conns) && conns.length > 0) {
              targetOrgId = conns[0].organization_id;
              pageToken = conns[0].access_token;
            }
          } catch (_e) {}

          // Fallback ako još nema upisa u channel_connections: uzmi poslednju kreiranu organizaciju
          if (!targetOrgId) {
            try {
              const orgRes = await fetch(`${supabaseUrl}/rest/v1/organizations?select=id&order=created_at.desc&limit=1`, {
                headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
              });
              const orgs = await orgRes.json();
              if (Array.isArray(orgs) && orgs.length > 0) targetOrgId = orgs[0].id;
            } catch (_e) {}
          }

          if (!targetOrgId) continue;

          // 2. Ako imamo token, pokušaj da saznaš pravo ime/username kupca sa Meta Graph API
          let senderName = `Kupac (${senderId.slice(-4)})`;
          if (pageToken) {
            try {
              const userRes = await fetch(`https://graph.facebook.com/v19.0/${senderId}?fields=name,first_name,last_name,username&access_token=${pageToken}`);
              if (userRes.ok) {
                const userData = await userRes.json();
                senderName = userData.name || (userData.username ? `@${userData.username}` : senderName);
              }
            } catch (_uErr) {}
          }

          // 3. Upiši novi upit u tabelu leads
          await fetch(`${supabaseUrl}/rest/v1/leads`, {
            method: 'POST',
            headers: {
              'apikey': supabaseKey,
              'Authorization': `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              organization_id: targetOrgId,
              contact_name: senderName,
              company_name: isInstagram ? 'Instagram DM kontakt' : 'Facebook Messenger kontakt',
              channel: isInstagram ? 'instagram' : 'facebook',
              stage: 'novi',
              value_rsd: 180000,
              notes: messageText
            })
          });

          console.log(`[Meta Webhook] Uspešno upisan upit (${senderName}): "${messageText}"`);
        }
      }
    } catch (err) {
      console.error('[Meta Webhook Processing Error]:', err);
    }
    return;
  }

  return res.status(405).send('Method not allowed.');
};
