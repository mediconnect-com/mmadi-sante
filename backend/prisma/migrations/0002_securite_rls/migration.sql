-- Sécurité Supabase : fermer l'accès à l'API REST publique (PostgREST).
-- L'API MmadiSanté se connecte directement à PostgreSQL avec le rôle propriétaire (qui contourne la RLS) ;
-- on active la Row Level Security SANS politique et on retire les droits des rôles publics s'ils existent.
-- Sans effet gênant sur un PostgreSQL classique (local, Docker, Railway...).
ALTER TABLE "utilisateurs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "attributions" ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  r TEXT;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      BEGIN
        EXECUTE format('REVOKE ALL ON TABLE "utilisateurs", "documents", "attributions" FROM %I', r);
      EXCEPTION WHEN insufficient_privilege THEN
        RAISE NOTICE 'Droits du rôle % non modifiés (privilèges insuffisants) : la RLS reste active.', r;
      END;
    END IF;
  END LOOP;
END
$$;
