// Upitko — Serverless Lead Capture API (Vercel)
// Renders directly on Vercel as /api/lead

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
  // Postavljanje CORS hedera
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      ok: false,
      error: 'Method not allowed. Pošaljite POST zahtev sa podacima prijave.'
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

    const {
      ime,
      name,
      email,
      firma,
      company,
      telefon,
      phone,
      paket,
      plan,
      poruka,
      message,
      formType,
      source
    } = body;

    const contactName = (ime || name || '').trim();
    const contactEmail = (email || '').trim().toLowerCase();
    const contactCompany = (firma || company || '').trim();
    const contactPhone = (telefon || phone || '').trim();
    const contactPlan = (paket || plan || '').trim();
    const contactMsg = (poruka || message || '').trim();
    const type = formType || 'opsti-upit';

    // Osnovna validacija: mora postojati bar email ili telefon
    if (!contactEmail && !contactPhone) {
      return res.status(400).json({
        ok: false,
        error: 'Molimo unesite barem email adresu ili broj telefona.'
      });
    }

    const leadId = 'LID-' + Date.now().toString(36).toUpperCase() + '-' + Math.floor(100 + Math.random() * 900);
    const timestamp = new Date().toISOString();

    const lead = {
      id: leadId,
      name: contactName || 'Anonimni posetilac',
      email: contactEmail,
      phone: contactPhone,
      company: contactCompany || 'Nije navedeno',
      plan: contactPlan || 'Standard',
      message: contactMsg,
      formType: type,
      source: source || 'Upitko Web Sajt',
      createdAt: timestamp,
      status: 'novi'
    };

    // 1. Zapis u Vercel Function Logs (uvek dostupno u Vercel dashboardu)
    console.log('[UPITKO LEAD]', JSON.stringify(lead, null, 2));

    // 2. Automatski upis u Supabase PostgreSQL bazu radnog prostora
    const rawSbUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    const sbUrl = cleanSupabaseUrl(rawSbUrl);

    if (sbUrl && sbKey) {
      try {
        const orgRes = await fetch(`${sbUrl}/rest/v1/organizations?select=id,name&order=created_at.desc&limit=1`, {
          headers: {
            'apikey': sbKey,
            'Authorization': `Bearer ${sbKey}`
          }
        });
        const orgs = await orgRes.json();
        if (Array.isArray(orgs) && orgs.length > 0) {
          const targetOrg = orgs[0];
          await fetch(`${sbUrl}/rest/v1/leads`, {
            method: 'POST',
            headers: {
              'apikey': sbKey,
              'Authorization': `Bearer ${sbKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              organization_id: targetOrg.id,
              contact_name: contactName || 'Novi kontakt sa sajta',
              company_name: contactCompany || null,
              email: contactEmail || null,
              phone: contactPhone || null,
              channel: 'web',
              stage: 'novi',
              value_rsd: 180000,
              notes: `Prijava sa marketing sajta (${type}). Paket: ${contactPlan || '/'}. Poruka: ${contactMsg || '/'}`
            })
          });
          console.log('[Upitko] Lid uspešno upisan u Supabase za firmu:', targetOrg.name);
        }
      } catch (sbErr) {
        console.warn('[Upitko] Supabase lead insert greška:', sbErr.message);
      }
    }

    // 3. Ako je postavljen TELEGRAM_BOT_TOKEN i TELEGRAM_CHAT_ID, pošalji instant poruku na Telegram
    if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
      try {
        const tgText = `🚀 *Novi Upitko Lid!* (${lead.formType})\n\n` +
          `👤 *Ime:* ${lead.name}\n` +
          `🏢 *Firma:* ${lead.company}\n` +
          `✉️ *Email:* ${lead.email || '/'}\n` +
          `📞 *Telefon:* ${lead.phone || '/'}\n` +
          `📦 *Paket:* ${lead.plan}\n` +
          (lead.message ? `💬 *Poruka:* ${lead.message}\n` : '') +
          `🕒 *Vreme:* ${new Date().toLocaleString('sr-RS', { timeZone: 'Europe/Belgrade' })}`;

        await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: process.env.TELEGRAM_CHAT_ID,
            text: tgText,
            parse_mode: 'Markdown'
          })
        });
      } catch (tgErr) {
        console.error('[Upitko] Telegram alert failed:', tgErr.message);
      }
    }

    // 4. Ako je postavljen LEAD_WEBHOOK_URL (Zapier, Make, Slack, Google Sheets, n8n)
    if (process.env.LEAD_WEBHOOK_URL) {
      try {
        await fetch(process.env.LEAD_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(lead)
        });
      } catch (hookErr) {
        console.error('[Upitko] Webhook forward failed:', hookErr.message);
      }
    }

    // 5. Ako je postavljen RESEND_API_KEY i NOTIFY_EMAIL
    if (process.env.RESEND_API_KEY && process.env.NOTIFY_EMAIL) {
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.RESEND_API_KEY}`
          },
          body: JSON.stringify({
            from: process.env.RESEND_FROM || 'Upitko Notifikacije <onboarding@resend.dev>',
            to: [process.env.NOTIFY_EMAIL],
            subject: `[Upitko CRM] Novi lid: ${lead.name} (${lead.company})`,
            html: `
              <h2>Novi lid primljen sa sajta Upitko!</h2>
              <table style="border-collapse:collapse;width:100%;font-family:sans-serif">
                <tr><td style="padding:8px;font-weight:bold">ID:</td><td style="padding:8px">${lead.id}</td></tr>
                <tr><td style="padding:8px;font-weight:bold">Ime:</td><td style="padding:8px">${lead.name}</td></tr>
                <tr><td style="padding:8px;font-weight:bold">Firma:</td><td style="padding:8px">${lead.company}</td></tr>
                <tr><td style="padding:8px;font-weight:bold">Email:</td><td style="padding:8px"><a href="mailto:${lead.email}">${lead.email}</a></td></tr>
                <tr><td style="padding:8px;font-weight:bold">Telefon:</td><td style="padding:8px"><a href="tel:${lead.phone}">${lead.phone}</a></td></tr>
                <tr><td style="padding:8px;font-weight:bold">Paket:</td><td style="padding:8px">${lead.plan}</td></tr>
                <tr><td style="padding:8px;font-weight:bold">Tip forme:</td><td style="padding:8px">${lead.formType}</td></tr>
                <tr><td style="padding:8px;font-weight:bold">Poruka:</td><td style="padding:8px">${lead.message || '/'}</td></tr>
                <tr><td style="padding:8px;font-weight:bold">Vreme:</td><td style="padding:8px">${lead.createdAt}</td></tr>
              </table>
            `
          })
        });
      } catch (mailErr) {
        console.error('[Upitko] Email forward failed:', mailErr.message);
      }
    }

    return res.status(200).json({
      ok: true,
      leadId: lead.id,
      message: 'Hvala! Vaša prijava je uspešno zabeležena. Javićemo vam se uskoro.'
    });

  } catch (error) {
    console.error('[Upitko] Greška pri obradi lida:', error);
    return res.status(500).json({
      ok: false,
      error: 'Došlo je do greške na serveru. Pokušajte ponovo kasnije.'
    });
  }
};
