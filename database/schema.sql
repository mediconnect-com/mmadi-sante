-- ============================================================================
--  MmadiSanté — Script SQL AUTONOME de création de la base (DDL pur, PostgreSQL 13+)
-- ============================================================================
--  À QUOI ÇA SERT
--    Créer toutes les tables SANS utiliser Prisma. À coller tel quel dans l'éditeur SQL de
--    votre hébergeur (Supabase : menu « SQL Editor » → « New query » → coller → « Run »).
--    Équivalent des migrations Prisma (backend/prisma/migrations/0001 + 0002 + 0003).
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

-- ============================================================================
-- 6) ÉVOLUTION V2 : spécialités médicales, fiche médecin enrichie, rendez-vous
--    (identique à backend/prisma/migrations/0003_specialites_rendez_vous/migration.sql)
-- ============================================================================
-- Évolution v2 : spécialités médicales, fiche médecin enrichie, rendez-vous.
-- 100 % IDEMPOTENT : peut être exécuté plusieurs fois sans rien casser ni supprimer (aucune donnée existante n'est touchée).

-- ---------------------------------------------------------------------------
-- 1) Nouveaux types énumérés
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TypeProfessionnel') THEN
    CREATE TYPE "TypeProfessionnel" AS ENUM ('MEDECIN', 'PROFESSIONNEL_SANTE');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'StatutRendezVous') THEN
    CREATE TYPE "StatutRendezVous" AS ENUM ('DEMANDE', 'CONFIRME', 'REFUSE', 'ANNULE');
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 2) Fiche médecin : e-mail facultatif (fiche sans compte), adresse professionnelle
-- ---------------------------------------------------------------------------
ALTER TABLE "utilisateurs" ALTER COLUMN "email" DROP NOT NULL;
ALTER TABLE "utilisateurs" ADD COLUMN IF NOT EXISTS "adresse_professionnelle" TEXT;
ALTER TABLE "utilisateurs" ADD COLUMN IF NOT EXISTS "sans_compte" BOOLEAN NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- 3) Spécialités et liaison médecin <-> spécialités (plusieurs par médecin)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "specialites" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "libelle" TEXT NOT NULL,
    "groupe" TEXT NOT NULL,
    "type" "TypeProfessionnel" NOT NULL DEFAULT 'MEDECIN',
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "cree_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifie_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "specialites_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "specialites_libelle_key" ON "specialites"("libelle");

CREATE TABLE IF NOT EXISTS "medecin_specialites" (
    "medecin_id" UUID NOT NULL,
    "specialite_id" UUID NOT NULL,
    "cree_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "medecin_specialites_pkey" PRIMARY KEY ("medecin_id", "specialite_id")
);
CREATE INDEX IF NOT EXISTS "medecin_specialites_specialite_id_idx" ON "medecin_specialites"("specialite_id");

-- ---------------------------------------------------------------------------
-- 4) Rendez-vous
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "rendez_vous" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "patient_id" UUID NOT NULL,
    "medecin_id" UUID NOT NULL,
    "date_heure" TIMESTAMPTZ(6) NOT NULL,
    "motif" TEXT,
    "statut" "StatutRendezVous" NOT NULL DEFAULT 'DEMANDE',
    "cree_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifie_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rendez_vous_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "rendez_vous_patient_id_idx" ON "rendez_vous"("patient_id");
CREATE INDEX IF NOT EXISTS "rendez_vous_medecin_id_date_heure_idx" ON "rendez_vous"("medecin_id", "date_heure");

-- ---------------------------------------------------------------------------
-- 5) Clés étrangères (suppression en cascade, comme pour les tables existantes)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'medecin_specialites_medecin_id_fkey') THEN
    ALTER TABLE "medecin_specialites" ADD CONSTRAINT "medecin_specialites_medecin_id_fkey"
      FOREIGN KEY ("medecin_id") REFERENCES "utilisateurs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'medecin_specialites_specialite_id_fkey') THEN
    ALTER TABLE "medecin_specialites" ADD CONSTRAINT "medecin_specialites_specialite_id_fkey"
      FOREIGN KEY ("specialite_id") REFERENCES "specialites"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rendez_vous_patient_id_fkey') THEN
    ALTER TABLE "rendez_vous" ADD CONSTRAINT "rendez_vous_patient_id_fkey"
      FOREIGN KEY ("patient_id") REFERENCES "utilisateurs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rendez_vous_medecin_id_fkey') THEN
    ALTER TABLE "rendez_vous" ADD CONSTRAINT "rendez_vous_medecin_id_fkey"
      FOREIGN KEY ("medecin_id") REFERENCES "utilisateurs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 6) Sécurité Supabase (comme pour les 3 premières tables) : RLS sans politique + droits publics retirés
