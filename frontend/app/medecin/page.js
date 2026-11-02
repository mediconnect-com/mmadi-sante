'use client';
// Espace médecin : liste des patients qui lui sont attribués, avec de quoi retrouver et ouvrir vite une fiche (V3).
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { appelApi } from '@/lib/api';
import { formaterDate, formaterDateHeure, formaterDepuis, normaliser, STATUTS_RDV } from '@/lib/constantes';
import Protege from '@/components/Protege';
import { Alerte, Carte, Champ, Chargement, Page, Selecteur } from '@/components/ui';

const TRIS = [
  { valeur: 'nom', libelle: 'Nom (A → Z)' },
  { valeur: 'depot', libelle: 'Dernier document déposé' },
  { valeur: 'rdv', libelle: 'Prochain rendez-vous' },
  { valeur: 'attribution', libelle: 'Récemment attribués' },
];

function Initiales({ p }) {
  return (
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-marque-100 text-sm font-bold text-marque-800" aria-hidden="true">
      {`${p.prenom[0] || ''}${p.nom[0] || ''}`.toUpperCase()}
    </span>
  );
}

function LignePatient({ p, joursRecent }) {
  const fiche = `/medecin/patient/?id=${p.id}`;
  const rdv = p.prochainRendezVous;
  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-marque-300 hover:shadow">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link href={fiche} className="flex min-w-0 flex-1 items-start gap-3" aria-label={`Ouvrir la fiche de ${p.prenom} ${p.nom}`}>
          <Initiales p={p} />
          <span className="min-w-0">
            <span className="block text-base font-semibold text-slate-900 hover:text-marque-700">
              {p.prenom} {p.nom}
            </span>
            <span className="block truncate text-sm text-slate-500">
              {p.email || 'sans e-mail'}
              {p.telephone ? ` · ${p.telephone}` : ''}
            </span>
            <span className="mt-2 flex flex-wrap gap-1.5 text-xs">
              {p.nombreDocumentsRecents > 0 && (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-800">
                  {p.nombreDocumentsRecents} document{p.nombreDocumentsRecents > 1 ? 's' : ''} récent{p.nombreDocumentsRecents > 1 ? 's' : ''}
                </span>
              )}
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">
                {p.nombreDocuments} document{p.nombreDocuments > 1 ? 's' : ''}
                {p.dernierDocumentLe ? ` · dernier ${formaterDepuis(p.dernierDocumentLe)}` : ''}
              </span>
              {rdv && (
                <span className={`rounded-full px-2 py-0.5 font-medium ${STATUTS_RDV[rdv.statut]?.style || 'bg-slate-100 text-slate-700'}`}>
                  RDV {formaterDateHeure(rdv.dateHeure)}
                  {rdv.statut === 'DEMANDE' ? ' (à confirmer)' : ''}
                </span>
              )}
              {p.nombreCommentaires > 0 && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-900">
                  {p.nombreCommentaires} commentaire{p.nombreCommentaires > 1 ? 's' : ''}
                </span>
              )}
            </span>
          </span>
        </Link>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Link href={fiche} className="rounded-lg bg-marque-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-marque-700">
            Ouvrir la fiche
          </Link>
          <Link href={`${fiche}#documents`} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Documents
          </Link>
          <Link href={`${fiche}#commentaires`} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Commentaires
          </Link>
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-400">Attribué le {formaterDate(p.attribueLe)} · récent = déposé il y a moins de {joursRecent} jours</p>
    </li>
  );
}

function Contenu() {
  const [reponse, setReponse] = useState(null);
  const [erreur, setErreur] = useState('');
  const [recherche, setRecherche] = useState('');
  const [tri, setTri] = useState('nom');
  const [seulementRecents, setSeulementRecents] = useState(false);

  useEffect(() => {
    appelApi('/medecin/patients')
      .then(setReponse)
      .catch((e) => setErreur(e.message));
  }, []);

  const patients = reponse?.patients;
  const visibles = useMemo(() => {
    if (!patients) return [];
    const termes = normaliser(recherche).split(' ').filter(Boolean);
    const filtres = patients.filter((p) => {
      if (seulementRecents && p.nombreDocumentsRecents === 0) return false;
      if (termes.length === 0) return true;
      const texte = normaliser([p.nom, p.prenom, p.email, p.telephone].join(' '));
      return termes.every((t) => texte.includes(t));
    });
    const date = (v) => (v ? new Date(v).getTime() : 0);
    const comparateurs = {
      nom: (a, b) => a.nom.localeCompare(b.nom, 'fr') || a.prenom.localeCompare(b.prenom, 'fr'),
      depot: (a, b) => date(b.dernierDocumentLe) - date(a.dernierDocumentLe),
      rdv: (a, b) => (a.prochainRendezVous ? date(a.prochainRendezVous.dateHeure) : Infinity) - (b.prochainRendezVous ? date(b.prochainRendezVous.dateHeure) : Infinity),
      attribution: (a, b) => date(b.attribueLe) - date(a.attribueLe),
    };
    return filtres.sort(comparateurs[tri]);
  }, [patients, recherche, tri, seulementRecents]);

  const nbRecents = patients ? patients.filter((p) => p.nombreDocumentsRecents > 0).length : 0;

  return (
    <Page titre="Mes patients" sousTitre="Les patients qui vous ont été attribués par l'administrateur. Cliquez sur un patient pour ouvrir sa fiche.">
      <Alerte>{erreur}</Alerte>
      {!patients && !erreur && <Chargement />}
      {patients && patients.length === 0 && (
        <Carte>
          <p className="text-sm text-slate-500">Aucun patient ne vous est attribué pour le moment.</p>
        </Carte>
      )}
      {patients && patients.length > 0 && (
        <>
          <Carte>
            <div className="grid gap-3 sm:grid-cols-[1fr_240px]">
              <Champ label="Rechercher un patient (nom, prénom, e-mail, téléphone)" valeur={recherche} onChange={setRecherche} type="search" autoComplete="off" />
              <Selecteur label="Trier par" valeur={tri} onChange={setTri} options={TRIS} />
            </div>
            <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={seulementRecents} onChange={(e) => setSeulementRecents(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-marque-600" />
              Seulement les patients avec des documents récents ({nbRecents})
            </label>
          </Carte>
          <p className="text-sm text-slate-600" role="status">
            {visibles.length} patient{visibles.length > 1 ? 's' : ''} affiché{visibles.length > 1 ? 's' : ''} sur {patients.length}
          </p>
          {visibles.length === 0 ? (
            <Carte>
              <p className="text-sm text-slate-500">Aucun patient ne correspond à cette recherche.</p>
            </Carte>
          ) : (
            <ul className="space-y-3">
              {visibles.map((p) => (
                <LignePatient key={p.id} p={p} joursRecent={reponse.joursRecent} />
              ))}
            </ul>
          )}
        </>
      )}
    </Page>
  );
}

export default function PageMedecin() {
  return (
    <Protege roles={['MEDECIN']}>
      <Contenu />
    </Protege>
  );
}
