// V3 — Commentaires et pathologies d'un patient, rédigés par son médecin À PROPOS D'UN RENDEZ-VOUS.
//   MEDECIN : crée un commentaire sur un rendez-vous QUI LE CONCERNE (confirmé et déjà commencé), un seul par rendez-vous ;
//             modifie / supprime SES commentaires
//   PATIENT : lit tous les commentaires qui le concernent (GET /profil/commentaires), sans pouvoir les modifier
//   ADMIN   : les voit dans la fiche du patient (GET /utilisateurs/:id)
// Un médecin ne voit jamais les commentaires d'un confrère.
const express = require('express');
const prisma = require('../lib/prisma');
const { ErreurHttp, asyncHandler } = require('../lib/erreurs');
const { schemaCommentaire, schemaMajCommentaire, idValide } = require('../lib/validation');
const { commentairePublic } = require('../lib/serialiser');
const { authentifier, exigerRole } = require('../middleware/auth');

const router = express.Router();
router.use(authentifier, exigerRole('MEDECIN'));

const AVEC_RDV = { rendezVous: { select: { id: true, dateHeure: true } } };

// POST /api/v1/commentaires { rendezVousId, pathologies, commentaire }
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const d = schemaCommentaire.parse(req.body);
    const rdv = await prisma.rendezVous.findUnique({ where: { id: d.rendezVousId }, include: { commentaire: { select: { id: true } } } });
    if (!rdv || rdv.medecinId !== req.utilisateur.id) throw new ErreurHttp(403, 'Accès refusé : ce rendez-vous ne vous concerne pas.');
    if (rdv.statut !== 'CONFIRME') throw new ErreurHttp(409, 'Un commentaire se rédige à propos d\'un rendez-vous confirmé (ni en attente, ni refusé, ni annulé).');
    if (rdv.dateHeure.getTime() > Date.now()) throw new ErreurHttp(409, 'Ce rendez-vous n\'a pas encore eu lieu : vous pourrez le commenter à partir de son heure.');
    if (rdv.commentaire) throw new ErreurHttp(409, 'Ce rendez-vous a déjà un commentaire : modifiez-le.');
    const medecin = await prisma.utilisateur.findUnique({ where: { id: req.utilisateur.id }, select: { nom: true, prenom: true } });
    const c = await prisma.commentairePatient.create({
      data: {
        patientId: rdv.patientId,
        medecinId: req.utilisateur.id,
        medecinNom: `${medecin.prenom} ${medecin.nom}`,
        rendezVousId: rdv.id,
        pathologies: d.pathologies,
        commentaire: d.commentaire,
      },
      include: AVEC_RDV,
    });
    res.status(201).json({ commentaire: commentairePublic(c) });
  })
);

/** Charge un commentaire et vérifie que le médecin connecté en est l'auteur. */
async function commentaireDuMedecin(req) {
  const id = idValide(req.params.id);
  const c = await prisma.commentairePatient.findUnique({ where: { id } });
  if (!c) throw new ErreurHttp(404, 'Commentaire introuvable.');
  if (c.medecinId !== req.utilisateur.id) throw new ErreurHttp(403, 'Accès refusé : seul son auteur peut modifier ou supprimer ce commentaire.');
  return c;
}

// PUT /api/v1/commentaires/:id { pathologies, commentaire }
router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const c = await commentaireDuMedecin(req);
    const d = schemaMajCommentaire.parse(req.body);
    const maj = await prisma.commentairePatient.update({ where: { id: c.id }, data: { pathologies: d.pathologies, commentaire: d.commentaire }, include: AVEC_RDV });
    res.json({ commentaire: commentairePublic(maj) });
  })
);

// DELETE /api/v1/commentaires/:id
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const c = await commentaireDuMedecin(req);
    await prisma.commentairePatient.delete({ where: { id: c.id } });
    res.json({ message: 'Commentaire supprimé.' });
  })
);

module.exports = router;
