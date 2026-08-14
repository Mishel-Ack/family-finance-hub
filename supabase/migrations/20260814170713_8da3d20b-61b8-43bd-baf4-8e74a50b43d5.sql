
REVOKE ALL ON FUNCTION public.is_family_member(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_edit_family(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.budget_family_id(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bootstrap_user(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bootstrap_user(TEXT, TEXT) TO authenticated;
