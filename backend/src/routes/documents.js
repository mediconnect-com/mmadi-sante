// Téléchargement et suppression d'un document, avec contrôle d'accès sur le PROPRIÉTAIRE du document.
const express = require('express');
const prisma = require('../lib/prisma');
const { asyncHandler, ErreurHttp } = require('../lib/erreurs');
const { idValide } = require('../lib/validation');
const { exigerAccesDocument } = require('../lib/acces');
const { authentifier } = require('../middleware/auth');

const router = express.Router();
router.use(authentifier);

// GET /api/v1/documents/:id — contenu du fichier (propriétaire, admin, ou médecin pour ses PROPRES dépôts, V4)
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = idValide(req.params.id);
    const doc = await prisma.document.findUnique({ where: { id } });
    if (!doc) throw new ErreurHttp(404, 'Document introuvable.');
    exigerAccesDocument(req.utilisateur, doc);

    const contenu = Buffer.from(doc.contenu);
    res.setHeader('Content-Type', doc.typeMime);
    res.setHeader('Content-Length', contenu.length);
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(doc.nomFichier)}`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(contenu);
  })
);

// DELETE /api/v1/documents/:id — le propriétaire, l'administrateur, ou le médecin qui a déposé le document
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = idValide(req.params.id);
    const doc = await prisma.document.findUnique({ where: { id }, select: { id: true, proprietaireId: true, deposeParNom: true, deposeParMedecinId: true } });
    if (!doc) throw new ErreurHttp(404, 'Document introuvable.');

    // Un document déposé PAR UN MÉDECIN dans la fiche du patient fait partie du dossier médical : il ne peut être
    // supprimé que par ce médecin ou par l'administrateur (pas par le patient). Les autres : propriétaire ou admin.
    const deposeParMedecin = Boolean(doc.deposeParNom);
    const autorise =
      req.utilisateur.role === 'ADMIN' ||
      (deposeParMedecin ? doc.deposeParMedecinId === req.utilisateur.id : doc.proprietaireId === req.utilisateur.id);
    if (!autorise) {
      throw new ErreurHttp(403, "Accès refusé : vous ne pouvez pas supprimer ce document.");
    }
    await prisma.document.delete({ where: { id } });
    res.json({ message: 'Document supprimé.' });
  })
);

module.exports = router;
