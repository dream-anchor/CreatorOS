-- Pixel Dashboard: Docs, Rules, Costs tables

CREATE TABLE public.pixel_docs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT,
  category TEXT NOT NULL DEFAULT 'Sonstiges'
    CHECK (category IN ('Kampagne', 'Analyse', 'Brief', 'Newsletter', 'Konzept', 'Sonstiges')),
  tags TEXT[] DEFAULT '{}',
  org_id TEXT NOT NULL DEFAULT 'default',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pixel_docs_category ON public.pixel_docs(category);
CREATE INDEX idx_pixel_docs_org_id ON public.pixel_docs(org_id);

CREATE TRIGGER tr_pixel_docs_updated_at BEFORE UPDATE ON public.pixel_docs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.pixel_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_text TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Allgemein'
    CHECK (category IN ('Kommunikation', 'Instagram', 'Gmail', 'Allgemein')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  org_id TEXT NOT NULL DEFAULT 'default',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pixel_rules_category ON public.pixel_rules(category);
CREATE INDEX idx_pixel_rules_active ON public.pixel_rules(is_active) WHERE is_active = true;

CREATE TRIGGER tr_pixel_rules_updated_at BEFORE UPDATE ON public.pixel_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.api_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'EUR',
  period TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  org_id TEXT NOT NULL DEFAULT 'default',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_api_costs_service ON public.api_costs(service);
CREATE INDEX idx_api_costs_period ON public.api_costs(period);
