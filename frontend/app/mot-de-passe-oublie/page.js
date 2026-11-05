'use client';
// « Mot de passe oublié » : accessible depuis la page de connexion, sans être connecté.
// L'API répond toujours la même chose, que l'adresse existe ou non (elle ne révèle pas les comptes).
import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { appelApi } from '@/lib/api';
import { Alerte, Bouton, Carte, Champ } from '@/components/ui';

function Formulaire() {
  const [email, setEmail] = useState(useSearchParams().get('email') || '');
  const [envoye, setEnvoye] = useState('');
  const [erreur, setErreur] = useState('');
  const [enCours, setEnCours] = useState(false);

  async function valider(e) {
    e.preventDefault();
    setErreur('');
    setEnCours(true);
    try {
      const r = await appelApi('/auth/mot-de-passe-oublie', { methode: 'POST', json: { email } });
      setEnvoye(r.message);
    } catch (err) {
      setErreur(err.message);
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 py-10">
      <Carte titre="Mot de passe oublié">
        {envoye ? (
          <div className="space-y-4">
            <Alerte type="succes">{envoye}</Alerte>
            <p className="text-sm text-slate-600">Le lien reçu est valable une heure et ne fonctionne qu’une seule fois.</p>
            <Link href="/connexion/" className="inline-block text-sm font-medium text-marque-700 hover:underline">
              ← Retour à la connexion
            </Link>
          </div>
        ) : (
          <form onSubmit={valider} className="space-y-4">
            <p className="text-sm text-slate-600">Indiquez l’adresse e-mail de votre compte : nous vous envoyons un lien pour choisir un nouveau mot de passe.</p>
            <Champ label="Adresse e-mail" type="email" valeur={email} onChange={setEmail} requis autoComplete="email" />
            <Alerte>{erreur}</Alerte>
            <Bouton type="submit" enCours={enCours} className="w-full">
              Envoyer le lien
            </Bouton>
            <p className="text-center text-sm">
              <Link href="/connexion/" className="font-medium text-marque-700 hover:underline">
                ← Retour à la connexion
              </Link>
            </p>
          </form>
        )}
      </Carte>
    </div>
  );
}

export default function PageMotDePasseOublie() {
  return (
    <Suspense fallback={null}>
      <Formulaire />
    </Suspense>
  );
}
