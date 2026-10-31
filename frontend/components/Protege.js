'use client';
// Garde d'accès côté interface : redirige les visiteurs non connectés ou du mauvais profil.
// ⚠ Ce n'est qu'un confort d'affichage : la VRAIE sécurité est appliquée par l'API sur chaque route.
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { accueilPourRole } from '@/lib/constantes';
import { Chargement } from './ui';

export default function Protege({ roles, children }) {
  const { utilisateur, chargement, serveurReveil } = useAuth();
  const router = useRouter();
  const autorise = utilisateur && (!roles || roles.includes(utilisateur.role));

  useEffect(() => {
    if (chargement) return;
    if (!utilisateur) router.replace('/connexion/');
    else if (!autorise) router.replace(accueilPourRole(utilisateur.role));
  }, [chargement, utilisateur, autorise, router]);

  if (chargement) {
    return (
      <Chargement
        texte={
          serveurReveil
            ? 'Le serveur se réveille (hébergement gratuit), cela peut prendre une minute…'
            : 'Chargement…'
        }
      />
    );
  }
  if (!autorise) return <Chargement texte="Redirection…" />;
  return children;
}
