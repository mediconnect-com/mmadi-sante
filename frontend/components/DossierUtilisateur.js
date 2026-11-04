'use client';
// Fiche complète d'un utilisateur (informations + documents), en lecture pour le médecin,
// avec gestion des attributions et suppression pour l'administrateur.
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { appelApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { CATEGORIES, formaterDate, formaterDepuis } from '@/lib/constantes';
import { Alerte, BadgeRole, Bouton, Carte, Champ, Chargement, Page, Selecteur } from './ui';
import ListeDocuments from './ListeDocuments';
import CarteMedecin from './CarteMedecin';
import SelecteurSpecialites from './SelecteurSpecialites';
import TeleversementDocuments from './TeleversementDocuments';
import CommentairesPatient from './CommentairesPatient';

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
  const [specialites, setSpecialites] = useState([]);
  const [filtreSpecialite, setFiltreSpecialite] = useState('');
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

  // V3 : pour attribuer un médecin à un patient, on peut d'abord choisir une spécialité.
  useEffect(() => {
    if (!estPatient) return undefined;
    let actif = true;
    appelApi('/specialites')
      .then((r) => actif && setSpecialites(r.specialites))
      .catch(() => {});
    return () => {
      actif = false;
    };
  }, [estPatient]);

  const dejaLies = new Set(liee.map((l) => l.id));
  const sansFiltre = candidats.filter((c) => !dejaLies.has(c.id));
  const disponibles =
    estPatient && filtreSpecialite ? sansFiltre.filter((c) => (c.specialites || []).some((s) => s.id === filtreSpecialite)) : sansFiltre;
  // Seules les spécialités réellement portées par un médecin disponible sont proposées (avec leur effectif).
  const effectifParSpecialite = new Map();
  if (estPatient) for (const c of sansFiltre) for (const s of c.specialites || []) effectifParSpecialite.set(s.id, (effectifParSpecialite.get(s.id) || 0) + 1);
  const optionsSpecialite = specialites
    .filter((s) => effectifParSpecialite.has(s.id))
    .map((s) => ({ valeur: s.id, libelle: `${s.libelle} (${effectifParSpecialite.get(s.id)})` }));
  // Fiche du médecin / patient sélectionné dans la liste, relue depuis la base (aucune ressaisie).
  const choisi = disponibles.find((c) => c.id === choix);
  const libelleCandidat = (c) =>
    estPatient
      ? `${c.prenom} ${c.nom}${c.specialites?.length ? ` — ${c.specialites.map((s) => s.libelle).join(', ')}` : ''}`
      : `${c.prenom} ${c.nom} (${c.email})`;

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
          <ul className={estPatient ? 'space-y-3' : 'divide-y divide-slate-100'}>
            {liee.map((l) =>
              estPatient ? (
                <li key={l.attributionId}>
                  <CarteMedecin
                    medecin={l}
                    afficherCompte
                    actions={
                      <>
                        <Link
                          href={`/admin/utilisateur/?id=${l.id}`}
                          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                        >
                          Voir la fiche
                        </Link>
                        <Bouton variante="secondaire" onClick={() => retirer(l.attributionId)}>
                          Retirer
                        </Bouton>
                      </>
                    }
                  />
                </li>
              ) : (
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
              )
            )}
          </ul>
        )}
        {estPatient && (
          <Selecteur
            label="Filtrer les médecins par spécialité"
            valeur={filtreSpecialite}
            onChange={(v) => {
              setFiltreSpecialite(v);
              setChoix('');
            }}
            options={[{ valeur: '', libelle: `Toutes les spécialités (${sansFiltre.length} médecin${sansFiltre.length > 1 ? 's' : ''})` }, ...optionsSpecialite]}
          />
        )}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Selecteur
              label={estPatient ? 'Attribuer un médecin' : 'Attribuer un patient'}
              valeur={choix}
              onChange={setChoix}
              options={[
                { valeur: '', libelle: disponibles.length ? '— Choisir —' : '— Aucun disponible —' },
                ...disponibles.map((c) => ({ valeur: c.id, libelle: libelleCandidat(c) })),
              ]}
            />
          </div>
          <Bouton onClick={ajouter} enCours={enCours} disabled={!choix}>
            Attribuer
          </Bouton>
        </div>
        {choisi && estPatient && (
          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">Médecin sélectionné</p>
            <CarteMedecin medecin={choisi} choisi afficherCompte />
          </div>
        )}
        {choisi && !estPatient && (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
            Patient sélectionné : <strong>{choisi.prenom} {choisi.nom}</strong> · {choisi.email} · {choisi.telephone || 'pas de mobile'}
          </p>
        )}
        <Alerte>{erreur}</Alerte>
      </div>
    </Carte>
  );
}