-- ---------------------------------------------------------------------------
ALTER TABLE "specialites" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "medecin_specialites" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "rendez_vous" ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  r TEXT;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      BEGIN
        EXECUTE format('REVOKE ALL ON TABLE "specialites", "medecin_specialites", "rendez_vous" FROM %I', r);
      EXCEPTION WHEN insufficient_privilege THEN
        RAISE NOTICE 'Droits du rôle % non modifiés (privilèges insuffisants) : la RLS reste active.', r;
      END;
    END IF;
  END LOOP;
END
$$;

-- ---------------------------------------------------------------------------
-- 7) Liste prédéfinie des spécialités (ajoutées seulement si absentes : vos modifications sont conservées)
-- ---------------------------------------------------------------------------
INSERT INTO "specialites" ("libelle", "groupe", "type") VALUES
  ('Médecine générale', 'Médecine générale et spécialités courantes', 'MEDECIN'),
  ('Médecine interne', 'Médecine générale et spécialités courantes', 'MEDECIN'),
  ('Cardiologie', 'Médecine générale et spécialités courantes', 'MEDECIN'),
  ('Dermatologie', 'Médecine générale et spécialités courantes', 'MEDECIN'),
  ('Endocrinologie', 'Médecine générale et spécialités courantes', 'MEDECIN'),
  ('Gastro-entérologie', 'Médecine générale et spécialités courantes', 'MEDECIN'),
  ('Pneumologie', 'Médecine générale et spécialités courantes', 'MEDECIN'),
  ('Néphrologie', 'Médecine générale et spécialités courantes', 'MEDECIN'),
  ('Rhumatologie', 'Médecine générale et spécialités courantes', 'MEDECIN'),
  ('Neurologie', 'Médecine générale et spécialités courantes', 'MEDECIN'),
  ('Oncologie', 'Médecine générale et spécialités courantes', 'MEDECIN'),
  ('Hématologie', 'Médecine générale et spécialités courantes', 'MEDECIN'),
  ('Infectiologie', 'Médecine générale et spécialités courantes', 'MEDECIN'),
  ('Allergologie', 'Médecine générale et spécialités courantes', 'MEDECIN'),
  ('Angiologie (médecine vasculaire)', 'Médecine générale et spécialités courantes', 'MEDECIN'),
  ('Chirurgie générale', 'Spécialités chirurgicales', 'MEDECIN'),
  ('Chirurgie orthopédique et traumatologique', 'Spécialités chirurgicales', 'MEDECIN'),
  ('Neurochirurgie', 'Spécialités chirurgicales', 'MEDECIN'),
  ('Chirurgie cardiovasculaire', 'Spécialités chirurgicales', 'MEDECIN'),
  ('Chirurgie thoracique', 'Spécialités chirurgicales', 'MEDECIN'),
  ('Chirurgie digestive', 'Spécialités chirurgicales', 'MEDECIN'),
  ('Chirurgie plastique et esthétique', 'Spécialités chirurgicales', 'MEDECIN'),
  ('Chirurgie urologique', 'Spécialités chirurgicales', 'MEDECIN'),
  ('Chirurgie pédiatrique', 'Spécialités chirurgicales', 'MEDECIN'),
  ('Chirurgie maxillo-faciale', 'Spécialités chirurgicales', 'MEDECIN'),
  ('Gynécologie', 'Santé de la femme et de l''enfant', 'MEDECIN'),
  ('Obstétrique', 'Santé de la femme et de l''enfant', 'MEDECIN'),
  ('Gynécologie-obstétrique', 'Santé de la femme et de l''enfant', 'MEDECIN'),
  ('Pédiatrie', 'Santé de la femme et de l''enfant', 'MEDECIN'),
  ('Néonatologie', 'Santé de la femme et de l''enfant', 'MEDECIN'),
  ('Médecine de la reproduction', 'Santé de la femme et de l''enfant', 'MEDECIN'),
  ('Anesthésie-réanimation', 'Spécialités médico-techniques et autres', 'MEDECIN'),
  ('Radiologie et imagerie médicale', 'Spécialités médico-techniques et autres', 'MEDECIN'),
  ('Biologie médicale', 'Spécialités médico-techniques et autres', 'MEDECIN'),
  ('Médecine d''urgence', 'Spécialités médico-techniques et autres', 'MEDECIN'),
  ('Psychiatrie', 'Spécialités médico-techniques et autres', 'MEDECIN'),
  ('Pédopsychiatrie', 'Spécialités médico-techniques et autres', 'MEDECIN'),
  ('Médecine du travail', 'Spécialités médico-techniques et autres', 'MEDECIN'),
  ('Médecine légale', 'Spécialités médico-techniques et autres', 'MEDECIN'),
  ('Médecine du sport', 'Spécialités médico-techniques et autres', 'MEDECIN'),
  ('Médecine intensive-réanimation', 'Spécialités médico-techniques et autres', 'MEDECIN'),
  ('Médecine palliative', 'Spécialités médico-techniques et autres', 'MEDECIN'),
  ('Ophtalmologie', 'Spécialités médico-techniques et autres', 'MEDECIN'),
  ('ORL (oto-rhino-laryngologie)', 'Spécialités médico-techniques et autres', 'MEDECIN'),
  ('Stomatologie', 'Spécialités médico-techniques et autres', 'MEDECIN'),
  ('Urologie', 'Spécialités médico-techniques et autres', 'MEDECIN'),
  ('Chirurgien-dentiste', 'Autres professionnels de santé', 'PROFESSIONNEL_SANTE'),
  ('Orthodontiste', 'Autres professionnels de santé', 'PROFESSIONNEL_SANTE'),
  ('Sage-femme', 'Autres professionnels de santé', 'PROFESSIONNEL_SANTE'),
  ('Kinésithérapeute', 'Autres professionnels de santé', 'PROFESSIONNEL_SANTE'),
  ('Ostéopathe', 'Autres professionnels de santé', 'PROFESSIONNEL_SANTE'),
  ('Orthophoniste', 'Autres professionnels de santé', 'PROFESSIONNEL_SANTE'),
  ('Orthoptiste', 'Autres professionnels de santé', 'PROFESSIONNEL_SANTE'),
  ('Pédicure-podologue', 'Autres professionnels de santé', 'PROFESSIONNEL_SANTE'),
  ('Diététicien', 'Autres professionnels de santé', 'PROFESSIONNEL_SANTE'),
  ('Psychologue', 'Autres professionnels de santé', 'PROFESSIONNEL_SANTE'),
  ('Psychothérapeute', 'Autres professionnels de santé', 'PROFESSIONNEL_SANTE'),
  ('Infirmier / Infirmière', 'Autres professionnels de santé', 'PROFESSIONNEL_SANTE'),
  ('Pharmacien', 'Autres professionnels de santé', 'PROFESSIONNEL_SANTE')
