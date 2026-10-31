'use client';
import { useState } from 'react';
import { appelApi } from '@/lib/api';
import { Alerte, Bouton, Champ } from './ui';

/** Modification des informations personnelles du compte connecté. */
export default function FormulaireProfil({ utilisateur, surMaj }) {
  const [form, setForm] = useState({
    nom: utilisateur.nom || '',
    prenom: utilisateur.prenom || '',
    adresse: utilisateur.adresse || '',
    telephone: utilisateur.telephone || '',
    carteIdentite: utilisateur.carteIdentite || '',
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
      const r = await appelApi('/profil', { methode: 'PUT', json: form });
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
