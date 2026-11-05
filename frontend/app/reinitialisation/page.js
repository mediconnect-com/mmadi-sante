'use client';
// Page ouverte depuis le lien reçu par e-mail : choix et validation du nouveau mot de passe.
// Le mot de passe est enregistré (haché) en base par l'API ; le lien ne fonctionne qu'une fois.
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { appelApi } from '@/lib/api';
import { Alerte, Bouton, Carte, Champ, Chargement } from '@/components/ui';

function Formulaire() {
  const jeton = useSearchParams().get('jeton') || '';
  const [etat, setEtat] = useState(jeton ? 'verification' : 'invalide'); // verification | pret | invalide | fait
  const [mdp, setMdp] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [voir, setVoir] = useState(false);
  const [erreur, setErreur] = useState('');
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    if (!jeton) return;
    appelApi('/auth/mot-de-passe-oublie/verifier', { methode: 'POST', json: { jeton } })
      .then((r) => setEtat(r.valide ? 'pret' : 'invalide'))
      .catch(() => setEtat('invalide'));
  }, [jeton]);

  async function valider(e) {
    e.preventDefault();
    setErreur('');
    if (mdp !== confirmation) return setErreur('Les deux mots de passe ne sont pas identiques.');
    setEnCours(true);
    try {
      await appelApi('/auth/reinitialiser-mot-de-passe', { methode: 'POST', json: { jeton, nouveauMotDePasse: mdp } });
      setEtat('fait');
    } catch (err) {
      setErreur(err.message);
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 py-10">
      <Carte titre="Nouveau mot de passe">
        {etat === 'verification' && <Chargement texte="Vérification du lien…" />}
        {etat === 'invalide' && (
          <div className="space-y-4">
            <Alerte>Ce lien est invalide ou a expiré. Chaque lien est valable une heure et ne s’utilise qu’une fois.</Alerte>
            <Link href="/mot-de-passe-oublie/" className="inline-block text-sm font-medium text-marque-700 hover:underline">
              Recevoir un nouveau lien
            </Link>
          </div>
        )}
        {etat === 'fait' && (
          <div className="space-y-4">
            <Alerte type="succes">Votre mot de passe a été modifié. Vous pouvez maintenant vous connecter.</Alerte>
            <Link href="/connexion/" className="inline-block rounded-lg bg-marque-600 px-4 py-2 text-sm font-medium text-white hover:bg-marque-700">
              Se connecter
            </Link>
          </div>
        )}
        {etat === 'pret' && (
          <form onSubmit={valider} className="space-y-4">
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
            <Champ label="Confirmer le mot de passe" type={voir ? 'text' : 'password'} valeur={confirmation} onChange={setConfirmation} requis maxLength={100} autoComplete="new-password" />
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={voir} onChange={(e) => setVoir(e.target.checked)} /> Afficher les mots de passe
            </label>
            <Alerte>{erreur}</Alerte>
            <Bouton type="submit" enCours={enCours} className="w-full">
              Enregistrer le mot de passe
            </Bouton>
          </form>
        )}
      </Carte>
    </div>
  );
}

export default function PageReinitialisation() {
  return (
    <Suspense fallback={<Chargement />}>
      <Formulaire />
    </Suspense>
  );
}
