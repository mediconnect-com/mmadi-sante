'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { accueilPourRole } from '@/lib/constantes';
import { Alerte, Bouton, Carte, Champ } from '@/components/ui';

export default function PageInscription() {
  const { utilisateur, chargement, inscrire } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({
    prenom: '',
    nom: '',
    email: '',
    motDePasse: '',
    confirmation: '',
    telephone: '',
    adresse: '',
    carteIdentite: '',
  });
  const [erreur, setErreur] = useState('');
  const [enCours, setEnCours] = useState(false);
  const maj = (champ) => (valeur) => setForm((f) => ({ ...f, [champ]: valeur }));

  useEffect(() => {
    if (!chargement && utilisateur) router.replace(accueilPourRole(utilisateur.role));
  }, [chargement, utilisateur, router]);

  async function valider(e) {
    e.preventDefault();
    setErreur('');
    if (form.motDePasse !== form.confirmation) return setErreur('Les deux mots de passe ne correspondent pas.');
    setEnCours(true);
    try {
      const { confirmation, ...donnees } = form;
      const u = await inscrire(donnees);
      router.replace(accueilPourRole(u.role));
    } catch (err) {
      setErreur(err.message);
      setEnCours(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10">
      <Carte titre="Créer un compte patient">
        <form onSubmit={valider} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Champ label="Prénom" valeur={form.prenom} onChange={maj('prenom')} requis autoComplete="given-name" maxLength={100} />
            <Champ label="Nom" valeur={form.nom} onChange={maj('nom')} requis autoComplete="family-name" maxLength={100} />
            <Champ label="Adresse e-mail" type="email" valeur={form.email} onChange={maj('email')} requis autoComplete="email" />
            <Champ label="Numéro de mobile" type="tel" valeur={form.telephone} onChange={maj('telephone')} autoComplete="tel" placeholder="+33 6 12 34 56 78" />
            <Champ
              label="Mot de passe"
              type="password"
              valeur={form.motDePasse}
              onChange={maj('motDePasse')}
              requis
              autoComplete="new-password"
              aide="8 caractères minimum, avec au moins une lettre et un chiffre."
            />
            <Champ label="Confirmer le mot de passe" type="password" valeur={form.confirmation} onChange={maj('confirmation')} requis autoComplete="new-password" />
          </div>
          <Champ label="Adresse postale" valeur={form.adresse} onChange={maj('adresse')} autoComplete="street-address" maxLength={250} />
          <Champ label="Numéro de la carte d'identité" valeur={form.carteIdentite} onChange={maj('carteIdentite')} maxLength={40} aide="Facultatif. Enregistré sous forme chiffrée." />
          <Alerte type="info">
            Vous pourrez ajouter vos documents (ordonnances, diagnostics…) juste après la création du compte. Les comptes médecin et
            administrateur sont créés par un administrateur.
          </Alerte>
          <Alerte>{erreur}</Alerte>
          <Bouton type="submit" enCours={enCours} className="w-full sm:w-auto">
            Créer mon compte
          </Bouton>
        </form>
        <p className="mt-4 text-sm text-slate-600">
          Déjà inscrit ?{' '}
          <Link href="/connexion/" className="font-medium text-marque-700 hover:underline">
            Se connecter
          </Link>
        </p>
      </Carte>
    </div>
  );
}
