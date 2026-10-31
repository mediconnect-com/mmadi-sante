'use client';
// Fiche complète d'un utilisateur (informations + documents), en lecture pour le médecin,
// avec gestion des attributions et suppression pour l'administrateur.
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { appelApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formaterDate } from '@/lib/constantes';
import { Alerte, BadgeRole, Bouton, Carte, Chargement, Page, Selecteur } from './ui';
import ListeDocuments from './ListeDocuments';

function Info({ label, valeur }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-slate-800">{valeur || <span className="text-slate-400">Non renseigné</span>}</dd>
    </div>
  );
}

/** Gestion des attributions patient ↔ médecin (administrateur uniquement). */
function Attributions({ utilisateur, liee, surChangement }) {
  const estPatient = utilisateur.role === 'PATIENT';
  const [candidats, setCandidats] = useState([]);
  const [choix, setChoix] = useState('');
  const [erreur, setErreur] = useState('');
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    let actif = true;
    appelApi(`/admin/utilisateurs?role=${estPatient ? 'MEDECIN' : 'PATIENT'}`)
      .then((r) => actif && setCandidats(r.utilisateurs))
      .catch((e) => actif && setErreur(e.message));
    return () => {
      actif = false;
    };
  }, [estPatient]);

  const dejaLies = new Set(liee.map((l) => l.id));
  const disponibles = candidats.filter((c) => !dejaLies.has(c.id));

  async function ajouter() {
    if (!choix) return;
    setErreur('');
    setEnCours(true);
    try {
      await appelApi('/admin/attributions', {
        methode: 'POST',
        json: estPatient ? { patientId: utilisateur.id, medecinId: choix } : { patientId: choix, medecinId: utilisateur.id },
      });
      setChoix('');
      await surChangement();
    } catch (e) {
      setErreur(e.message);
    } finally {
      setEnCours(false);
    }
  }

  async function retirer(attributionId) {
    setErreur('');
    try {
      await appelApi(`/admin/attributions/${attributionId}`, { methode: 'DELETE' });
      await surChangement();
    } catch (e) {
      setErreur(e.message);
    }
  }

  return (
    <Carte titre={estPatient ? 'Médecins attribués' : 'Patients suivis'}>
      <div className="space-y-4">
        {liee.length === 0 ? (
          <p className="text-sm text-slate-500">{estPatient ? 'Aucun médecin attribué.' : 'Aucun patient attribué.'}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {liee.map((l) => (
              <li key={l.attributionId} className="flex items-center justify-between gap-3 py-2">
                <span>
                  <Link href={`/admin/utilisateur/?id=${l.id}`} className="font-medium text-marque-700 hover:underline">
                    {l.prenom} {l.nom}
                  </Link>{' '}
                  <span className="text-sm text-slate-500">{l.email}</span>
                </span>
                <Bouton variante="secondaire" onClick={() => retirer(l.attributionId)}>
                  Retirer
                </Bouton>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Selecteur
              label={estPatient ? 'Attribuer un médecin' : 'Attribuer un patient'}
              valeur={choix}
              onChange={setChoix}
              options={[
                { valeur: '', libelle: disponibles.length ? '— Choisir —' : '— Aucun disponible —' },
                ...disponibles.map((c) => ({ valeur: c.id, libelle: `${c.prenom} ${c.nom} (${c.email})` })),
              ]}
            />
          </div>
          <Bouton onClick={ajouter} enCours={enCours} disabled={!choix}>
            Attribuer
          </Bouton>
        </div>
        <Alerte>{erreur}</Alerte>
      </div>
    </Carte>
  );
}

export default function DossierUtilisateur({ id, admin = false }) {
  const router = useRouter();
  const { utilisateur: moi } = useAuth();
  const [donnees, setDonnees] = useState(null);
  const [erreur, setErreur] = useState('');

  const charger = useCallback(async () => {
    try {
      setDonnees(await appelApi(`/utilisateurs/${id}`));
    } catch (e) {
      setErreur(e.message);
    }
  }, [id]);

  useEffect(() => {
    if (id) charger();
    else setErreur('Aucun utilisateur indiqué.');
  }, [id, charger]);

  async function supprimerUtilisateur() {
    const u = donnees.utilisateur;
    if (!window.confirm(`Supprimer définitivement le compte de ${u.prenom} ${u.nom}, ainsi que tous ses documents ?`)) return;
    try {
      await appelApi(`/admin/utilisateurs/${u.id}`, { methode: 'DELETE' });
      router.replace('/admin/');
    } catch (e) {
      setErreur(e.message);
    }
  }

  const retour = admin ? { href: '/admin/', texte: '← Tous les utilisateurs' } : { href: '/medecin/', texte: '← Mes patients' };

  if (erreur && !donnees) {
    return (
      <Page titre="Dossier">
        <Alerte>{erreur}</Alerte>
        <Link href={retour.href} className="text-marque-700 hover:underline">
          {retour.texte}
        </Link>
      </Page>
    );
  }
  if (!donnees) return <Chargement />;

  const u = donnees.utilisateur;
  return (
    <Page
      titre={`${u.prenom} ${u.nom}`}
      sousTitre={<BadgeRole role={u.role} />}
      action={
        <Link href={retour.href} className="text-sm font-medium text-marque-700 hover:underline">
          {retour.texte}
        </Link>
      }
    >
      <Alerte>{erreur}</Alerte>
      <Carte titre="Informations">
        <dl className="grid gap-4 sm:grid-cols-2">
          <Info label="Nom" valeur={u.nom} />
          <Info label="Prénom" valeur={u.prenom} />
          <Info label="E-mail" valeur={u.email} />
          <Info label="Numéro de mobile" valeur={u.telephone} />
          <Info label="Adresse" valeur={u.adresse} />
          <Info label="Carte d'identité" valeur={u.carteIdentite} />
          <Info label="Compte créé le" valeur={formaterDate(u.creeLe)} />
          <Info label="Dernière modification" valeur={formaterDate(u.modifieLe)} />
        </dl>
      </Carte>

      <Carte titre={`Documents (${donnees.documents.length})`}>
        <ListeDocuments
          documents={donnees.documents}
          peutSupprimer={admin}
          surSuppression={charger}
          vide="Aucun document enregistré par cet utilisateur."
        />
      </Carte>

      {admin && u.role === 'PATIENT' && (
        <Attributions utilisateur={u} liee={donnees.medecins || []} surChangement={charger} />
      )}
      {admin && u.role === 'MEDECIN' && (
        <Attributions utilisateur={u} liee={donnees.patients || []} surChangement={charger} />
      )}

      {admin && u.id !== moi?.id && (
        <Carte titre="Zone sensible">
          <p className="mb-3 text-sm text-slate-600">
            La suppression est définitive : le compte, ses documents et ses attributions sont effacés.
          </p>
          <Bouton variante="danger" onClick={supprimerUtilisateur}>
            Supprimer cet utilisateur
          </Bouton>
        </Carte>
      )}
    </Page>
  );
}
