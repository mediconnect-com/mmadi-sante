'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { accueilPourRole } from '@/lib/constantes';
import { Alerte, Bouton, Carte, Champ } from '@/components/ui';

export default function PageConnexion() {
  const { utilisateur, chargement, connecter } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [erreur, setErreur] = useState('');
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    if (!chargement && utilisateur) router.replace(accueilPourRole(utilisateur.role));
  }, [chargement, utilisateur, router]);

  async function valider(e) {
    e.preventDefault();
    setErreur('');
    setEnCours(true);
    try {
      const u = await connecter(email, motDePasse);
      router.replace(accueilPourRole(u.role));
    } catch (err) {
      setErreur(err.message);
      setEnCours(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 py-10">
      <Carte titre="Connexion">
        <form onSubmit={valider} className="space-y-4">
          <Champ label="Adresse e-mail" type="email" valeur={email} onChange={setEmail} requis autoComplete="email" />
          <Champ label="Mot de passe" type="password" valeur={motDePasse} onChange={setMotDePasse} requis autoComplete="current-password" />
          <Alerte>{erreur}</Alerte>
          <Bouton type="submit" enCours={enCours} className="w-full">
            Se connecter
          </Bouton>
        </form>
        <p className="mt-4 text-center text-sm text-slate-600">
          Pas encore de compte ?{' '}
          <Link href="/inscription/" className="font-medium text-marque-700 hover:underline">
            Créer un compte patient
          </Link>
        </p>
      </Carte>
    </div>
  );
}
