-- ==============================================================================
-- UPITKO CRM — ŠEMA BAZE PODATAKA (SUPABASE / POSTGRESQL)
-- Region preporuke: EU (Frankfurt) za punu usklađenost sa ZZPL (srpski GDPR)
-- ==============================================================================

-- 1. Omogući UUID ekstenziju
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Tabela: ORGANIZACIJE (Firme / Preduzeća)
CREATE TABLE IF NOT EXISTS public.organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    pib TEXT,                         -- Poreski identifikacioni broj (9 cifara u Srbiji)
    maticni_broj TEXT,                -- Matični broj firme (8 cifara)
    adresa TEXT,
    grad TEXT DEFAULT 'Beograd',
    paket TEXT NOT NULL DEFAULT 'start' CHECK (paket IN ('start', 'rast', 'pro', 'enterprise')),
    api_key UUID UNIQUE DEFAULT uuid_generate_v4(), -- Javni ključ za web forme na sajtu klijenta
    webhook_url TEXT,                 -- Opcioni webhook za prosleđivanje na Telegram/Slack/ERP
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indeks za brzu proveru API ključa pri prijemu lidova sa sajta
CREATE INDEX IF NOT EXISTS idx_organizations_api_key ON public.organizations(api_key);

-- 3. Tabela: KORISNIČKI PROFILI (Povezani sa auth.users u Supabase-u)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    phone TEXT,
    role TEXT NOT NULL DEFAULT 'agent' CHECK (role IN ('owner', 'manager', 'agent')),
    is_active_for_assignment BOOLEAN NOT NULL DEFAULT true, -- Da li prima nove lidove (round-robin)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_org ON public.profiles(organization_id);

-- 4. Tabela: LIDOVI (Prodajne prilike i upiti)
CREATE TABLE IF NOT EXISTS public.leads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    assigned_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    contact_name TEXT NOT NULL,
    company_name TEXT,
    email TEXT,
    phone TEXT,
    channel TEXT NOT NULL DEFAULT 'web' CHECK (channel IN ('web', 'viber', 'whatsapp', 'instagram', 'facebook', 'telefon', 'preporuka', 'ostalo')),
    stage TEXT NOT NULL DEFAULT 'novi' CHECK (stage IN ('novi', 'kvalifikovan', 'ponuda', 'pregovori', 'dobijeno', 'izgubljeno')),
    value_rsd NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    notes TEXT,
    source_url TEXT,
    speed_to_lead_seconds INTEGER,     -- Broj sekundi od prijema do prvog kontakta
    first_response_at TIMESTAMPTZ,     -- Vreme kada je prodavac prvi put pozvao/odgovorio
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leads_org_stage ON public.leads(organization_id, stage);
CREATE INDEX IF NOT EXISTS idx_leads_assigned ON public.leads(assigned_user_id);
CREATE INDEX IF NOT EXISTS idx_leads_created ON public.leads(created_at DESC);

-- 5. Tabela: AKTIVNOSTI I DNEVNIK KOMUNIKACIJE
CREATE TABLE IF NOT EXISTS public.lead_activities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    type TEXT NOT NULL CHECK (type IN ('poziv', 'email', 'viber_poruka', 'sastanak', 'promena_faze', 'beleska')),
    details TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activities_lead ON public.lead_activities(lead_id, created_at DESC);

-- 6. Tabela: PREDRAČUNI I PONUDE (Sa podrškom za NBS IPS QR)
CREATE TABLE IF NOT EXISTS public.invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
    invoice_number TEXT NOT NULL,      -- npr. PR-2026-0042
    amount_rsd NUMERIC(12, 2) NOT NULL,
    vat_rate NUMERIC(4, 2) DEFAULT 20.00,
    status TEXT NOT NULL DEFAULT 'poslat' CHECK (status IN ('nacrt', 'poslat', 'placen', 'storniran')),
    ips_qr_payload TEXT,              -- NBS IPS standardizovan string za QR kod
    due_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoices_org ON public.invoices(organization_id);

-- 7. Tabela: POVEZANI KANALI I TOKENI (Meta OAuth, Viber Bot, itd.)
CREATE TABLE IF NOT EXISTS public.channel_connections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    channel TEXT NOT NULL CHECK (channel IN ('instagram', 'facebook', 'whatsapp', 'viber', 'email', 'web')),
    account_identifier TEXT NOT NULL, -- npr. Instagram business ID, Page ID, Viber Bot Token, @handle
    account_name TEXT,                -- npr. @lenkolino, Moja Firma FB Stranica
    access_token TEXT,                -- Dugoživeći Meta Page Token ili Viber Token
    is_active BOOLEAN NOT NULL DEFAULT true,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(organization_id, channel)
);

CREATE INDEX IF NOT EXISTS idx_channel_conn_org ON public.channel_connections(organization_id);
CREATE INDEX IF NOT EXISTS idx_channel_conn_id ON public.channel_connections(account_identifier);

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) — VIŠEKORISNIČKA IZOLACIJA PODATAKA
-- Nijedna firma ne može ni pod kojim uslovima videti ili menjati podatke druge firme!
-- ==============================================================================

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

-- Helper funkcija: Vraća organization_id ulogovanog korisnika
CREATE OR REPLACE FUNCTION public.current_user_org_id()
RETURNS UUID AS $$
    SELECT organization_id FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- Politike za ORGANIZACIJE
CREATE POLICY "Korisnici mogu čitati podatke svoje firme"
    ON public.organizations FOR SELECT
    USING (id = public.current_user_org_id());

