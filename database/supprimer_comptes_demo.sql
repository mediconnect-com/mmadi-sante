-- ============================================================================
--  MmadiSanté — SUPPRIMER LES COMPTES DE DÉMONSTRATION (et eux seuls)
-- ============================================================================
--  Les 4 comptes de démonstration sont reconnus par leur adresse e-mail EXACTE :
--      admin@mmadisante.demo   medecin@mmadisante.demo   patient@mmadisante.demo   patient2@mmadisante.demo
--  Aucun autre compte n'est touché (ni vos administrateurs, ni vos médecins, ni vos patients réels).
--
--  ⚠ La suppression est DÉFINITIVE : les documents, rendez-vous et attributions de ces 4 comptes
--    sont supprimés avec eux (suppression en cascade).
--
--  AVANT DE LANCER, dans cet ordre :
--    1. Connectez-vous au site avec le compte administrateur de démonstration et créez VOTRE propre
--       compte administrateur (menu Utilisateurs > « + Nouvel utilisateur » > Administrateur).
--    2. Vérifiez que vous pouvez vous connecter avec ce nouveau compte.
--    3. Exécutez ensuite ce script. Il s'arrête tout seul (sans rien supprimer) s'il ne reste
--       aucun autre administrateur.
--
--  MODE D'EMPLOI : collez TOUT le fichier dans l'éditeur SQL de Supabase. Les résultats de l'étape 1
--  montrent ce qui sera supprimé ; l'étape 2 supprime.
-- ============================================================================

-- Étape 1 — APERÇU (ne supprime rien) : les comptes de démonstration trouvés et ce qu'ils contiennent.
SELECT u."email", u."role",
       (SELECT count(*) FROM "documents" d WHERE d."proprietaire_id" = u."id") AS documents,
       (SELECT count(*) FROM "rendez_vous" r WHERE r."patient_id" = u."id" OR r."medecin_id" = u."id") AS rendez_vous
FROM "utilisateurs" u
WHERE u."email" IN ('admin@mmadisante.demo', 'medecin@mmadisante.demo', 'patient@mmadisante.demo', 'patient2@mmadisante.demo')
ORDER BY u."role", u."email";

-- Étape 2 — SUPPRESSION, protégée : refusée s'il ne reste aucun autre administrateur.
DO $$
DECLARE
  autres_admins integer;
  supprimes integer;
BEGIN
  SELECT count(*) INTO autres_admins
  FROM "utilisateurs"
  WHERE "role" = 'ADMIN'
    AND "email" NOT IN ('admin@mmadisante.demo', 'medecin@mmadisante.demo', 'patient@mmadisante.demo', 'patient2@mmadisante.demo');

  IF autres_admins = 0 THEN
    RAISE EXCEPTION 'Annulé : aucun autre administrateur que le compte de démonstration. Créez d''abord votre propre compte administrateur, puis relancez ce script.';
  END IF;

  DELETE FROM "utilisateurs"
  WHERE "email" IN ('admin@mmadisante.demo', 'medecin@mmadisante.demo', 'patient@mmadisante.demo', 'patient2@mmadisante.demo');
  GET DIAGNOSTICS supprimes = ROW_COUNT;
  RAISE NOTICE '% compte(s) de démonstration supprimé(s).', supprimes;
END
$$;
