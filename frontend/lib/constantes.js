// Libellés français et petites fonctions de présentation.
export const ROLES = {
  PATIENT: 'Patient',
  MEDECIN: 'Médecin',
  ADMIN: 'Administrateur',
};

export const CATEGORIES = {
  ORDONNANCE: 'Ordonnance',
  DIAGNOSTIC: 'Diagnostic',
  ANALYSE: "Résultat d'analyse",
  COMPTE_RENDU: 'Compte rendu',
  AUTRE: 'Autre',
};

export const TAILLE_MAX_MO = 5;

export function accueilPourRole(role) {
  if (role === 'ADMIN') return '/admin/';
  if (role === 'MEDECIN') return '/medecin/';
  return '/profil/';
}

export function formaterTaille(octets) {
  if (octets < 1024) return `${octets} o`;
  if (octets < 1024 * 1024) return `${(octets / 1024).toFixed(0)} Ko`;
  return `${(octets / 1024 / 1024).toFixed(1)} Mo`;
}

export function formaterDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
}
