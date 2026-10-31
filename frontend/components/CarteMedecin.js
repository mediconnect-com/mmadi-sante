'use client';
// Fiche d'un médecin : nom, spécialités, téléphone (bien visible) et adresse professionnelle.
// Les données viennent toujours de la fiche enregistrée en base : la même présentation sert partout.
import { TYPES_PROFESSIONNEL, nomComplet } from '@/lib/constantes';

function IconeTelephone() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}
function IconeLieu() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

/**
 * medecin   : { id, nom, prenom, telephone, adresseProfessionnelle, specialites[], typeProfessionnel, sansCompte }
 * actions   : boutons à afficher à droite / en bas
 * choisi    : met la carte en évidence
 * afficherCompte : indique si la fiche n'a pas de compte de connexion (utile pour l'administrateur)
 */
export default function CarteMedecin({ medecin, actions, choisi = false, afficherCompte = false, titreNiveau = 'h3' }) {
  const Titre = titreNiveau;
  const specialites = medecin.specialites || [];
  const autre = medecin.typeProfessionnel === 'PROFESSIONNEL_SANTE';
  const initiales = `${(medecin.prenom || '?')[0] || ''}${(medecin.nom || '')[0] || ''}`.toUpperCase();

  return (
    <article
      className={`rounded-xl border p-4 ${choisi ? 'border-marque-600 bg-marque-50/60 ring-2 ring-marque-500/30' : 'border-slate-200 bg-white'}`}
      aria-label={`Fiche de ${nomComplet(medecin)}`}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <div
            aria-hidden="true"
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-base font-bold ${
              autre ? 'bg-sky-100 text-sky-800' : 'bg-marque-100 text-marque-800'
            }`}
          >
            {initiales}
          </div>
          <div className="min-w-0 space-y-2">
            <div>
              <Titre className="text-base font-semibold text-slate-900">{nomComplet(medecin)}</Titre>
              <p className="text-xs text-slate-500">
                {TYPES_PROFESSIONNEL[medecin.typeProfessionnel] || 'Médecin'}
                {afficherCompte && medecin.sansCompte && ' · fiche sans compte de connexion'}
              </p>
            </div>

            {specialites.length > 0 ? (
              <ul className="flex flex-wrap gap-1.5" aria-label="Spécialités">
                {specialites.map((s) => (
                  <li key={s.id} className="rounded-full bg-marque-50 px-2.5 py-0.5 text-xs font-medium text-marque-800">
                    {s.libelle}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-400">Spécialité non renseignée</p>
            )}

            <div className="space-y-1.5 pt-1">
              {medecin.telephone ? (
                <a
                  href={`tel:${medecin.telephone.replace(/[^+\d]/g, '')}`}
                  className="inline-flex items-center gap-2 rounded-lg bg-marque-600 px-3 py-1.5 text-base font-semibold text-white hover:bg-marque-700"
                >
                  <IconeTelephone />
                  {medecin.telephone}
                </a>
              ) : (
                <p className="flex items-center gap-2 text-sm text-slate-400">
                  <IconeTelephone /> Téléphone non renseigné
                </p>
              )}
              {medecin.adresseProfessionnelle ? (
                <p className="flex items-start gap-2 text-sm text-slate-700">
                  <span className="mt-0.5 text-marque-700">
                    <IconeLieu />
                  </span>
                  <span>
                    {medecin.adresseProfessionnelle}{' '}
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(medecin.adresseProfessionnelle)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="whitespace-nowrap text-xs font-medium text-marque-700 hover:underline"
                    >
                      Voir sur la carte
                    </a>
                  </span>
                </p>
              ) : (
                <p className="flex items-center gap-2 text-sm text-slate-400">
                  <IconeLieu /> Adresse professionnelle non renseignée
                </p>
              )}
            </div>
          </div>
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
      </div>
    </article>
  );
}
