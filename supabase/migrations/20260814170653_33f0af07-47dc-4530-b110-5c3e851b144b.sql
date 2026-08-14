
-- Enums
CREATE TYPE public.family_role AS ENUM ('OWNER','ADMIN','MEMBER','VIEWER');

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.families (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX families_owner_id_idx ON public.families(owner_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.families TO authenticated;
GRANT ALL ON public.families TO service_role;
ALTER TABLE public.families ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.family_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT '',
  role public.family_role NOT NULL DEFAULT 'MEMBER',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX family_members_family_id_idx ON public.family_members(family_id);
CREATE INDEX family_members_user_id_idx ON public.family_members(user_id);
CREATE UNIQUE INDEX family_members_family_user_uidx ON public.family_members(family_id, user_id) WHERE user_id IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.family_members TO authenticated;
GRANT ALL ON public.family_members TO service_role;
ALTER TABLE public.family_members ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  month SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
  year SMALLINT NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  total_limit NUMERIC(12,2) NOT NULL CHECK (total_limit >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (family_id, month, year)
);
CREATE INDEX budgets_family_idx ON public.budgets(family_id, year, month);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.budgets TO authenticated;
GRANT ALL ON public.budgets TO service_role;
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.budget_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id UUID NOT NULL REFERENCES public.budgets(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  limit_amount NUMERIC(12,2) NOT NULL CHECK (limit_amount >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (budget_id, category)
);
CREATE INDEX budget_categories_budget_idx ON public.budget_categories(budget_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.budget_categories TO authenticated;
GRANT ALL ON public.budget_categories TO service_role;
ALTER TABLE public.budget_categories ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  category TEXT NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT NOT NULL DEFAULT '',
  family_member TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX expenses_family_date_idx ON public.expenses(family_id, date DESC);
CREATE INDEX expenses_family_category_idx ON public.expenses(family_id, category);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
GRANT ALL ON public.expenses TO service_role;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

-- Helpers
CREATE OR REPLACE FUNCTION public.is_family_member(_family_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.family_members m WHERE m.family_id = _family_id AND m.user_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.can_edit_family(_family_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.family_members m
    WHERE m.family_id = _family_id AND m.user_id = auth.uid() AND m.role <> 'VIEWER'
  );
$$;

CREATE OR REPLACE FUNCTION public.budget_family_id(_budget_id UUID)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT family_id FROM public.budgets WHERE id = _budget_id;
$$;

CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER families_updated BEFORE UPDATE ON public.families FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER budgets_updated BEFORE UPDATE ON public.budgets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER budget_categories_updated BEFORE UPDATE ON public.budget_categories FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER expenses_updated BEFORE UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Policies
CREATE POLICY "profiles self read" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "profiles self insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "profiles self update" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE POLICY "families members read" ON public.families FOR SELECT TO authenticated USING (owner_id = auth.uid() OR public.is_family_member(id));
CREATE POLICY "families owner insert" ON public.families FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "families owner update" ON public.families FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "families owner delete" ON public.families FOR DELETE TO authenticated USING (owner_id = auth.uid());

CREATE POLICY "members read" ON public.family_members FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_family_member(family_id));
CREATE POLICY "members insert" ON public.family_members FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.families f WHERE f.id = family_id AND f.owner_id = auth.uid())
  OR public.can_edit_family(family_id)
);
CREATE POLICY "members update" ON public.family_members FOR UPDATE TO authenticated USING (public.can_edit_family(family_id)) WITH CHECK (public.can_edit_family(family_id));
CREATE POLICY "members delete" ON public.family_members FOR DELETE TO authenticated USING (public.can_edit_family(family_id));

CREATE POLICY "budgets read" ON public.budgets FOR SELECT TO authenticated USING (public.is_family_member(family_id));
CREATE POLICY "budgets insert" ON public.budgets FOR INSERT TO authenticated WITH CHECK (public.can_edit_family(family_id));
CREATE POLICY "budgets update" ON public.budgets FOR UPDATE TO authenticated USING (public.can_edit_family(family_id)) WITH CHECK (public.can_edit_family(family_id));
CREATE POLICY "budgets delete" ON public.budgets FOR DELETE TO authenticated USING (public.can_edit_family(family_id));

CREATE POLICY "budget cats read" ON public.budget_categories FOR SELECT TO authenticated USING (public.is_family_member(public.budget_family_id(budget_id)));
CREATE POLICY "budget cats insert" ON public.budget_categories FOR INSERT TO authenticated WITH CHECK (public.can_edit_family(public.budget_family_id(budget_id)));
CREATE POLICY "budget cats update" ON public.budget_categories FOR UPDATE TO authenticated USING (public.can_edit_family(public.budget_family_id(budget_id))) WITH CHECK (public.can_edit_family(public.budget_family_id(budget_id)));
CREATE POLICY "budget cats delete" ON public.budget_categories FOR DELETE TO authenticated USING (public.can_edit_family(public.budget_family_id(budget_id)));

CREATE POLICY "expenses read" ON public.expenses FOR SELECT TO authenticated USING (public.is_family_member(family_id));
CREATE POLICY "expenses insert" ON public.expenses FOR INSERT TO authenticated WITH CHECK (public.can_edit_family(family_id) AND user_id = auth.uid());
CREATE POLICY "expenses update" ON public.expenses FOR UPDATE TO authenticated USING (public.can_edit_family(family_id)) WITH CHECK (public.can_edit_family(family_id));
CREATE POLICY "expenses delete" ON public.expenses FOR DELETE TO authenticated USING (public.can_edit_family(family_id));

-- Bootstrap: ensure the signed-in user has a profile and a family
CREATE OR REPLACE FUNCTION public.bootstrap_user(_name TEXT, _email TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid UUID := auth.uid();
        _fid UUID;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  INSERT INTO public.profiles (id, name, email)
  VALUES (_uid, COALESCE(NULLIF(_name,''), 'Member'), COALESCE(_email,''))
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email
  RETURNING id INTO _uid;

  SELECT m.family_id INTO _fid FROM public.family_members m WHERE m.user_id = auth.uid() LIMIT 1;
  IF _fid IS NULL THEN
    INSERT INTO public.families (name, owner_id)
    VALUES (COALESCE(NULLIF(_name,''),'My') || '''s Family', auth.uid())
    RETURNING id INTO _fid;
    INSERT INTO public.family_members (family_id, user_id, display_name, role)
    VALUES (_fid, auth.uid(), COALESCE(NULLIF(_name,''),'Member'), 'OWNER');
  END IF;
  RETURN _fid;
END; $$;
GRANT EXECUTE ON FUNCTION public.bootstrap_user(TEXT, TEXT) TO authenticated;
