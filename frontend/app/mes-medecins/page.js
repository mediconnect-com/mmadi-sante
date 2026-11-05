'use client';
// « Mes médecins » (patient) : les médecins associés au dossier, avec accès direct à la prise de rendez-vous.
import Protege from '@/components/Protege';
import MesMedecins from '@/components/MesMedecins';
import { Page } from '@/components/ui';

export default function PageMesMedecins() {
  return (
    <Protege roles={['PATIENT']}>
      <Page titre="Mes médecins" sousTitre="Les médecins qui suivent votre dossier et peuvent le consulter.">
        <MesMedecins />
      </Page>
    </Protege>
  );
}
