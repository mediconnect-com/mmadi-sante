'use client';
// Rendez-vous : le patient prend et suit ses rendez-vous ; le médecin traite les demandes qui le concernent ;
// l'administrateur voit l'ensemble. Les droits sont revérifiés par l'API à chaque action.
import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { appelApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import Protege from '@/components/Protege';
import ListeRendezVous from '@/components/ListeRendezVous';
import PriseRendezVous from '@/components/PriseRendezVous';
import { Alerte, Carte, Chargement, Page } from '@/components/ui';

const SOUS_TITRES = {
  PATIENT: 'Recherchez un médecin, prenez rendez-vous et suivez vos demandes.',
  MEDECIN: 'Les demandes de rendez-vous qui vous sont adressées.',
  ADMIN: 'Tous les rendez-vous de la plateforme.',
};

function Contenu() {
  const { utilisateur } = useAuth();
  const medecinInitialId = useSearchParams().get('medecin');
  const [liste, setListe] = useState(null);
  const [erreur, setErreur] = useState('');

  const charger = useCallback(async () => {
    try {
      const r = await appelApi('/rendez-vous');
      setListe(r.rendezVous);
      setErreur('');
    } catch (e) {
      setErreur(e.message);
    }
  }, []);

  useEffect(() => {
    charger();
  }, [charger]);

  return (
    <Page titre="Rendez-vous" sousTitre={SOUS_TITRES[utilisateur.role]}>
      {utilisateur.role === 'PATIENT' && <PriseRendezVous medecinInitialId={medecinInitialId} surCree={charger} />}
      <Carte titre={utilisateur.role === 'PATIENT' ? 'Mes rendez-vous' : 'Rendez-vous'}>
        <Alerte>{erreur}</Alerte>
        {!liste && !erreur && <Chargement />}
        {liste && <ListeRendezVous rendezVous={liste} role={utilisateur.role} surChangement={charger} />}
      </Carte>
    </Page>
  );
}

export default function PageRendezVous() {
  return (
    <Protege>
      <Suspense fallback={<Chargement />}>
        <Contenu />
      </Suspense>
    </Protege>
  );
}
