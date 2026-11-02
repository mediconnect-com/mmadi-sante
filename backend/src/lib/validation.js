// Schémas de validation (zod) de toutes les entrées de l'API.
const { z } = require('zod');
const { ErreurHttp } = require('./erreurs');

const texteCourt = (nom, max = 100) =>
  z.string({ required_error: `${nom} est obligatoire.` }).trim().min(1, `${nom} est obligatoire.`).max(max, `${nom} est trop long.`);

const optionnel = (max) =>
  z
    .string()
    .trim()
    .max(max, 'Valeur trop longue.')
    .optional()
    .nullable()
    .transform((v) => (v === undefined || v === null || v === '' ? null : v));

const email = z
  .string({ required_error: "L'e-mail est obligatoire." })
  .trim()
  .toLowerCase()
  .email("Adresse e-mail invalide.")
  .max(150);

const motDePasse = z
  .string({ required_error: 'Le mot de passe est obligatoire.' })
  .min(8, 'Le mot de passe doit contenir au moins 8 caractères.')
  .max(100, 'Le mot de passe est trop long.')
  .refine((v) => /[A-Za-z]/.test(v) && /[0-9]/.test(v), 'Le mot de passe doit contenir au moins une lettre et un chiffre.');

const telephone = z
  .string()
  .trim()
  .regex(/^\+?[0-9 .()-]{6,20}$/, 'Numéro de téléphone invalide (chiffres, espaces, + autorisés).')
  .optional()
  .nullable()
  .or(z.literal(''))
  .transform((v) => (v ? v : null));

// E-mail facultatif (fiche médecin sans compte) : chaîne vide ou absente = null.
const emailOptionnel = z
  .union([z.literal(''), email])
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));

const regexTelephone = /^\+?[0-9 .()-]{6,20}$/;
const telephoneRequis = (nom) =>
  z
    .string({ required_error: `${nom} est obligatoire.` })
    .trim()
    .min(1, `${nom} est obligatoire.`)
    .regex(regexTelephone, 'Numéro de téléphone invalide (chiffres, espaces, + autorisés).');

const idsSpecialites = z
  .array(z.string().uuid('Spécialité invalide.'), { invalid_type_error: 'Liste de spécialités invalide.' })
  .max(10, '10 spécialités au maximum.')
  .transform((v) => [...new Set(v)]);

const identite = {
  nom: texteCourt('Le nom'),
  prenom: texteCourt('Le prénom'),
  adresse: optionnel(250),
  telephone,
  carteIdentite: optionnel(40),
};

const schemaInscription = z.object({ email, motDePasse, ...identite });

const schemaCreationUtilisateur = z
  .object({
    email: emailOptionnel,
    motDePasse: z.string().max(100, 'Le mot de passe est trop long.').optional().nullable(),
    role: z.enum(['PATIENT', 'MEDECIN', 'ADMIN'], { errorMap: () => ({ message: 'Profil invalide.' }) }),
    // true = fiche médecin SANS compte de connexion (e-mail et mot de passe facultatifs)
    sansCompte: z.boolean().optional().default(false),
    adresseProfessionnelle: optionnel(250),
    specialiteIds: idsSpecialites.optional(),
    ...identite,
  })
  .superRefine((d, ctx) => {
    const erreur = (path, message) => ctx.addIssue({ code: 'custom', path: [path], message });
    if (d.sansCompte) {
      if (d.role !== 'MEDECIN') erreur('sansCompte', 'Seule la fiche d\'un médecin peut être créée sans compte de connexion.');
    } else {
      if (!d.email) erreur('email', "L'e-mail est obligatoire.");
      const r = motDePasse.safeParse(d.motDePasse ?? undefined);
      if (!r.success) erreur('motDePasse', r.error.issues[0].message);
    }
    if (d.role !== 'MEDECIN' && ((d.specialiteIds && d.specialiteIds.length) || d.adresseProfessionnelle)) {
      erreur('role', 'Les spécialités et l\'adresse professionnelle concernent uniquement les médecins.');
    }
  });

const schemaConnexion = z.object({
  email,
  motDePasse: z.string().min(1, 'Le mot de passe est obligatoire.').max(100),
});

// Mise à jour du profil : seuls ces champs sont modifiables (jamais le rôle ni l'e-mail).
const schemaMajProfil = z.object({
  nom: identite.nom.optional(),
  prenom: identite.prenom.optional(),
  adresse: identite.adresse,
  telephone: identite.telephone,
  carteIdentite: identite.carteIdentite,
  // Réservés aux médecins (refusés pour les autres profils côté route)
  adresseProfessionnelle: optionnel(250),
  specialiteIds: idsSpecialites.optional(),
});

const schemaChangementMotDePasse = z.object({
  ancienMotDePasse: z.string().min(1, "L'ancien mot de passe est obligatoire."),
  nouveauMotDePasse: motDePasse,
});

const schemaAttribution = z.object({
  patientId: z.string().uuid('Identifiant patient invalide.'),
  medecinId: z.string().uuid('Identifiant médecin invalide.'),
});