/** Modification de la fiche d'un médecin par l'administrateur (PUT /admin/medecins/:id). */
function FicheMedecin({ utilisateur, surChangement }) {
  const [form, setForm] = useState({
    prenom: utilisateur.prenom || '',
    nom: utilisateur.nom || '',
    telephone: utilisateur.telephone || '',
    email: utilisateur.email || '',
    adresseProfessionnelle: utilisateur.adresseProfessionnelle || '',
    specialiteIds: (utilisateur.specialites || []).map((s) => s.id),
  });
  const [erreur, setErreur] = useState('');
  const [succes, setSucces] = useState('');
  const [enCours, setEnCours] = useState(false);
  const maj = (champ) => (valeur) => setForm((f) => ({ ...f, [champ]: valeur }));

  async function enregistrer(e) {
    e.preventDefault();
    setErreur('');
    setSucces('');
    setEnCours(true);
    try {
      await appelApi(`/admin/medecins/${utilisateur.id}`, { methode: 'PUT', json: form });
      setSucces('La fiche du médecin a été mise à jour.');
      await surChangement();
    } catch (err) {
      setErreur(err.message);
    } finally {
      setEnCours(false);
    }
  }

  return (
    <Carte titre="Fiche du médecin (modifiable)">
      <form onSubmit={enregistrer} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Champ label="Prénom" valeur={form.prenom} onChange={maj('prenom')} requis maxLength={100} />
          <Champ label="Nom" valeur={form.nom} onChange={maj('nom')} requis maxLength={100} />
          <Champ label="Numéro de téléphone" type="tel" valeur={form.telephone} onChange={maj('telephone')} />
          <Champ
            label="Adresse e-mail"
            type="email"
            valeur={form.email}
            onChange={maj('email')}
            requis={!utilisateur.sansCompte}
            aide={utilisateur.sansCompte ? 'Facultative (fiche sans compte de connexion).' : "Identifiant de connexion du médecin."}
          />
        </div>
        <Champ label="Adresse professionnelle" valeur={form.adresseProfessionnelle} onChange={maj('adresseProfessionnelle')} maxLength={250} />
        <SelecteurSpecialites label="Spécialités" valeur={form.specialiteIds} onChange={maj('specialiteIds')} deja={utilisateur.specialites || []} />
        <Alerte>{erreur}</Alerte>
        <Alerte type="succes">{succes}</Alerte>
        <Bouton type="submit" enCours={enCours}>
          Enregistrer la fiche
        </Bouton>
      </form>
    </Carte>
  );
}

