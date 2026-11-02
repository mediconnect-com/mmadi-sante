// V3 — Commentaires et pathologies d'un patient, rédigés par un de ses médecins.
//   MEDECIN : crée un commentaire sur un patient QUI LUI EST ATTRIBUÉ, modifie / supprime SES commentaires
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

// POST /api/v1/commentaires { patientId, pathologies, commentaire }
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const d = schemaCommentaire.parse(req.body);
    const attribution = await prisma.attribution.findUnique({
      where: { patientId_medecinId: { patientId: d.patientId, medecinId: req.utilisateur.id } },
      select: { id: true },
    });
    if (!attribution) throw new ErreurHttp(403, 'Accès refusé : ce patient ne figure pas parmi vos patients.');
    const medecin = await prisma.utilisateur.findUnique({ where: { id: req.utilisateur.id }, select: { nom: true, prenom: true } });
    const c = await prisma.commentairePatient.create({
      data: {
        patientId: d.patientId,
        medecinId: req.utilisateur.id,
        medecinNom: `${medecin.prenom} ${medecin.nom}`,
        pathologies: d.pathologies,
        commentaire: d.commentaire,
      },
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
    const maj = await prisma.commentairePatient.update({ where: { id: c.id }, data: { pathologies: d.pathologies, commentaire: d.commentaire } });
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
