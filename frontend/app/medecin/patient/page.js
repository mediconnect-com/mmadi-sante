'use client';
// Dossier d'un patient attribué (lecture seule). L'identifiant est passé dans l'adresse : /medecin/patient/?id=...
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Protege from '@/components/Protege';
import DossierUtilisateur from '@/components/DossierUtilisateur';
import { Chargement } from '@/components/ui';

function Contenu() {
  const id = useSearchParams().get('id');
  return <DossierUtilisateur id={id} admin={false} />;
}

export default function PagePatientMedecin() {
  return (
    <Protege roles={['MEDECIN']}>
      <Suspense fallback={<Chargement />}>
        <Contenu />
      </Suspense>
    </Protege>
  );
}
