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
