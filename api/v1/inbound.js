// Upitko CRM — Inbound Lead Gateway (Vercel Serverless Function)
// Endpoint: POST /api/v1/inbound
// Klijenti u Srbiji koriste ovaj endpoint za automatski prijem upita sa WordPress/Webflow/custom sajtova, Vibera, IG, FB, WhatsAppa i Emaila

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
  // CORS podrška kako bi klijenti mogli da šalju forme direktno sa svog domena
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Dozvoljen je isključivo POST zahtev za prijem novih upita.'
    });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (_e) {
        body = {};
      }
    }
    body = body || {};

    // 1. Provera API ključa firme
    const apiKey = req.headers['x-api-key'] || req.query.api_key || body.api_key;
    if (!apiKey) {
      return res.status(401).json({
        success: false,
        error: 'Nedostaje API ključ. Prosledite x-api-key heder ili api_key parametar.'
      });
    }

    // Podrška za standardne forme, ManyChat, Make.com, Zapier i Meta webhookove
    const userObj = body.user || {};
    const customFields = body.custom_fields || {};

    let extractedName = (
      body.contact_name ||
      body.name ||
      body.ime ||
      body.full_name ||
      userObj.name ||
      (body.first_name || userObj.first_name ? `${body.first_name || userObj.first_name} ${body.last_name || userObj.last_name || ''}`.trim() : '') ||
      body.username ||
      body.ig_username ||
      userObj.username ||
      ''
    ).trim();

    let extractedMsg = (
      body.notes ||
      body.poruka ||
      body.message ||
      body.last_input_text ||
      body.text ||
      body.last_message ||
      body.caption ||
      customFields.notes ||
      customFields.poruka ||
      ''
    ).trim();

    let extractedPhone = (
      body.phone ||
      body.telefon ||
      userObj.phone ||
      customFields.phone ||
      customFields.telefon ||
      ''
    ).trim();

    let extractedEmail = (
      body.email ||
      userObj.email ||
      customFields.email ||
      ''
    ).trim().toLowerCase();

    let extractedCompany = (
      body.company_name ||
      body.firma ||
      body.company ||
      customFields.company ||
      customFields.firma ||
      ''
    ).trim();

    const igHandle = body.username || userObj.username || body.ig_username;
    const leadName = extractedName || (igHandle ? `@${igHandle}` : 'Instagram kupac');
    const leadEmail = extractedEmail;
    const leadPhone = extractedPhone;
    const leadCompany = extractedCompany || (igHandle ? `@${igHandle} (Instagram)` : null);
    const leadMsg = extractedMsg || 'Novi direktan upit sa Instagram DM-a';
    const leadVal = Number(body.value_rsd || body.vrednost || 180000);
    const leadChannel = (req.query.channel || body.channel || body.kanal || 'instagram').toLowerCase();

    // 2. Ako su podešene Supabase Environment promenljive na Vercelu, upiši direktno u PostgreSQL
    const rawSupabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseUrl = cleanSupabaseUrl(rawSupabaseUrl);
    const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();

    if (supabaseUrl && supabaseKey) {
      const validChannels = ['web', 'viber', 'whatsapp', 'instagram', 'facebook', 'telefon', 'preporuka', 'ostalo'];
      const normalizedChannel = validChannels.includes(leadChannel) ? leadChannel : 'ostalo';

      try {
        // Prvo pokušaj preko RPC funkcije receive_inbound_lead (radi i sa ANON ključem zahvaljujući SECURITY DEFINER)
        const rpcRes = await fetch(`${supabaseUrl}/rest/v1/rpc/receive_inbound_lead`, {
          method: 'POST',
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            p_api_key: apiKey,
            p_contact_name: leadName || 'Novi kontakt sa sajta',
            p_company_name: leadCompany || null,
            p_email: leadEmail || null,
            p_phone: leadPhone || null,
            p_channel: normalizedChannel,
            p_value_rsd: leadVal,
            p_notes: leadMsg || null,
            p_source_url: source_url || req.headers.referer || null
          })
        });

        if (rpcRes.ok) {
          const rpcData = await rpcRes.json();
          if (rpcData && rpcData.success) {
            return res.status(201).json({
              success: true,
              message: 'Upit je uspešno primljen i prosleđen u radni prostor firme!',
              lead_id: rpcData.lead_id,
              organization: rpcData.organization
            });
          }
        }

        // Fallback: Direktna provera organizacije preko API ključa (ako se koristi SERVICE_ROLE_KEY)
        const orgRes = await fetch(`${supabaseUrl}/rest/v1/organizations?api_key=eq.${encodeURIComponent(apiKey)}&select=id,name,webhook_url`, {
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`
          }
        });
        const orgs = await orgRes.json();

        if (!Array.isArray(orgs) || orgs.length === 0) {
          return res.status(401).json({
            success: false,
            error: 'Nevažeći API ključ firme. Proverite podešavanja u Upitko radnom prostoru.'
          });
        }

        const org = orgs[0];

        // Upiši novi lid u tabelu leads
        const insertRes = await fetch(`${supabaseUrl}/rest/v1/leads`, {
          method: 'POST',
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
          },
          body: JSON.stringify({
            organization_id: org.id,
            contact_name: leadName || 'Novi kontakt sa sajta',
            company_name: leadCompany || null,
            email: leadEmail || null,
            phone: leadPhone || null,
            channel: normalizedChannel,
            stage: 'novi',
            value_rsd: leadVal,
            notes: leadMsg,
            source_url: source_url || req.headers.referer || null
          })
        });

        const newLeads = await insertRes.json();
        const createdLead = Array.isArray(newLeads) ? newLeads[0] : newLeads;

        // Ako firma ima eksterni webhook (npr. Telegram, Slack, ERP), prosledi
        if (org.webhook_url) {
          try {
            fetch(org.webhook_url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ event: 'lead.created', lead: createdLead })
            }).catch(() => {});
          } catch (_e) {}
        }

        return res.status(201).json({
          success: true,
          message: 'Upit je uspešno primljen i prosleđen u radni prostor firme!',
          lead_id: createdLead?.id,
          organization: org.name
        });

      } catch (sbError) {
        console.error('[Upitko Inbound Gateway] Greška sa bazom:', sbError);
      }
    }

    // Fallback ako Supabase promenljive nisu ubačene u Vercel
    console.log('[Upitko Inbound Lead Received]', { apiKey, leadName, leadEmail, leadPhone, leadCompany });

    return res.status(200).json({
      success: true,
      message: 'Upit zabeležen u sistemu.',
      demo_mode: true
    });

  } catch (error) {
    console.error('[Upitko Inbound Error]:', error);
    return res.status(500).json({
      success: false,
      error: 'Interna greška pri prijemu lida.'
    });
  }
};
