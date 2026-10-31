// Consultation du dossier d'un utilisateur par un autre (médecin → patient attribué, admin → tous).
// L'autorisation est vérifiée par exigerAccesUtilisateur : admin, soi-même, ou médecin attribué.
const express = require('express');
const prisma = require('../lib/prisma');
const { asyncHandler, ErreurHttp } = require('../lib/erreurs');
const { idValide } = require('../lib/validation');
const { exigerAccesUtilisateur } = require('../lib/acces');
const { utilisateurPublic, medecinPublic, INCLURE_SPECIALITES, selectDocumentSansContenu } = require('../lib/serialiser');
const { authentifier } = require('../middleware/auth');

const router = express.Router();
router.use(authentifier);

// GET /api/v1/utilisateurs/:id — fiche + documents (+ médecins attribués, visibles par l'admin)
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = idValide(req.params.id);
    await exigerAccesUtilisateur(req.utilisateur, id);

    const u = await prisma.utilisateur.findUnique({
      where: { id },
      include: {
        ...INCLURE_SPECIALITES,
        documents: { select: selectDocumentSansContenu, orderBy: { creeLe: 'desc' } },
        commePatient: { select: { id: true, medecin: { include: INCLURE_SPECIALITES } } },
        commeMedecin: { select: { id: true, patient: { select: { id: true, nom: true, prenom: true, email: true } } } },
      },
    });
    if (!u) throw new ErreurHttp(404, 'Utilisateur introuvable.');

    const reponse = { utilisateur: utilisateurPublic(u), documents: u.documents };
    // Seul l'administrateur voit les attributions (médecins d'un patient / patients d'un médecin).
    if (req.utilisateur.role === 'ADMIN') {
      reponse.medecins = u.commePatient.map((a) => ({ attributionId: a.id, ...medecinPublic(a.medecin) }));
      reponse.patients = u.commeMedecin.map((a) => ({ attributionId: a.id, ...a.patient }));
    }
    res.json(reponse);
  })
);

module.exports = router;
