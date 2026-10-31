'use client';
import { useState } from 'react';
import { appelApi } from '@/lib/api';
import { Alerte, Bouton, Champ } from './ui';
import SelecteurSpecialites from './SelecteurSpecialites';

/** Modification des informations personnelles du compte connecté. */
export default function FormulaireProfil({ utilisateur, surMaj }) {
  const [form, setForm] = useState({
    nom: utilisateur.nom || '',
    prenom: utilisateur.prenom || '',
    adresse: utilisateur.adresse || '',
    telephone: utilisateur.telephone || '',
    carteIdentite: utilisateur.carteIdentite || '',
    adresseProfessionnelle: utilisateur.adresseProfessionnelle || '',
    specialiteIds: (utilisateur.specialites || []).map((s) => s.id),
  });
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
      setSucces('Vos informations ont été enregistrées.');
    } catch (err) {
      setErreur(err.message);
    } finally {
      setEnCours(false);
    }
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
        Adresse e-mail du compte : <strong>{utilisateur.email}</strong>
      </p>
      <Alerte>{erreur}</Alerte>
      <Alerte type="succes">{succes}</Alerte>
      <Bouton type="submit" enCours={enCours}>
        Enregistrer mes informations
      </Bouton>
    </form>
  );
}
