-- ============================================================================
--  MmadiSanté — Script SQL AUTONOME de création de la base (DDL pur, PostgreSQL 13+)
-- ============================================================================
--  À QUOI ÇA SERT
--    Créer toutes les tables SANS utiliser Prisma. À coller tel quel dans l'éditeur SQL de
--    votre hébergeur (Supabase : menu « SQL Editor » → « New query » → coller → « Run »).
--    Équivalent des migrations Prisma (backend/prisma/migrations/0001 + 0002).
--
--  SÛR À RELANCER : le script est « idempotent » (il ne casse rien si les tables existent déjà).
--
--  APRÈS L'EXÉCUTION
--    - Si vous utilisez ce script, vous pouvez ajouter la variable SKIP_MIGRATE=true côté API
--      (facultatif : l'API détecte de toute façon que les tables existent déjà).
--    - Pour créer les comptes de démo : exécutez ensuite database/seed_demo.sql.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Types énumérés
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'Role') THEN
    CREATE TYPE "Role" AS ENUM ('PATIENT', 'MEDECIN', 'ADMIN');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CategorieDocument') THEN
    CREATE TYPE "CategorieDocument" AS ENUM ('ORDONNANCE', 'DIAGNOSTIC', 'ANALYSE', 'COMPTE_RENDU', 'AUTRE');
  END IF;
END
$$;

-- ----------------------------------------------------------------------------
-- 2) Tables
-- ----------------------------------------------------------------------------

-- Comptes utilisateurs (patients, médecins, administrateurs)
CREATE TABLE IF NOT EXISTS "utilisateurs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "mot_de_passe_hash" TEXT NOT NULL,                 -- hash bcrypt, jamais le mot de passe en clair
    "role" "Role" NOT NULL DEFAULT 'PATIENT',
    "nom" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "adresse" TEXT,
    "telephone" TEXT,
    "carte_identite_chiffree" TEXT,                    -- numéro chiffré (AES-256-GCM) par l'API
    "cree_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifie_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "utilisateurs_pkey" PRIMARY KEY ("id")
);

-- Documents (ordonnances, diagnostics, ...) : le fichier lui-même est stocké dans la base (bytea)
CREATE TABLE IF NOT EXISTS "documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "proprietaire_id" UUID NOT NULL,
    "nom_fichier" TEXT NOT NULL,
    "type_mime" TEXT NOT NULL,
    "taille_octets" INTEGER NOT NULL,
    "categorie" "CategorieDocument" NOT NULL DEFAULT 'AUTRE',
    "description" TEXT,
    "contenu" BYTEA NOT NULL,
    "cree_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- Attribution d'un patient à un médecin
CREATE TABLE IF NOT EXISTS "attributions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "patient_id" UUID NOT NULL,
    "medecin_id" UUID NOT NULL,
    "cree_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attributions_pkey" PRIMARY KEY ("id")
);

-- ----------------------------------------------------------------------------
-- 3) Index
-- ----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS "utilisateurs_email_key" ON "utilisateurs"("email");
CREATE INDEX IF NOT EXISTS "utilisateurs_role_idx" ON "utilisateurs"("role");
CREATE INDEX IF NOT EXISTS "documents_proprietaire_id_idx" ON "documents"("proprietaire_id");
CREATE INDEX IF NOT EXISTS "attributions_medecin_id_idx" ON "attributions"("medecin_id");
CREATE UNIQUE INDEX IF NOT EXISTS "attributions_patient_id_medecin_id_key" ON "attributions"("patient_id", "medecin_id");

-- ----------------------------------------------------------------------------
-- 4) Clés étrangères (suppression en cascade : supprimer un utilisateur supprime ses documents
--    et ses attributions)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'documents_proprietaire_id_fkey') THEN
    ALTER TABLE "documents" ADD CONSTRAINT "documents_proprietaire_id_fkey"
      FOREIGN KEY ("proprietaire_id") REFERENCES "utilisateurs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attributions_patient_id_fkey') THEN
    ALTER TABLE "attributions" ADD CONSTRAINT "attributions_patient_id_fkey"
      FOREIGN KEY ("patient_id") REFERENCES "utilisateurs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attributions_medecin_id_fkey') THEN
    ALTER TABLE "attributions" ADD CONSTRAINT "attributions_medecin_id_fkey"
      FOREIGN KEY ("medecin_id") REFERENCES "utilisateurs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

-- ----------------------------------------------------------------------------
-- 5) Sécurité Supabase : fermer l'accès à l'API REST publique (PostgREST)
--    Sur Supabase, toute table du schéma « public » est exposée par défaut à la clé publique « anon ».
--    Notre API se connecte directement à PostgreSQL (rôle propriétaire, qui contourne la RLS) :
--    on active donc la « Row Level Security » SANS politique (= personne d'autre n'a accès)
--    et on retire les droits des rôles publics s'ils existent. Sans effet gênant hors Supabase.
-- ----------------------------------------------------------------------------
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

-- Fin du script : 3 tables créées (utilisateurs, documents, attributions).