CREATE POLICY "Vlasnici mogu menjati podatke svoje firme"
    ON public.organizations FOR UPDATE
    USING (id = public.current_user_org_id());

-- Politike za PROFILE
CREATE POLICY "Korisnici mogu videti kolege iz svoje firme"
    ON public.profiles FOR SELECT
    USING (organization_id = public.current_user_org_id());

CREATE POLICY "Korisnik može menjati sopstveni profil"
    ON public.profiles FOR UPDATE
    USING (id = auth.uid());

-- Politike za LIDOVE
CREATE POLICY "Korisnici vide lidove svoje firme"
    ON public.leads FOR SELECT
    USING (organization_id = public.current_user_org_id());

CREATE POLICY "Korisnici mogu dodavati lidove u svoju firmu"
    ON public.leads FOR INSERT
    WITH CHECK (organization_id = public.current_user_org_id());

CREATE POLICY "Korisnici mogu ažurirati lidove svoje firme"
    ON public.leads FOR UPDATE
    USING (organization_id = public.current_user_org_id());

CREATE POLICY "Samo vlasnici i menadžeri mogu brisati lidove"
    ON public.leads FOR DELETE
    USING (
        organization_id = public.current_user_org_id()
        AND EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() AND role IN ('owner', 'manager')
        )
    );

-- Politike za AKTIVNOSTI
CREATE POLICY "Korisnici vide aktivnosti vezane za lidove svoje firme"
    ON public.lead_activities FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.leads 
            WHERE leads.id = lead_activities.lead_id 
            AND leads.organization_id = public.current_user_org_id()
        )
    );

CREATE POLICY "Korisnici mogu unositi aktivnosti u svojoj firmi"
    ON public.lead_activities FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.leads 
            WHERE leads.id = lead_activities.lead_id 
            AND leads.organization_id = public.current_user_org_id()
        )
    );

-- Politike za PREDRAČUNE
CREATE POLICY "Korisnici vide predračune svoje firme"
    ON public.invoices FOR SELECT
    USING (organization_id = public.current_user_org_id());

CREATE POLICY "Korisnici mogu kreirati i ažurirati predračune svoje firme"
    ON public.invoices FOR ALL
    USING (organization_id = public.current_user_org_id());

-- ==============================================================================
-- REALTIME ODOBRENJA ZA SUPABASE
-- ==============================================================================
-- Omogućava WebSockets prenos izmena na Kanban tablu uživo
ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_activities;


-- ==============================================================================
-- AUTOMATSKA REGISTRACIJA NOVE FIRME (ONBOARDING FUNKCIJA)
-- Poziva se pri prvoj registraciji vlasnika firme
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_company_signup(
    p_company_name TEXT,
    p_full_name TEXT,
    p_phone TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
    v_org_id UUID;
    v_api_key UUID;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Korisnik mora biti prijavljen za registraciju firme.';
    END IF;

    -- 1. Kreiraj organizaciju
    INSERT INTO public.organizations (name)
    VALUES (p_company_name)
    RETURNING id, api_key INTO v_org_id, v_api_key;

    -- 2. Kreiraj profil vlasnika
    INSERT INTO public.profiles (id, organization_id, full_name, phone, role)
    VALUES (v_user_id, v_org_id, p_full_name, p_phone, 'owner');

    -- Novi klijenti počinju sa potpuno praznim radnim prostorom (0 upita, 0 ponuda)

    RETURN jsonb_build_object(
        'success', true,
        'organization_id', v_org_id,
        'api_key', v_api_key,
        'message', 'Firma je uspešno registrovana sa čistim radnim prostorom!'
    );
END;
$$;

-- ==============================================================================
-- JAVNI INBOUND WEBHOOK RPC (Prijem upita sa sajta / Vibera / IG / FB / WP / Emaila)
-- Koristi api_key organizacije za bezbedan upis upita bez obzira na RLS sesiju
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.receive_inbound_lead(
    p_api_key UUID,
    p_contact_name TEXT,
    p_company_name TEXT DEFAULT NULL,
    p_email TEXT DEFAULT NULL,
    p_phone TEXT DEFAULT NULL,
    p_channel TEXT DEFAULT 'web',
    p_value_rsd NUMERIC DEFAULT 0,
    p_notes TEXT DEFAULT NULL,
    p_source_url TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_org_id UUID;
    v_org_name TEXT;
    v_lead_id UUID;
    v_clean_channel TEXT;
BEGIN
    SELECT id, name INTO v_org_id, v_org_name
    FROM public.organizations
    WHERE api_key = p_api_key
    LIMIT 1;

    IF v_org_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Nevažeći API ključ firme.');
    END IF;

    v_clean_channel := LOWER(COALESCE(p_channel, 'web'));
    IF v_clean_channel NOT IN ('web', 'viber', 'whatsapp', 'instagram', 'facebook', 'telefon', 'preporuka', 'ostalo') THEN
        v_clean_channel := 'ostalo';
    END IF;

    INSERT INTO public.leads (
        organization_id, contact_name, company_name, email, phone, channel, stage, value_rsd, notes, source_url
    ) VALUES (
        v_org_id, COALESCE(NULLIF(TRIM(p_contact_name), ''), 'Novi kontakt'), p_company_name, p_email, p_phone,
        v_clean_channel, 'novi', COALESCE(p_value_rsd, 0), p_notes, p_source_url
    )
    RETURNING id INTO v_lead_id;

    RETURN jsonb_build_object(
        'success', true,
        'lead_id', v_lead_id,
        'organization', v_org_name
    );
END;
$$;
