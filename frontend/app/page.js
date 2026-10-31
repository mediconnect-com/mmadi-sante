'use client';
import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { accueilPourRole } from '@/lib/constantes';

const ATOUTS = [
  { titre: 'Vos informations réunies', texte: 'Nom, adresse, numéro de mobile et carte d’identité, saisis une fois et modifiables à tout moment.' },
  { titre: 'Vos documents en sécurité', texte: 'Ordonnances, diagnostics, analyses : envoyez vos fichiers PDF ou photos directement depuis votre téléphone.' },
  { titre: 'Un accès strictement contrôlé', texte: 'Seul vous, le médecin qui vous suit et l’administrateur peuvent consulter votre dossier.' },
];

export default function Accueil() {
  const { utilisateur, chargement } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!chargement && utilisateur) router.replace(accueilPourRole(utilisateur.role));
  }, [chargement, utilisateur, router]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-5xl">
          Votre dossier de santé, <span className="text-marque-600">simple et protégé</span>
        </h1>
        <p className="mt-4 text-lg text-slate-600">
          MmadiSanté vous permet de centraliser vos informations personnelles et vos documents médicaux, et de les partager
          uniquement avec votre médecin.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link href="/inscription/" className="w-full rounded-lg bg-marque-600 px-6 py-3 font-medium text-white shadow-sm hover:bg-marque-700 sm:w-auto">
            Créer mon compte patient
          </Link>
          <Link href="/connexion/" className="w-full rounded-lg border border-slate-300 bg-white px-6 py-3 font-medium text-slate-700 hover:bg-slate-50 sm:w-auto">
            Me connecter
          </Link>
        </div>
      </div>

      <div className="mt-14 grid gap-4 sm:grid-cols-3">
        {ATOUTS.map((a) => (
          <div key={a.titre} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="font-semibold text-slate-800">{a.titre}</h2>
            <p className="mt-2 text-sm text-slate-600">{a.texte}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
