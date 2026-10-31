// Spécialités médicales : lecture pour tout utilisateur connecté, gestion (ajout / modification /
// désactivation) réservée à l'administrateur. Une spécialité n'est jamais supprimée : on la désactive,
// ce qui la retire des listes de choix tout en conservant celles des médecins qui l'ont déjà.
const express = require('express');
const prisma = require('../lib/prisma');
const { ErreurHttp, asyncHandler } = require('../lib/erreurs');
const { schemaSpecialite, schemaMajSpecialite, idValide } = require('../lib/validation');
const { normaliser } = require('../lib/medecins');
const { authentifier, exigerRole } = require('../middleware/auth');

const router = express.Router();
router.use(authentifier);

function publique(s, nombreMedecins) {
  const r = { id: s.id, libelle: s.libelle, groupe: s.groupe, type: s.type, actif: s.actif };
  if (nombreMedecins !== undefined) r.nombreMedecins = nombreMedecins;
  return r;
}

// Évite deux libellés identiques à la casse ou aux accents près (« cardiologie » / « Cardiologie »).
async function libelleDejaPris(libelle, sauf) {
  const cle = normaliser(libelle);
  const toutes = await prisma.specialite.findMany({ select: { id: true, libelle: true } });
  return toutes.some((s) => s.id !== sauf && normaliser(s.libelle) === cle);
}

// GET /api/v1/specialites?toutes=true&type=MEDECIN
//   Par défaut : spécialités ACTIVES. L'administrateur peut demander toutes=true (actives et désactivées).
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const where = {};
    const toutes = req.query.toutes === 'true' && req.utilisateur.role === 'ADMIN';
    if (!toutes) where.actif = true;
    if (['MEDECIN', 'PROFESSIONNEL_SANTE'].includes(req.query.type)) where.type = req.query.type;
    const lignes = await prisma.specialite.findMany({
      where,
      orderBy: [{ groupe: 'asc' }, { libelle: 'asc' }],
      include: { _count: { select: { medecins: true } } },
    });
    res.json({ specialites: lignes.map((s) => publique(s, req.utilisateur.role === 'ADMIN' ? s._count.medecins : undefined)) });
  })
);

// POST /api/v1/specialites — ajout (administrateur)
router.post(
  '/',
  exigerRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const d = schemaSpecialite.parse(req.body);
    if (await libelleDejaPris(d.libelle)) throw new ErreurHttp(409, 'Cette spécialité existe déjà.');
    const s = await prisma.specialite.create({ data: d });
    res.status(201).json({ specialite: publique(s, 0) });
  })
);

// PUT /api/v1/specialites/:id — modification et activation / désactivation (administrateur)
router.put(
  '/:id',
  exigerRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const id = idValide(req.params.id);
    const d = schemaMajSpecialite.parse(req.body);
    const existante = await prisma.specialite.findUnique({ where: { id } });
    if (!existante) throw new ErreurHttp(404, 'Spécialité introuvable.');
    if (d.libelle && (await libelleDejaPris(d.libelle, id))) throw new ErreurHttp(409, 'Une autre spécialité porte déjà ce nom.');
    const data = {};
    for (const champ of ['libelle', 'groupe', 'type', 'actif']) if (d[champ] !== undefined) data[champ] = d[champ];
    const s = await prisma.specialite.update({ where: { id }, data, include: { _count: { select: { medecins: true } } } });
    res.json({ specialite: publique(s, s._count.medecins) });
  })
);

module.exports = router;
