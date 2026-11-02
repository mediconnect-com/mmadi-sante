// Transforme les objets de base de données en réponses JSON publiques.
// Le hash du mot de passe et le contenu binaire des fichiers ne sortent JAMAIS par ici.
const { dechiffrer } = require('./chiffrement');

/** Sélection Prisma à ajouter (include) pour charger les spécialités d'un médecin. */
const INCLURE_SPECIALITES = {
  specialites: { include: { specialite: true }, orderBy: { specialite: { libelle: 'asc' } } },
};

/** Spécialités d'un utilisateur chargé avec INCLURE_SPECIALITES. */
function specialitesPubliques(u) {
  return (u.specialites || []).map((l) => ({
    id: l.specialite.id,
    libelle: l.specialite.libelle,
    groupe: l.specialite.groupe,
    type: l.specialite.type,
    actif: l.specialite.actif,
  }));
}

/** « MEDECIN » ou « PROFESSIONNEL_SANTE » (dentiste, kiné, pharmacien...) selon les spécialités. */
function typeProfessionnel(specialites) {
  return specialites.length > 0 && specialites.every((s) => s.type === 'PROFESSIONNEL_SANTE') ? 'PROFESSIONNEL_SANTE' : 'MEDECIN';
}

function utilisateurPublic(u) {
  const reponse = {
    id: u.id,
    email: u.email,
    role: u.role,
    nom: u.nom,
    prenom: u.prenom,
    adresse: u.adresse,
    telephone: u.telephone,
    carteIdentite: dechiffrer(u.carteIdentiteChiffree),
    creeLe: u.creeLe,
    modifieLe: u.modifieLe,
  };
  if (u.role === 'MEDECIN') {
    reponse.adresseProfessionnelle = u.adresseProfessionnelle;
    reponse.sansCompte = u.sansCompte;
    if (u.specialites) {
      reponse.specialites = specialitesPubliques(u);
      reponse.typeProfessionnel = typeProfessionnel(reponse.specialites);
    }
  }
  return reponse;
}

/**
 * Fiche d'un médecin telle que la voient les autres utilisateurs (patients, administrateur) :
 * identité, spécialités, téléphone, adresse professionnelle. Source unique : la fiche en base,
 * donc toutes les pages de l'application affichent les mêmes informations. Jamais d'e-mail ni de hash.
 */
function medecinPublic(u) {
  const specialites = specialitesPubliques(u);
  return {
    id: u.id,
    nom: u.nom,
    prenom: u.prenom,
    telephone: u.telephone,
    adresseProfessionnelle: u.adresseProfessionnelle,
    specialites,
    typeProfessionnel: typeProfessionnel(specialites),
    sansCompte: u.sansCompte,
  };
}

/** Sélection Prisma pour lire un document SANS charger son contenu binaire. */
const selectDocumentSansContenu = {
  id: true,
  proprietaireId: true,
  nomFichier: true,
  typeMime: true,
  tailleOctets: true,
  categorie: true,
  description: true,
  creeLe: true,
  // V3 : déposé par un médecin dans la fiche du patient (sinon null = déposé par le patient lui-même).
  deposeParMedecinId: true,
  deposeParNom: true,
};

/** Commentaire / pathologies rédigés par un médecin (visibles par le patient, l'auteur et l'administrateur). */
function commentairePublic(c) {
  return {
    id: c.id,
    patientId: c.patientId,
    medecinId: c.medecinId,
    medecinNom: c.medecinNom,
    rendezVousId: c.rendezVousId,
    rendezVousDateHeure: c.rendezVous ? c.rendezVous.dateHeure : null,
    pathologies: c.pathologies,
    commentaire: c.commentaire,
    creeLe: c.creeLe,
    modifieLe: c.modifieLe,
  };
}

module.exports = {
  utilisateurPublic,
  medecinPublic,
  specialitesPubliques,
  typeProfessionnel,
  INCLURE_SPECIALITES,
  selectDocumentSansContenu,
  commentairePublic,
};