const schemaDocument = z.object({
  categorie: z.enum(['ORDONNANCE', 'DIAGNOSTIC', 'ANALYSE', 'COMPTE_RENDU', 'AUTRE']).default('AUTRE'),
  description: optionnel(300),
});

// --- Commentaires et pathologies saisis par un médecin (V3) ---
const corpsCommentaire = {
  pathologies: optionnel(1000),
  commentaire: optionnel(3000),
};
const auMoinsUnChamp = (d) => Boolean(d.pathologies || d.commentaire);
const MESSAGE_CHAMP_VIDE = 'Renseignez au moins les pathologies ou un commentaire.';
const schemaCommentaire = z
  .object({ patientId: z.string().uuid('Identifiant patient invalide.'), ...corpsCommentaire })
  .refine(auMoinsUnChamp, { message: MESSAGE_CHAMP_VIDE });
const schemaMajCommentaire = z.object(corpsCommentaire).refine(auMoinsUnChamp, { message: MESSAGE_CHAMP_VIDE });

// --- Spécialités (administrateur) ---
const schemaSpecialite = z.object({
  libelle: texteCourt('Le libellé', 120),
  groupe: texteCourt('Le groupe', 120),
  type: z.enum(['MEDECIN', 'PROFESSIONNEL_SANTE'], { errorMap: () => ({ message: 'Type invalide.' }) }).default('MEDECIN'),
});
const schemaMajSpecialite = z.object({
  libelle: texteCourt('Le libellé', 120).optional(),
  groupe: texteCourt('Le groupe', 120).optional(),
  type: z.enum(['MEDECIN', 'PROFESSIONNEL_SANTE'], { errorMap: () => ({ message: 'Type invalide.' }) }).optional(),
  actif: z.boolean({ invalid_type_error: 'Valeur invalide pour « actif ».' }).optional(),
});

// --- Fiche médecin modifiable par l'administrateur ---
const schemaMajMedecin = z.object({
  nom: identite.nom.optional(),
  prenom: identite.prenom.optional(),
  telephone: identite.telephone,
  email: emailOptionnel,
  adresseProfessionnelle: optionnel(250),
  specialiteIds: idsSpecialites.optional(),
});

// --- Médecin saisi par un patient (absent de la base) ---
const schemaNouveauMedecin = z.object({
  nom: texteCourt('Le nom du médecin'),
  prenom: texteCourt('Le prénom du médecin'),
  telephone: telephoneRequis('Le numéro de téléphone du médecin'),
  adresseProfessionnelle: optionnel(250),
  specialiteIds: idsSpecialites.refine((v) => v.length >= 1, 'Choisissez au moins une spécialité.'),
  // true = le patient confirme que c'est bien un autre médecin malgré un homonyme trouvé
  confirmationHomonyme: z.boolean().optional().default(false),
});

const schemaVerificationMedecin = z.object({
  nom: texteCourt('Le nom du médecin'),
  prenom: texteCourt('Le prénom du médecin'),
  telephone: z.string().trim().max(20).optional().nullable(),
});

// --- Rendez-vous ---
const schemaRendezVous = z
  .object({
    medecinId: z.string().uuid('Identifiant médecin invalide.').optional(),
    nouveauMedecin: schemaNouveauMedecin.optional(),
    dateHeure: z
      .string({ required_error: 'La date et l\'heure du rendez-vous sont obligatoires.' })
      .datetime({ offset: true, message: 'Date ou heure invalide.' }),
    motif: optionnel(300),
    // Cas d'un médecin déjà enregistré : le patient choisit s'il l'autorise à consulter son dossier.
    autoriserAcces: z.boolean().optional().default(false),
  })
  .refine((d) => Boolean(d.medecinId) !== Boolean(d.nouveauMedecin), {
    message: 'Indiquez soit un médecin existant, soit les informations du nouveau médecin.',
  });

const schemaStatutRendezVous = z.object({
  statut: z.enum(['CONFIRME', 'REFUSE', 'ANNULE'], { errorMap: () => ({ message: 'Statut invalide.' }) }),
});

const schemaId = z.string().uuid('Identifiant invalide.');

/** Valide un identifiant passé dans l'URL ; renvoie 400 plutôt qu'une erreur de base de données. */
function idValide(valeur) {
  const r = schemaId.safeParse(valeur);
  if (!r.success) throw new ErreurHttp(400, 'Identifiant invalide.');
  return r.data;
}

module.exports = {
  schemaInscription,
  schemaCreationUtilisateur,
  schemaConnexion,
  schemaMajProfil,
  schemaChangementMotDePasse,
  schemaAttribution,
  schemaDocument,
  schemaCommentaire,
  schemaMajCommentaire,
  schemaSpecialite,
  schemaMajSpecialite,
  schemaMajMedecin,
  schemaNouveauMedecin,
  schemaVerificationMedecin,
  schemaRendezVous,
  schemaStatutRendezVous,
  idValide,
};
