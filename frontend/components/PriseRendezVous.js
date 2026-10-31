'use client';
// Prise de rendez-vous par le patient, en deux cas :
//   1) le médecin existe déjà dans la base -> recherche par nom ou spécialité, sélection, puis rendez-vous ;
//   2) le médecin n'existe pas -> saisie de ses informations, VÉRIFICATION anti-doublon, création de la fiche
//      à la validation du rendez-vous (côté serveur, en une seule opération).
import { useCallback, useEffect, useState } from 'react';
import { appelApi } from '@/lib/api';
import { maintenantPourChamp } from '@/lib/constantes';
import { Alerte, Bouton, Carte, Champ, Chargement } from './ui';
import CarteMedecin from './CarteMedecin';
import SelecteurSpecialites from './SelecteurSpecialites';

const FICHE_VIDE = { nom: '', prenom: '', telephone: '', adresseProfessionnelle: '', specialiteIds: [] };

/** Étape 1 : choisir un médecin de l'annuaire. */
function Recherche({ surChoix, surNouveau }) {
  const [q, setQ] = useState('');
  const [specialiteIds, setSpecialiteIds] = useState([]);
  const [resultat, setResultat] = useState(null);
  const [erreur, setErreur] = useState('');

  useEffect(() => {
    let actif = true;
    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams();
        if (q.trim()) params.set('q', q.trim());
        if (specialiteIds[0]) params.set('specialiteId', specialiteIds[0]);
        const r = await appelApi(`/medecins?${params}`);
        if (actif) {
          setResultat(r);
          setErreur('');
        }
      } catch (e) {
        if (actif) setErreur(e.message);
      }
    }, 250);
    return () => {
      actif = false;
      clearTimeout(t);
    };
  }, [q, specialiteIds]);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Champ label="Nom du médecin ou spécialité" valeur={q} onChange={setQ} placeholder="Ex. Martin, cardiologie, pédiatre…" />
        <SelecteurSpecialites
          label="Filtrer par spécialité"
          valeur={specialiteIds}
          onChange={setSpecialiteIds}
          multiple={false}
          placeholder="Toutes les spécialités"
        />
      </div>
      <Alerte>{erreur}</Alerte>
      {!resultat && !erreur && <Chargement texte="Recherche…" />}
      {resultat && resultat.medecins.length === 0 && (
        <p className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">Aucun médecin ne correspond à votre recherche dans la base.</p>
      )}
      {resultat && resultat.medecins.length > 0 && (
        <>
          <p className="text-sm text-slate-500" role="status">
            {resultat.total} résultat{resultat.total > 1 ? 's' : ''}
            {resultat.total > resultat.medecins.length ? ` (les ${resultat.medecins.length} premiers sont affichés — précisez votre recherche)` : ''}
          </p>
          <ul className="space-y-3">
            {resultat.medecins.map((m) => (
              <li key={m.id}>
                <CarteMedecin medecin={m} actions={<Bouton onClick={() => surChoix(m)}>Choisir ce médecin</Bouton>} />
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="border-t border-slate-100 pt-4">
        <p className="mb-2 text-sm text-slate-600">Vous ne trouvez pas votre médecin ?</p>
        <Bouton variante="secondaire" onClick={surNouveau}>
          Ajouter un médecin absent de la liste
        </Bouton>
      </div>
    </div>
  );
}

/** Étape 1 bis : saisie d'un médecin absent de la base, avec vérification préalable des doublons. */
function SaisieNouveauMedecin({ initial, doublonsInitiaux, surRetour, surExistant, surValide }) {
  const [form, setForm] = useState(initial || FICHE_VIDE);
  const [doublons, setDoublons] = useState(doublonsInitiaux || null);
  const [erreur, setErreur] = useState('');
  const [enCours, setEnCours] = useState(false);
  const maj = (champ) => (valeur) => {
    setForm((f) => ({ ...f, [champ]: valeur }));
    setDoublons(null);
  };

  async function verifier(e) {
    e.preventDefault();
    setErreur('');
    if (form.specialiteIds.length === 0) {
      setErreur('Choisissez au moins une spécialité.');
      return;
    }
    setEnCours(true);
    try {
      const r = await appelApi('/medecins/verifier', {
        methode: 'POST',
        json: { nom: form.nom, prenom: form.prenom, telephone: form.telephone },
      });
      if (r.doublons.length === 0) surValide(form, false);
      else setDoublons(r.doublons);
    } catch (err) {
      setErreur(err.message);
    } finally {
      setEnCours(false);
    }
  }

  const bloquant = doublons?.some((d) => d.raison === 'telephone');
  return (
    <form onSubmit={verifier} className="space-y-4">
      <p className="text-sm text-slate-600">
        Renseignez les informations du médecin. Nous vérifions d&apos;abord qu&apos;il n&apos;existe pas déjà pour éviter les doublons.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Champ label="Prénom" valeur={form.prenom} onChange={maj('prenom')} requis maxLength={100} />
        <Champ label="Nom" valeur={form.nom} onChange={maj('nom')} requis maxLength={100} />
        <Champ label="Numéro de téléphone" type="tel" valeur={form.telephone} onChange={maj('telephone')} requis placeholder="+33 1 23 45 67 89" />
        <Champ label="Adresse professionnelle" valeur={form.adresseProfessionnelle} onChange={maj('adresseProfessionnelle')} maxLength={250} placeholder="Cabinet, rue, code postal, ville" />
      </div>
      <SelecteurSpecialites label="Spécialité(s)" valeur={form.specialiteIds} onChange={maj('specialiteIds')} requis aide="Choisissez dans la liste (recherche possible)." />
      <Alerte>{erreur}</Alerte>

      {doublons && doublons.length > 0 && (
        <div className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4" role="alert">
          <p className="text-sm font-medium text-amber-900">
            {bloquant
              ? 'Ce numéro de téléphone correspond à un médecin déjà enregistré. Sélectionnez-le pour éviter un doublon :'
              : 'Un médecin portant le même nom existe déjà. Est-ce le même ?'}
          </p>
          <ul className="space-y-3">
            {doublons.map((d) => (
              <li key={d.medecin.id}>
                <CarteMedecin medecin={d.medecin} actions={<Bouton onClick={() => surExistant(d.medecin)}>C&apos;est ce médecin</Bouton>} />
              </li>
            ))}
          </ul>
          {!bloquant && (
            <Bouton variante="secondaire" onClick={() => surValide(form, true)}>
              Non, c&apos;est un autre médecin : continuer
            </Bouton>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Bouton type="submit" enCours={enCours}>
          Vérifier et continuer
        </Bouton>
        <Bouton type="button" variante="secondaire" onClick={surRetour}>
          Retour à la recherche
        </Bouton>
      </div>
    </form>
  );
}

/** Étape 2 : date, heure et motif ; envoi de la demande. */
function Details({ medecin, nouveau, surRetour, surReussite, surDoublon }) {
  const [dateHeure, setDateHeure] = useState('');
  const [motif, setMotif] = useState('');
  const [autoriser, setAutoriser] = useState(false);
  const [erreur, setErreur] = useState('');
  const [enCours, setEnCours] = useState(false);

  async function envoyer(e) {
    e.preventDefault();
    setErreur('');
    setEnCours(true);
    try {
      const json = { dateHeure: new Date(dateHeure).toISOString(), motif };
      if (nouveau) {
        json.nouveauMedecin = { ...nouveau.fiche, confirmationHomonyme: nouveau.homonymeConfirme };
      } else {
        json.medecinId = medecin.id;
        json.autoriserAcces = autoriser;
      }
      const r = await appelApi('/rendez-vous', { methode: 'POST', json });
      surReussite(r);
    } catch (err) {
      if (err.statut === 409 && err.details?.medecinsExistants) surDoublon(err.details.medecinsExistants);
      else setErreur(err.message);
      setEnCours(false);
    }
  }

  const apercu = nouveau
    ? {
        id: 'nouveau',
        ...nouveau.fiche,
        specialites: nouveau.specialites,
        typeProfessionnel:
          nouveau.specialites.length > 0 && nouveau.specialites.every((s) => s.type === 'PROFESSIONNEL_SANTE') ? 'PROFESSIONNEL_SANTE' : 'MEDECIN',
      }
    : medecin;

  return (
    <form onSubmit={envoyer} className="space-y-4">
      <div>
        <p className="mb-2 text-sm font-medium text-slate-700">Médecin choisi</p>
        <CarteMedecin medecin={apercu} choisi />
        {nouveau && (
          <p className="mt-2 text-sm text-slate-600">
            Ce médecin n&apos;est pas encore dans la base : sa fiche sera créée avec votre demande et ajoutée à vos médecins.
          </p>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Champ label="Date et heure souhaitées" type="datetime-local" valeur={dateHeure} onChange={setDateHeure} requis min={maintenantPourChamp()} />
        <Champ label="Motif (facultatif)" valeur={motif} onChange={setMotif} maxLength={300} placeholder="Ex. consultation de suivi" />
      </div>
      {!nouveau && (
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={autoriser} onChange={(e) => setAutoriser(e.target.checked)} className="mt-1 h-4 w-4 rounded border-slate-300" />
          <span>
            Autoriser ce médecin à consulter mon dossier et mes documents.
            <span className="block text-xs text-slate-500">Facultatif. Vous pourrez le retirer à tout moment depuis « Mes médecins ».</span>
          </span>
        </label>
      )}
      <Alerte>{erreur}</Alerte>
      <div className="flex flex-wrap gap-2">
        <Bouton type="submit" enCours={enCours}>
          Envoyer la demande de rendez-vous
        </Bouton>
        <Bouton type="button" variante="secondaire" onClick={surRetour}>
          Changer de médecin
        </Bouton>
      </div>
    </form>
  );
}

export default function PriseRendezVous({ medecinInitialId, surCree }) {
  const [etape, setEtape] = useState(medecinInitialId ? 'chargement' : 'recherche');
  const [medecin, setMedecin] = useState(null);
  const [nouveau, setNouveau] = useState(null); // { fiche, specialites, homonymeConfirme }
  const [ficheEnCours, setFicheEnCours] = useState(null);
  const [doublons, setDoublons] = useState(null);
  const [succes, setSucces] = useState('');
  const [erreur, setErreur] = useState('');

  // Médecin présélectionné (lien « Prendre rendez-vous » depuis « Mes médecins »)
  useEffect(() => {
    if (!medecinInitialId) return;
    appelApi(`/medecins/${medecinInitialId}`)
      .then((r) => {
        setMedecin(r.medecin);
        setEtape('details');
      })
      .catch((e) => {
        setErreur(e.message);
        setEtape('recherche');
      });
  }, [medecinInitialId]);

  const reinitialiser = useCallback(() => {
    setMedecin(null);
    setNouveau(null);
    setFicheEnCours(null);
    setDoublons(null);
    setEtape('recherche');
  }, []);

  function reussite(r) {
    setSucces(
      r.medecinCree
        ? 'Votre demande est enregistrée et la fiche du médecin a été créée. Il figure maintenant dans « Mes médecins ».'
        : 'Votre demande de rendez-vous est enregistrée. Elle apparaît ci-dessous avec son statut.'
    );
    reinitialiser();
    surCree();
  }

  return (
    <Carte titre="Prendre un rendez-vous">
      <div className="space-y-4">
        <Alerte type="succes">{succes}</Alerte>
        <Alerte>{erreur}</Alerte>
        {etape === 'chargement' && <Chargement />}
        {etape === 'recherche' && (
          <Recherche
            surChoix={(m) => {
              setSucces('');
              setErreur('');
              setMedecin(m);
              setNouveau(null);
              setEtape('details');
            }}
            surNouveau={() => {
              setSucces('');
              setErreur('');
              setEtape('nouveau');
            }}
          />
        )}
        {etape === 'nouveau' && (
          <SaisieNouveauMedecin
            initial={ficheEnCours}
            doublonsInitiaux={doublons}
            surRetour={reinitialiser}
            surExistant={(m) => {
              setMedecin(m);
              setNouveau(null);
              setEtape('details');
            }}
            surValide={async (fiche, homonymeConfirme) => {
              // On retrouve le libellé des spécialités pour l'aperçu.
              let specialites = [];
              try {
                const r = await appelApi('/specialites');
                specialites = r.specialites.filter((s) => fiche.specialiteIds.includes(s.id));
              } catch {
                /* l'aperçu s'affichera sans les libellés */
              }
              setFicheEnCours(fiche);
              setNouveau({ fiche, specialites, homonymeConfirme });
              setMedecin(null);
              setEtape('details');
            }}
          />
        )}
        {etape === 'details' && (medecin || nouveau) && (
          <Details
            medecin={medecin}
            nouveau={nouveau}
            surRetour={() => (nouveau ? setEtape('nouveau') : reinitialiser())}
            surReussite={reussite}
            surDoublon={(liste) => {
              // Le serveur a trouvé un doublon au dernier moment : on revient à la vérification.
              setDoublons(liste);
              setNouveau(null);
              setEtape('nouveau');
            }}
          />
        )}
      </div>
    </Carte>
  );
}

