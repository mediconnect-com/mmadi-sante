// Transforme les objets de base de données en réponses JSON publiques.
// Le hash du mot de passe et le contenu binaire des fichiers ne sortent JAMAIS par ici.
const { dechiffrer } = require('./chiffrement');

function utilisateurPublic(u) {
  return {
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
};

module.exports = { utilisateurPublic, selectDocumentSansContenu };
