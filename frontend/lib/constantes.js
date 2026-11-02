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

// --- Médecins, spécialités et rendez-vous ---
export const TYPES_PROFESSIONNEL = {
  MEDECIN: 'Médecin',
  PROFESSIONNEL_SANTE: 'Professionnel de santé',
};

export const STATUTS_RDV = {
  DEMANDE: { libelle: 'En attente de confirmation', style: 'bg-amber-100 text-amber-800' },
  CONFIRME: { libelle: 'Confirmé', style: 'bg-emerald-100 text-emerald-800' },
  REFUSE: { libelle: 'Refusé', style: 'bg-red-100 text-red-800' },
  ANNULE: { libelle: 'Annulé', style: 'bg-slate-200 text-slate-700' },
};

// Ordre d'affichage des groupes de spécialités (les groupes ajoutés par l'administrateur viennent ensuite).
const ORDRE_GROUPES = [
  'Médecine générale et spécialités courantes',
  'Spécialités chirurgicales',
  "Santé de la femme et de l'enfant",
  'Spécialités médico-techniques et autres',
  'Autres professionnels de santé',
];
export function rangGroupe(groupe) {
  const i = ORDRE_GROUPES.indexOf(groupe);
  return i === -1 ? ORDRE_GROUPES.length - 1.5 : i;
}

/** Minuscules, sans accents ni ponctuation : sert aux recherches « souples ». */
export function normaliser(texte) {
  return String(texte || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function nomComplet(personne) {
  return `${personne.prenom} ${personne.nom}`.trim();
}

export function formaterDateHeure(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Valeur « minimum » d'un champ datetime-local : maintenant, en heure locale. */
export function maintenantPourChamp() {
  const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
}

// --- V3 : dates de dépôt, documents récents / historiques ---
/** Un document est « récent » pendant ce nombre de jours après son dépôt (même valeur que l'API : 30). */
export const JOURS_RECENT = 30;

export function estRecent(iso, jours = JOURS_RECENT) {
  return Boolean(iso) && Date.now() - new Date(iso).getTime() < jours * 86400000;
}

/** « aujourd'hui », « hier », « il y a 5 jours », « il y a 3 mois »… */
export function formaterDepuis(iso) {
  if (!iso) return '';
  const jours = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (jours <= 0) return "aujourd'hui";
  if (jours === 1) return 'hier';
  if (jours < 31) return `il y a ${jours} jours`;
  const mois = Math.floor(jours / 30);
  if (mois < 12) return `il y a ${mois} mois`;
  const ans = Math.floor(mois / 12);
  return `il y a ${ans} an${ans > 1 ? 's' : ''}`;
}

/** « 2 nov. 2026 » (sans l'heure). */
export function formaterJour(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Masque un numéro : « •••••6789 ». */
export function masquer(valeur) {
  if (!valeur) return '';
  return `${'•'.repeat(Math.max(valeur.length - 4, 3))}${valeur.slice(-4)}`;
}
