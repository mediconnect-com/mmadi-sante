-- Évolution V4 : « mot de passe oublié » (lien envoyé par e-mail, jeton à usage unique).
-- 100 % IDEMPOTENT : peut être exécuté plusieurs fois sans rien casser ni supprimer.

CREATE TABLE IF NOT EXISTS "reinitialisations_mot_de_passe" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "utilisateur_id" UUID NOT NULL,
    -- Empreinte SHA-256 du jeton : le jeton lui-même (dans le lien e-mail) n'est jamais conservé.
    "jeton_hash" TEXT NOT NULL,
    "expire_le" TIMESTAMPTZ(6) NOT NULL,
    "utilise_le" TIMESTAMPTZ(6),
    "cree_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "reinitialisations_mot_de_passe_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reinitialisations_mot_de_passe_utilisateur_id_fkey') THEN
    ALTER TABLE "reinitialisations_mot_de_passe"
      ADD CONSTRAINT "reinitialisations_mot_de_passe_utilisateur_id_fkey"
      FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateurs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS "reinitialisations_mot_de_passe_jeton_hash_key" ON "reinitialisations_mot_de_passe"("jeton_hash");
CREATE INDEX IF NOT EXISTS "reinitialisations_mot_de_passe_utilisateur_id_cree_le_idx" ON "reinitialisations_mot_de_passe"("utilisateur_id", "cree_le");

-- Sécurité Supabase : RLS sans politique + droits publics retirés (comme pour les autres tables).
-- Les commentaires des médecins (V3) n'avaient pas encore reçu cette protection : elle est ajoutée ici.
ALTER TABLE "reinitialisations_mot_de_passe" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commentaires_patients" ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  r TEXT;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      BEGIN
        EXECUTE format('REVOKE ALL ON TABLE "reinitialisations_mot_de_passe", "commentaires_patients" FROM %I', r);
      EXCEPTION WHEN insufficient_privilege THEN
        RAISE NOTICE 'Droits du rôle % non modifiés (privilèges insuffisants) : la RLS reste active.', r;
      END;
    END IF;
  END LOOP;
END
$$;
