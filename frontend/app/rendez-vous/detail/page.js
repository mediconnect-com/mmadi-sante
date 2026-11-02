'use client';
// Détail d'un rendez-vous (V3) : ouvert d'un clic depuis la liste. Patient et médecin concernés, ou administrateur.
// Les actions (confirmer, refuser, annuler) sont les mêmes que dans la liste ; le serveur revérifie chaque droit.
import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { appelApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { STATUTS_RDV, formaterDate, formaterDateHeure, nomComplet } from '@/lib/constantes';
import Protege from '@/components/Protege';
import CarteMedecin from '@/components/CarteMedecin';
import { Alerte, Bouton, Carte, Chargement, Page } from '@/components/ui';

function Info({ label, children }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 break-words text-slate-800">{children || <span className="text-slate-400">Non renseigné</span>}</dd>
    </div>
  );
}

function Contenu() {
  const { utilisateur } = useAuth();
  const id = useSearchParams().get('id');
  const [rdv, setRdv] = useState(null);
  const [erreur, setErreur] = useState('');
  const [enCours, setEnCours] = useState(false);

  const charger = useCallback(async () => {
    if (!id) return setErreur('Aucun rendez-vous indiqué.');
    try {
      setRdv((await appelApi(`/rendez-vous/${id}`)).rendezVous);
      setErreur('');
    } catch (e) {
      setErreur(e.message);
    }
  }, [id]);

  useEffect(() => {
    charger();
  }, [charger]);

  async function changer(statut, question) {
    if (question && !window.confirm(question)) return;
    setEnCours(true);
    try {
      await appelApi(`/rendez-vous/${id}/statut`, { methode: 'PATCH', json: { statut } });
      await charger();
    } catch (e) {
      setErreur(e.message);
    } finally {
      setEnCours(false);
    }
  }

  const retour = { href: '/rendez-vous/', texte: '← Tous les rendez-vous' };
  if (!rdv) {
    return (
      <Page titre="Rendez-vous" action={<Link href={retour.href} className="text-sm font-medium text-marque-700 hover:underline">{retour.texte}</Link>}>
        <Alerte>{erreur}</Alerte>
        {!erreur && <Chargement />}
      </Page>
    );
  }

  const role = utilisateur.role;
  const s = STATUTS_RDV[rdv.statut] || { libelle: rdv.statut, style: 'bg-slate-100 text-slate-700' };
  const actif = rdv.statut === 'DEMANDE' || rdv.statut === 'CONFIRME';
  const ficheHref = rdv.patient ? (role === 'ADMIN' ? `/admin/utilisateur/?id=${rdv.patient.id}` : `/medecin/patient/?id=${rdv.patient.id}`) : null;

  return (
    <Page
      titre="Rendez-vous"
      sousTitre={<span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${s.style}`}>{s.libelle}</span>}
      action={<Link href={retour.href} className="text-sm font-medium text-marque-700 hover:underline">{retour.texte}</Link>}
    >
      <Alerte>{erreur}</Alerte>
      <Carte titre="Informations">
        <dl className="grid gap-4 sm:grid-cols-2">
          <Info label="Date et heure"><span className="first-letter:uppercase">{formaterDateHeure(rdv.dateHeure)}</span></Info>
          <Info label="Statut">{s.libelle}</Info>
          <Info label="Motif">{rdv.motif}</Info>
          <Info label="Demandé le">{formaterDate(rdv.creeLe)}</Info>
          {rdv.modifieLe && <Info label="Dernière mise à jour">{formaterDate(rdv.modifieLe)}</Info>}
        </dl>
      </Carte>

      {rdv.patient && (
        <Carte titre="Patient">
          <dl className="grid gap-4 sm:grid-cols-2">
            <Info label="Nom">{nomComplet(rdv.patient)}</Info>
            <Info label="Téléphone">{rdv.patient.telephone}</Info>
            {role === 'ADMIN' && <Info label="E-mail">{rdv.patient.email}</Info>}
          </dl>
          {rdv.dossierAccessible ? (
            <Link href={ficheHref} className="mt-4 inline-flex rounded-lg bg-marque-600 px-4 py-2 text-sm font-medium text-white hover:bg-marque-700">
              Ouvrir la fiche du patient
            </Link>
          ) : (
            <p className="mt-3 text-sm text-slate-500">Dossier non partagé avec vous.</p>
          )}
        </Carte>
      )}

      <Carte titre="Médecin">
        <CarteMedecin
          medecin={rdv.medecin}
          afficherCompte
          actions={
            role === 'ADMIN' ? (
              <Link href={`/admin/utilisateur/?id=${rdv.medecin.id}`} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Voir la fiche
              </Link>
            ) : null
          }
        />
      </Carte>

      {(actif || ((role === 'MEDECIN' || role === 'ADMIN') && rdv.statut === 'DEMANDE')) && (
        <Carte titre="Actions">
          <div className="flex flex-wrap gap-2">
            {(role === 'MEDECIN' || role === 'ADMIN') && rdv.statut === 'DEMANDE' && (
              <>
                <Bouton enCours={enCours} onClick={() => changer('CONFIRME')}>Confirmer</Bouton>
                <Bouton variante="secondaire" enCours={enCours} onClick={() => changer('REFUSE', 'Refuser cette demande de rendez-vous ?')}>Refuser</Bouton>
              </>
            )}
            {actif && (role === 'PATIENT' || rdv.statut === 'CONFIRME') && (
              <Bouton variante="secondaire" enCours={enCours} onClick={() => changer('ANNULE', 'Annuler ce rendez-vous ?')}>Annuler le rendez-vous</Bouton>
            )}
          </div>
        </Carte>
      )}
    </Page>
  );
}

export default function PageDetailRendezVous() {
  return (
    <Protege>
      <Suspense fallback={<Chargement />}>
        <Contenu />
      </Suspense>
    </Protege>
  );
}