/** Réinitialisation du mot de passe d'un utilisateur par l'administrateur (PUT /admin/utilisateurs/:id/mot-de-passe). */
function ReinitialisationMotDePasse({ utilisateur }) {
  const [mdp, setMdp] = useState('');
  const [voir, setVoir] = useState(false);
  const [erreur, setErreur] = useState('');
  const [succes, setSucces] = useState('');
  const [enCours, setEnCours] = useState(false);

  async function envoyer(e) {
    e.preventDefault();
    setErreur('');
    setSucces('');
    setEnCours(true);
    try {
      const r = await appelApi(`/admin/utilisateurs/${utilisateur.id}/mot-de-passe`, { methode: 'PUT', json: { nouveauMotDePasse: mdp } });
      setSucces(r.message);
      setMdp('');
    } catch (err) {
      setErreur(err.message);
    } finally {
      setEnCours(false);
    }
  }

  return (
    <Carte titre="Mot de passe">
      <p className="mb-3 text-sm text-slate-600">
        Un mot de passe ne peut pas être consulté (il est stocké chiffré). En cas d’oubli, définissez-en un nouveau et communiquez-le à {utilisateur.prenom} par un canal sûr ; il pourra ensuite le changer lui-même dans Mon profil.
      </p>
      <form onSubmit={envoyer} className="space-y-3">
        <Champ
          label="Nouveau mot de passe"
          type={voir ? 'text' : 'password'}
          valeur={mdp}
          onChange={setMdp}
          requis
          maxLength={100}
          autoComplete="new-password"
          aide="8 caractères minimum, avec au moins une lettre et un chiffre."
        />
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={voir} onChange={(e) => setVoir(e.target.checked)} /> Afficher le mot de passe
        </label>
        <Alerte>{erreur}</Alerte>
        <Alerte type="succes">{succes}</Alerte>
        <Bouton type="submit" enCours={enCours}>
          Modifier le mot de passe
        </Bouton>
      </form>
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

  // Les liens « Documents » / « Commentaires » de la liste des patients arrivent avec une ancre (#documents…) :
  // la fiche se charge d'abord, puis on défile jusqu'à la bonne section.
  const dejaDefile = useRef(false);
  useEffect(() => {
    if (!donnees || dejaDefile.current || typeof window === 'undefined' || !window.location.hash) return;
    dejaDefile.current = true;
    const cible = document.getElementById(window.location.hash.slice(1));
    if (cible) cible.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [donnees]);

  async function retirerDocument(d) {
    if (!window.confirm(`Retirer « ${d.nomFichier} » de la fiche du patient ?`)) return;
    try {
      await appelApi(`/documents/${d.id}`, { methode: 'DELETE' });
      await charger();
    } catch (e) {
      setErreur(e.message);
    }
  }

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
          {u.role === 'MEDECIN' && (
            <>
              <Info
                label="Spécialités"
                valeur={u.specialites?.length ? u.specialites.map((s) => s.libelle).join(', ') : ''}
              />
              <Info label="Adresse professionnelle" valeur={u.adresseProfessionnelle} />
              {u.sansCompte && <Info label="Compte" valeur="Fiche sans compte de connexion" />}
            </>
          )}
          <Info label="Compte créé le" valeur={formaterDate(u.creeLe)} />
          <Info label="Dernière modification" valeur={formaterDate(u.modifieLe)} />
        </dl>
      </Carte>

      {/* Documents : l'administrateur (et le patient lui-même, dans « Mon dossier ») les voient ; un médecin JAMAIS. */}
      {donnees.documents && (
        <div id="documents" className="scroll-mt-20">
          <Carte titre={`Documents (${donnees.documents.length})`}>
            <ListeDocuments
              documents={donnees.documents}
              grouper={u.role === 'PATIENT'}
              peutSupprimer={admin}
              surSuppression={charger}
              vide="Aucun document enregistré par cet utilisateur."
            />
          </Carte>
        </div>
      )}

      {!admin && moi?.role === 'MEDECIN' && u.role === 'PATIENT' && (
        <>
          <Carte titre="Déposer un document dans la fiche de ce patient">
            <p className="mb-3 text-sm text-slate-600">
              Le document sera visible par le patient dans son dossier, avec la date de dépôt et votre nom. <strong>Vous ne pourrez pas le rouvrir ensuite</strong> : les documents d&apos;un patient ne sont accessibles qu&apos;à lui-même et à l&apos;administrateur.
            </p>
            <TeleversementDocuments chemin={`/utilisateurs/${u.id}/documents`} surTermine={charger} />
          </Carte>
          <div id="documents">
            <Carte titre={`Documents que vous avez transmis (${(donnees.documentsTransmis || []).length})`}>
              {(donnees.documentsTransmis || []).length === 0 ? (
                <p className="text-sm text-slate-500">Vous n&apos;avez transmis aucun document à ce patient.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {donnees.documentsTransmis.map((d) => (
                    <li key={d.id} className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between">
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-slate-800">{d.nomFichier}</span>
                        <span className="block text-xs text-slate-500">
                          {CATEGORIES[d.categorie] || d.categorie} · transmis le {formaterDate(d.creeLe)} ({formaterDepuis(d.creeLe)})
                        </span>
                      </span>
                      <Bouton variante="secondaire" onClick={() => retirerDocument(d)}>
                        Retirer
                      </Bouton>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-xs text-slate-500">Accusé de dépôt uniquement : le contenu des documents n&apos;est pas accessible aux médecins.</p>
            </Carte>
          </div>
        </>
      )}

      {u.role === 'PATIENT' && (admin || moi?.role === 'MEDECIN') && (
        <div id="commentaires" className="scroll-mt-20">
          <Carte titre={admin ? `Commentaires et pathologies rédigés par les médecins (${(donnees.commentaires || []).length})` : 'Commentaires et pathologies'}>
            <CommentairesPatient
              commentaires={donnees.commentaires || []}
              rendezVousCommentables={donnees.rendezVousCommentables || []}
              mode={admin ? 'lecture' : 'medecin'}
              surChangement={charger}
              vide={admin ? 'Aucun médecin n’a encore saisi de commentaire sur ce patient.' : 'Vous n’avez pas encore saisi de commentaire sur ce patient.'}
            />
          </Carte>
        </div>
      )}

      {admin && u.role === 'MEDECIN' && (
        <FicheMedecin key={u.modifieLe} utilisateur={u} surChangement={charger} />
      )}
      {admin && u.role === 'PATIENT' && (
        <Attributions utilisateur={u} liee={donnees.medecins || []} surChangement={charger} />
      )}
      {admin && u.role === 'MEDECIN' && (
        <Attributions utilisateur={u} liee={donnees.patients || []} surChangement={charger} />
      )}

      {admin && u.id !== moi?.id && !u.sansCompte && <ReinitialisationMotDePasse utilisateur={u} />}

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
