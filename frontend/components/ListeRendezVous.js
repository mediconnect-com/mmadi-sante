'use client';
// Liste des rendez-vous, avec les actions permises selon le profil (le serveur revérifie chaque action).
import { useState } from 'react';
import Link from 'next/link';
import { appelApi } from '@/lib/api';
import { STATUTS_RDV, formaterDateHeure, nomComplet } from '@/lib/constantes';
import { Alerte, Bouton } from './ui';
import CarteMedecin from './CarteMedecin';

function BadgeStatut({ statut }) {
  const s = STATUTS_RDV[statut] || { libelle: statut, style: 'bg-slate-100 text-slate-700' };
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${s.style}`}>{s.libelle}</span>;
}

function LigneRendezVous({ rdv, role, surChangement, surErreur }) {
  const [enCours, setEnCours] = useState(false);
  const actif = rdv.statut === 'DEMANDE' || rdv.statut === 'CONFIRME';

  async function changer(statut, question) {
    if (question && !window.confirm(question)) return;
    setEnCours(true);
    try {
      await appelApi(`/rendez-vous/${rdv.id}/statut`, { methode: 'PATCH', json: { statut } });
      await surChangement();
    } catch (e) {
      surErreur(e.message);
    } finally {
      setEnCours(false);
    }
  }

  const boutons = [];
  if (role === 'PATIENT' && actif) {
    boutons.push(
      <Bouton key="a" variante="secondaire" enCours={enCours} onClick={() => changer('ANNULE', 'Annuler ce rendez-vous ?')}>
        Annuler le rendez-vous
      </Bouton>
    );
  }
  if ((role === 'MEDECIN' || role === 'ADMIN') && rdv.statut === 'DEMANDE') {
    boutons.push(
      <Bouton key="c" enCours={enCours} onClick={() => changer('CONFIRME')}>
        Confirmer
      </Bouton>,
      <Bouton key="r" variante="secondaire" enCours={enCours} onClick={() => changer('REFUSE', 'Refuser cette demande de rendez-vous ?')}>
        Refuser
      </Bouton>
    );
  }
  if ((role === 'MEDECIN' || role === 'ADMIN') && rdv.statut === 'CONFIRME') {
    boutons.push(
      <Bouton key="x" variante="secondaire" enCours={enCours} onClick={() => changer('ANNULE', 'Annuler ce rendez-vous confirmé ?')}>
        Annuler
      </Bouton>
    );
  }

  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-base font-semibold text-slate-900 first-letter:uppercase">
          <Link href={`/rendez-vous/detail/?id=${rdv.id}`} className="hover:text-marque-700 hover:underline" aria-label={`Ouvrir le rendez-vous du ${formaterDateHeure(rdv.dateHeure)}`}>
            {formaterDateHeure(rdv.dateHeure)}
          </Link>
        </p>
        <span className="flex items-center gap-2">
          <BadgeStatut statut={rdv.statut} />
          <Link href={`/rendez-vous/detail/?id=${rdv.id}`} className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">
            Ouvrir
          </Link>
        </span>
      </div>
      {rdv.motif && (
        <p className="mb-3 text-sm text-slate-700">
          <span className="font-medium">Motif :</span> {rdv.motif}
        </p>
      )}

      {role === 'PATIENT' ? (
        <CarteMedecin medecin={rdv.medecin} />
      ) : (
        <div className="space-y-2 text-sm text-slate-700">
          <p>
            <span className="font-medium">Patient :</span>{' '}
            {rdv.dossierAccessible ? (
              <Link
                href={role === 'ADMIN' ? `/admin/utilisateur/?id=${rdv.patient.id}` : `/medecin/patient/?id=${rdv.patient.id}`}
                className="font-medium text-marque-700 hover:underline"
              >
                {nomComplet(rdv.patient)}
              </Link>
            ) : (
              nomComplet(rdv.patient)
            )}
            {rdv.patient.telephone && <span className="text-slate-500"> · {rdv.patient.telephone}</span>}
            {!rdv.dossierAccessible && <span className="text-slate-400"> · dossier non partagé avec vous</span>}
          </p>
          {role === 'ADMIN' && (
            <p>
              <span className="font-medium">Médecin :</span> {nomComplet(rdv.medecin)}
              {rdv.medecin.specialites.length > 0 && <span className="text-slate-500"> · {rdv.medecin.specialites.map((s) => s.libelle).join(', ')}</span>}
              {rdv.medecin.telephone && <span className="text-slate-500"> · {rdv.medecin.telephone}</span>}
              {rdv.medecin.sansCompte && <span className="text-amber-700"> · fiche sans compte de connexion</span>}
            </p>
          )}
        </div>
      )}

      {role === 'PATIENT' && rdv.medecin.sansCompte && rdv.statut === 'DEMANDE' && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Ce médecin n&apos;utilise pas MmadiSanté : contactez-le au {rdv.medecin.telephone || 'numéro indiqué'} pour confirmer le rendez-vous.
        </p>
      )}
      {boutons.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{boutons}</div>}
    </li>
  );
}

export default function ListeRendezVous({ rendezVous, role, surChangement }) {
  const [erreur, setErreur] = useState('');
  const maintenant = Date.now();
  const aVenir = rendezVous.filter((r) => (r.statut === 'DEMANDE' || r.statut === 'CONFIRME') && new Date(r.dateHeure).getTime() >= maintenant - 3600000);
  const passes = rendezVous
    .filter((r) => !aVenir.includes(r))
    .sort((a, b) => new Date(b.dateHeure) - new Date(a.dateHeure));

  const rendu = (liste) => (
    <ul className="space-y-3">
      {liste.map((r) => (
        <LigneRendezVous key={r.id} rdv={r} role={role} surChangement={surChangement} surErreur={setErreur} />
      ))}
    </ul>
  );

  return (
    <div className="space-y-6">
      <Alerte>{erreur}</Alerte>
      <div>
        <h3 className="mb-3 text-base font-semibold text-slate-800">À venir ({aVenir.length})</h3>
        {aVenir.length === 0 ? <p className="text-sm text-slate-500">Aucun rendez-vous à venir.</p> : rendu(aVenir)}
      </div>
      {passes.length > 0 && (
        <div>
          <h3 className="mb-3 text-base font-semibold text-slate-800">Passés, refusés ou annulés ({passes.length})</h3>
          {rendu(passes)}
        </div>
      )}
    </div>
  );
}
