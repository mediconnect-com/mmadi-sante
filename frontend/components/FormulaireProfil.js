'use client';
import { useState } from 'react';
import { appelApi } from '@/lib/api';
import { masquer } from '@/lib/constantes';
import { Alerte, Bouton, Champ } from './ui';
import SelecteurSpecialites from './SelecteurSpecialites';

/** Valeurs du formulaire à partir du compte enregistré. */
function formulaireDepuis(utilisateur) {
  return {
    nom: utilisateur.nom || '',
    prenom: utilisateur.prenom || '',
    adresse: utilisateur.adresse || '',
    telephone: utilisateur.telephone || '',
    carteIdentite: utilisateur.carteIdentite || '',
    adresseProfessionnelle: utilisateur.adresseProfessionnelle || '',
    specialiteIds: (utilisateur.specialites || []).map((s) => s.id),
  };
}

function Info({ label, children }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 break-words text-slate-800">{children || <span className="text-slate-400">Non renseigné</span>}</dd>
    </div>
  );
}

/**
 * Informations personnelles du compte connecté (V3) : affichées en LECTURE par défaut, avec un bouton
 * « Modifier mes informations » qui ouvre le formulaire ; « Enregistrer » ou « Annuler » ramène à la lecture.
 */
export default function FormulaireProfil({ utilisateur, surMaj }) {
  const [edition, setEdition] = useState(false);
  const [message, setMessage] = useState('');

  const [form, setForm] = useState(() => formulaireDepuis(utilisateur));
  const estMedecin = utilisateur.role === 'MEDECIN';
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
      // Les champs « médecin » ne sont envoyés qu'à un médecin (le serveur les refuse aux autres profils).
      const { adresseProfessionnelle, specialiteIds, ...commun } = form;
      const json = estMedecin ? { ...commun, adresseProfessionnelle, specialiteIds } : commun;
      const r = await appelApi('/profil', { methode: 'PUT', json });
      surMaj(r.utilisateur);
      setEdition(false);
      setMessage('Vos informations ont été enregistrées.');
    } catch (err) {
      setErreur(err.message);
    } finally {
      setEnCours(false);
    }
  }

  function annuler() {
    setErreur('');
    setEdition(false);
  }

  if (!edition) {
    return (
      <div className="space-y-4">
        <dl className="grid gap-4 sm:grid-cols-2">
          <Info label="Nom">{utilisateur.nom}</Info>
          <Info label="Prénom">{utilisateur.prenom}</Info>
          <Info label="Adresse e-mail">{utilisateur.email}</Info>
          <Info label="Numéro de mobile">{utilisateur.telephone}</Info>
          <Info label="Adresse">{utilisateur.adresse}</Info>
          <Info label="Numéro de la carte d'identité">
            {utilisateur.carteIdentite ? (
              <>
                {masquer(utilisateur.carteIdentite)} <span className="text-xs text-slate-500">(enregistré sous forme chiffrée)</span>
              </>
            ) : null}
          </Info>
          {estMedecin && (
            <>
              <Info label="Spécialités">
                {utilisateur.specialites?.length ? (
                  <span className="flex flex-wrap gap-1.5">
                    {utilisateur.specialites.map((s) => (
                      <span key={s.id} className="rounded-full bg-marque-50 px-2.5 py-0.5 text-sm text-marque-800">
                        {s.libelle}
                      </span>
                    ))}
                  </span>
                ) : null}
              </Info>
              <Info label="Adresse professionnelle">{utilisateur.adresseProfessionnelle}</Info>
            </>
          )}
        </dl>
        <Alerte type="succes">{message}</Alerte>
        <Bouton
          onClick={() => {
            setMessage('');
            setSucces('');
            setErreur('');
            setForm(formulaireDepuis(utilisateur)); // repart toujours des valeurs enregistrées (une annulation ne laisse rien)
            setEdition(true);
          }}
        >
          Modifier mes informations
        </Bouton>
      </div>
    );
  }

  return (
    <form onSubmit={enregistrer} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Champ label="Nom" valeur={form.nom} onChange={maj('nom')} requis autoComplete="family-name" maxLength={100} />
        <Champ label="Prénom" valeur={form.prenom} onChange={maj('prenom')} requis autoComplete="given-name" maxLength={100} />
        <Champ label="Numéro de mobile" type="tel" valeur={form.telephone} onChange={maj('telephone')} autoComplete="tel" placeholder="+33 6 12 34 56 78" />
        <Champ
          label="Numéro de la carte d'identité"
          valeur={form.carteIdentite}
          onChange={maj('carteIdentite')}
          maxLength={40}
          aide="Enregistré sous forme chiffrée."
        />
      </div>
      <Champ label="Adresse" valeur={form.adresse} onChange={maj('adresse')} autoComplete="street-address" maxLength={250} />
      {estMedecin && (
        <div className="space-y-4 rounded-xl border border-marque-100 bg-marque-50/40 p-4">
          <p className="text-sm font-semibold text-marque-800">Fiche professionnelle (visible par les patients)</p>
          <SelecteurSpecialites
            label="Spécialités"
            valeur={form.specialiteIds}
            onChange={maj('specialiteIds')}
            deja={utilisateur.specialites || []}
            aide="Une ou plusieurs spécialités, recherche possible."
          />
          <Champ
            label="Adresse professionnelle"
            valeur={form.adresseProfessionnelle}
            onChange={maj('adresseProfessionnelle')}
            maxLength={250}
            placeholder="Cabinet, rue, code postal, ville"
          />
        </div>
      )}
      <p className="text-sm text-slate-500">
        Adresse e-mail du compte : <strong>{utilisateur.email}</strong> (non modifiable)
      </p>
      <Alerte>{erreur}</Alerte>
      <Alerte type="succes">{succes}</Alerte>
      <div className="flex flex-wrap gap-2">
        <Bouton type="submit" enCours={enCours}>
          Enregistrer mes informations
        </Bouton>
        <Bouton type="button" variante="secondaire" onClick={annuler} disabled={enCours}>
          Annuler
        </Bouton>
      </div>
    </form>
  );
}
