'use client';
// Création d'un compte de n'importe quel profil par l'administrateur.
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { appelApi } from '@/lib/api';
import Protege from '@/components/Protege';
import { Alerte, Bouton, Carte, Champ, Page, Selecteur } from '@/components/ui';

function Contenu() {
  const router = useRouter();
  const [form, setForm] = useState({
    role: 'MEDECIN',
    prenom: '',
    nom: '',
    email: '',
    motDePasse: '',
    telephone: '',
    adresse: '',
    carteIdentite: '',
  });
  const [erreur, setErreur] = useState('');
  const [enCours, setEnCours] = useState(false);
  const maj = (champ) => (valeur) => setForm((f) => ({ ...f, [champ]: valeur }));

  async function valider(e) {
    e.preventDefault();
    setErreur('');
    setEnCours(true);
    try {
      const r = await appelApi('/admin/utilisateurs', { methode: 'POST', json: form });
      router.replace(`/admin/utilisateur/?id=${r.utilisateur.id}`);
    } catch (err) {
      setErreur(err.message);
      setEnCours(false);
    }
  }

  return (
    <Page
      titre="Nouvel utilisateur"
      sousTitre="Créez un compte patient, médecin ou administrateur."
      action={
        <Link href="/admin/" className="text-sm font-medium text-marque-700 hover:underline">
          ← Retour
        </Link>
      }
    >
      <Carte>
        <form onSubmit={valider} className="space-y-4">
          <Selecteur
            label="Profil"
            valeur={form.role}
            onChange={maj('role')}
            requis
            options={[
              { valeur: 'MEDECIN', libelle: 'Médecin' },
              { valeur: 'PATIENT', libelle: 'Patient' },
              { valeur: 'ADMIN', libelle: 'Administrateur' },
            ]}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Champ label="Prénom" valeur={form.prenom} onChange={maj('prenom')} requis maxLength={100} />
            <Champ label="Nom" valeur={form.nom} onChange={maj('nom')} requis maxLength={100} />
            <Champ label="Adresse e-mail" type="email" valeur={form.email} onChange={maj('email')} requis />
            <Champ
              label="Mot de passe initial"
              type="password"
              valeur={form.motDePasse}
              onChange={maj('motDePasse')}
              requis
              autoComplete="new-password"
              aide="8 caractères minimum, avec au moins une lettre et un chiffre. Communiquez-le à l'utilisateur."
            />
            <Champ label="Numéro de mobile" type="tel" valeur={form.telephone} onChange={maj('telephone')} />
            <Champ label="Numéro de la carte d'identité" valeur={form.carteIdentite} onChange={maj('carteIdentite')} maxLength={40} />
          </div>
          <Champ label="Adresse postale" valeur={form.adresse} onChange={maj('adresse')} maxLength={250} />
          <Alerte>{erreur}</Alerte>
          <Bouton type="submit" enCours={enCours}>
            Créer le compte
          </Bouton>
        </form>
      </Carte>
    </Page>
  );
}

export default function PageNouvelUtilisateur() {
  return (
    <Protege roles={['ADMIN']}>
      <Contenu />
    </Protege>
  );
}
