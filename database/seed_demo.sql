-- ============================================================================
--  MmadiSanté — Comptes de DÉMONSTRATION (SQL pur, alternative à « npm run seed »)
-- ============================================================================
--  À coller dans l'éditeur SQL de l'hébergeur APRÈS database/schema.sql (qui contient aussi la liste des spécialités).
--  Mot de passe COMMUN à tous les comptes : MmadiDemo2026!
--
--     ADMIN    admin@mmadisante.demo
--     MEDECIN  medecin@mmadisante.demo     (suit uniquement « Amina Mmadi »)
--     PATIENT  patient@mmadisante.demo     (Amina Mmadi)
--     PATIENT  patient2@mmadisante.demo    (Paul Durand, non suivi par le médecin démo)
--
--  Sûr à relancer (met à jour les comptes existants).
--  Différence avec « npm run seed » : ici le numéro de carte d'identité est vide, car le chiffrement
--  se fait dans l'API avec votre ENCRYPTION_KEY (le patient peut le saisir depuis son profil).
--
--  ⚠ SÉCURITÉ : ces comptes et ce mot de passe sont PUBLICS (ils ne sont plus affichés sur l'écran de
--    connexion du site). Supprimez-les avant toute utilisation réelle :  database/supprimer_comptes_demo.sql
--    ou « npm run supprimer-demo » (dans le dossier backend).
-- ============================================================================

INSERT INTO "utilisateurs" ("email", "mot_de_passe_hash", "role", "nom", "prenom", "adresse", "telephone")
VALUES
  ('admin@mmadisante.demo',    '$2b$12$JH/gIjPITwpesXrlSlHst.JyWMg51vqJY7es.Vl3seSsFMnTL6.5C', 'ADMIN',   'Administrateur', 'Démo',  '1 rue de la Démo, 75001 Paris', '+33 6 00 00 00 01'),
  ('medecin@mmadisante.demo',  '$2b$12$JH/gIjPITwpesXrlSlHst.JyWMg51vqJY7es.Vl3seSsFMnTL6.5C', 'MEDECIN', 'Martin',         'Claire','Cabinet médical, 12 avenue de la Santé, 69003 Lyon', '+33 6 00 00 00 02'),
  ('patient@mmadisante.demo',  '$2b$12$JH/gIjPITwpesXrlSlHst.JyWMg51vqJY7es.Vl3seSsFMnTL6.5C', 'PATIENT', 'Mmadi',          'Amina', '8 rue des Lilas, 13001 Marseille', '+33 6 00 00 00 03'),
  ('patient2@mmadisante.demo', '$2b$12$JH/gIjPITwpesXrlSlHst.JyWMg51vqJY7es.Vl3seSsFMnTL6.5C', 'PATIENT', 'Durand',         'Paul',  '5 place du Marché, 31000 Toulouse', '+33 6 00 00 00 04')
ON CONFLICT ("email") DO UPDATE SET
  "mot_de_passe_hash" = EXCLUDED."mot_de_passe_hash",
  "role"       = EXCLUDED."role",
  "nom"        = EXCLUDED."nom",
  "prenom"     = EXCLUDED."prenom",
  "adresse"    = EXCLUDED."adresse",
  "telephone"  = EXCLUDED."telephone",
  "modifie_le" = CURRENT_TIMESTAMP;

-- Le médecin démo suit le patient démo « Amina Mmadi » (pas « Paul Durand »).
INSERT INTO "attributions" ("patient_id", "medecin_id")
SELECT p."id", m."id"
FROM "utilisateurs" p, "utilisateurs" m
WHERE p."email" = 'patient@mmadisante.demo'
  AND m."email" = 'medecin@mmadisante.demo'
ON CONFLICT ("patient_id", "medecin_id") DO NOTHING;

-- Fiche professionnelle du médecin démo : adresse du cabinet et spécialité « Médecine générale ».
UPDATE "utilisateurs"
SET "adresse_professionnelle" = 'Cabinet médical, 12 avenue de la Santé, 69003 Lyon'
WHERE "email" = 'medecin@mmadisante.demo';

INSERT INTO "medecin_specialites" ("medecin_id", "specialite_id")
SELECT m."id", s."id"
FROM "utilisateurs" m, "specialites" s
WHERE m."email" = 'medecin@mmadisante.demo'
  AND s."libelle" = 'Médecine générale'
ON CONFLICT DO NOTHING;
