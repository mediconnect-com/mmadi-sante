'use client';
// Fiche d'un utilisateur côté administrateur : /admin/utilisateur/?id=...
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Protege from '@/components/Protege';
import DossierUtilisateur from '@/components/DossierUtilisateur';
import { Chargement } from '@/components/ui';

function Contenu() {
  const id = useSearchParams().get('id');
  return <DossierUtilisateur id={id} admin />;
}

export default function PageUtilisateurAdmin() {
  return (
    <Protege roles={['ADMIN']}>
      <Suspense fallback={<Chargement />}>
        <Contenu />
      </Suspense>
    </Protege>
  );
}
