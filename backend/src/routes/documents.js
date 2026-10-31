// Téléchargement et suppression d'un document, avec contrôle d'accès sur le PROPRIÉTAIRE du document.
const express = require('express');
const prisma = require('../lib/prisma');
const { asyncHandler, ErreurHttp } = require('../lib/erreurs');
const { idValide } = require('../lib/validation');
const { exigerAccesUtilisateur } = require('../lib/acces');
const { authentifier } = require('../middleware/auth');

const router = express.Router();
router.use(authentifier);

// GET /api/v1/documents/:id — contenu du fichier (propriétaire, médecin attribué ou admin)
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = idValide(req.params.id);
    const doc = await prisma.document.findUnique({ where: { id } });
    if (!doc) throw new ErreurHttp(404, 'Document introuvable.');
    await exigerAccesUtilisateur(req.utilisateur, doc.proprietaireId);

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

// DELETE /api/v1/documents/:id — le propriétaire ou l'administrateur (jamais le médecin : lecture seule)
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = idValide(req.params.id);
    const doc = await prisma.document.findUnique({ where: { id }, select: { id: true, proprietaireId: true } });
    if (!doc) throw new ErreurHttp(404, 'Document introuvable.');

    const estProprietaire = doc.proprietaireId === req.utilisateur.id;
    if (!estProprietaire && req.utilisateur.role !== 'ADMIN') {
      throw new ErreurHttp(403, "Accès refusé : vous ne pouvez pas supprimer ce document.");
    }
    await prisma.document.delete({ where: { id } });
    res.json({ message: 'Document supprimé.' });
  })
);

module.exports = router;
