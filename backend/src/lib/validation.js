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

const identite = {
  nom: texteCourt('Le nom'),
  prenom: texteCourt('Le prénom'),
  adresse: optionnel(250),
  telephone,
  carteIdentite: optionnel(40),
};

const schemaInscription = z.object({ email, motDePasse, ...identite });

const schemaCreationUtilisateur = z.object({
  email,
  motDePasse,
  role: z.enum(['PATIENT', 'MEDECIN', 'ADMIN'], { errorMap: () => ({ message: 'Profil invalide.' }) }),
  ...identite,
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
  idValide,
};
