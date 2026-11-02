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
 * DOCUMENTS (V3) : seuls le PROPRIÉTAIRE (le patient) et l'ADMINISTRATEUR peuvent ouvrir un document.
 * Un médecin n'a accès à AUCUN document d'un patient : ni ceux que le patient a déposés lui-même, ni ceux
 * qu'un médecin (même lui) a déposés dans la fiche. Il peut en déposer, pas en lire.
 */
function peutConsulterDocument(acteur, proprietaireId) {
  return acteur.role === 'ADMIN' || acteur.id === proprietaireId;
}

function exigerAccesDocument(acteur, proprietaireId) {
  if (!peutConsulterDocument(acteur, proprietaireId)) {
    throw new ErreurHttp(403, "Accès refusé : les documents d'un patient ne sont accessibles qu'à lui-même et à l'administrateur.");
  }
}

module.exports = { peutConsulterUtilisateur, exigerAccesUtilisateur, peutConsulterDocument, exigerAccesDocument };