ON CONFLICT ("libelle") DO NOTHING;

-- ============================================================================
--  V3 : commentaires de pathologies, documents déposés par un médecin
-- ============================================================================
-- Évolution V3 : commentaires de pathologies saisis par les médecins, documents déposés par un médecin.
-- 100 % IDEMPOTENT : peut être exécuté plusieurs fois sans rien casser ni supprimer (aucune donnée existante n'est touchée).

-- ---------------------------------------------------------------------------
-- 1) Documents : qui a déposé le document ? (NULL = le patient lui-même, comme tous les documents existants)
-- ---------------------------------------------------------------------------
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "depose_par_medecin_id" UUID;
-- Nom du médecin au moment du dépôt : reste lisible même si sa fiche est supprimée plus tard.
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "depose_par_nom" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'documents_depose_par_medecin_id_fkey') THEN
    ALTER TABLE "documents"
      ADD CONSTRAINT "documents_depose_par_medecin_id_fkey"
      FOREIGN KEY ("depose_par_medecin_id") REFERENCES "utilisateurs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "documents_depose_par_medecin_id_idx" ON "documents"("depose_par_medecin_id");
CREATE INDEX IF NOT EXISTS "documents_proprietaire_id_cree_le_idx" ON "documents"("proprietaire_id", "cree_le");

-- ---------------------------------------------------------------------------
-- 2) Commentaires et pathologies d'un patient, rédigés par un de ses médecins
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "commentaires_patients" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "patient_id" UUID NOT NULL,
    "medecin_id" UUID,
    "medecin_nom" TEXT NOT NULL,
    "pathologies" TEXT,
    "commentaire" TEXT,
    "cree_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifie_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "commentaires_patients_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'commentaires_patients_patient_id_fkey') THEN
    ALTER TABLE "commentaires_patients"
      ADD CONSTRAINT "commentaires_patients_patient_id_fkey"
      FOREIGN KEY ("patient_id") REFERENCES "utilisateurs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'commentaires_patients_medecin_id_fkey') THEN
    ALTER TABLE "commentaires_patients"
      ADD CONSTRAINT "commentaires_patients_medecin_id_fkey"
      FOREIGN KEY ("medecin_id") REFERENCES "utilisateurs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "commentaires_patients_patient_id_cree_le_idx" ON "commentaires_patients"("patient_id", "cree_le");
CREATE INDEX IF NOT EXISTS "commentaires_patients_medecin_id_idx" ON "commentaires_patients"("medecin_id");
