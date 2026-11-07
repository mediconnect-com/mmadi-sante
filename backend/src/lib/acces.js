// RÈGLES D'ACCÈS AUX DONNÉES : point unique, vérifié côté serveur pour chaque route sensible.
//   - ADMIN   : accès à tout
//   - PATIENT : uniquement à ses propres données
//   - MEDECIN : à ses propres données + à celles des patients qui lui sont attribués
const prisma = require('./prisma');
const { ErreurHttp } = require('./erreurs');

/** Renvoie true si l'acteur a le droit de consulter les données de l'utilisateur ciblé. */
async function peutConsulterUtilisateur(acteur, cibleId) {
  if (acteur.role === 'ADMIN') return true;
  if (acteur.id === cibleId) return true;
  if (acteur.role === 'MEDECIN') {
    const attribution = await prisma.attribution.findUnique({
      where: { patientId_medecinId: { patientId: cibleId, medecinId: acteur.id } },
      select: { id: true },
    });
    return Boolean(attribution);
  }
  return false;
}

/** Lève une erreur 403 si l'accès n'est pas autorisé. */
async function exigerAccesUtilisateur(acteur, cibleId) {
  if (!(await peutConsulterUtilisateur(acteur, cibleId))) {
    throw new ErreurHttp(403, "Accès refusé : vous n'avez pas le droit de consulter ces données.");
  }
}

/**
 * DOCUMENTS (V4) : le PROPRIÉTAIRE (le patient) et l'ADMINISTRATEUR ouvrent tout document du patient.
 * Un MÉDECIN ouvre uniquement les documents QU'IL A LUI-MÊME DÉPOSÉS dans une fiche (comme le patient peut le faire,
 * il peut les voir, les télécharger et les retirer). Il n'accède jamais aux documents que le patient a déposés,
 * ni à ceux déposés par un confrère.
 * `doc` : { proprietaireId, deposeParMedecinId }
 */
function peutConsulterDocument(acteur, doc) {
  if (acteur.role === 'ADMIN' || acteur.id === doc.proprietaireId) return true;
  return acteur.role === 'MEDECIN' && Boolean(doc.deposeParMedecinId) && doc.deposeParMedecinId === acteur.id;
}

function exigerAccesDocument(acteur, doc) {
  if (!peutConsulterDocument(acteur, doc)) {
    throw new ErreurHttp(403, "Accès refusé : vous ne pouvez ouvrir que les documents que vous avez vous-même déposés.");
  }
}

module.exports = { peutConsulterUtilisateur, exigerAccesUtilisateur, peutConsulterDocument, exigerAccesDocument };
