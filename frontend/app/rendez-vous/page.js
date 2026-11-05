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
import CommentairesPatient from '@/components/CommentairesPatient';
import { Alerte, Bouton, Carte, Chargement, Page } from '@/components/ui';

const SOUS_TITRES = {
  PATIENT: 'Vos rendez-vous en cours, puis votre historique, avec les commentaires de vos médecins.',
  MEDECIN: 'Les demandes de rendez-vous qui vous sont adressées.',
  ADMIN: 'Tous les rendez-vous de la plateforme.',
};

function Contenu() {
  const { utilisateur } = useAuth();
  const parametres = useSearchParams();
  const medecinInitialId = parametres.get('medecin');
  const estPatient = utilisateur.role === 'PATIENT';
  // La prise de rendez-vous n'est jamais affichée d'office : le patient l'ouvre (ou arrive depuis « Mes médecins »).
  const [priseOuverte, setPriseOuverte] = useState(Boolean(medecinInitialId) || parametres.get('nouveau') === '1');
  const [liste, setListe] = useState(null);
  const [commentaires, setCommentaires] = useState([]);
  const [erreur, setErreur] = useState('');

  const charger = useCallback(async () => {
    try {
      const r = await appelApi('/rendez-vous');
      setListe(r.rendezVous);
      // Le patient voit, sous chaque rendez-vous, le commentaire et les pathologies saisis par le médecin.
      if (estPatient) setCommentaires((await appelApi('/profil/commentaires')).commentaires);
      setErreur('');
    } catch (e) {
      setErreur(e.message);
    }
  }, [estPatient]);

  useEffect(() => {
    charger();
  }, [charger]);

  // Commentaires rattachés à un rendez-vous (affichés dans la liste) et, à part, ceux qui ne le sont pas.
  const parMedecinRdv = Object.fromEntries(commentaires.filter((c) => c.rendezVousId).map((c) => [c.rendezVousId, c]));
  const autres = commentaires.filter((c) => !c.rendezVousId);

  return (
    <Page
      titre={estPatient ? 'Mes rendez-vous' : 'Rendez-vous'}
      sousTitre={SOUS_TITRES[utilisateur.role]}
      action={
        estPatient && !priseOuverte && (
          <Bouton onClick={() => setPriseOuverte(true)}>Prendre un rendez-vous</Bouton>
        )
      }
    >
      {estPatient && priseOuverte && <PriseRendezVous medecinInitialId={medecinInitialId} surCree={charger} surFermer={() => setPriseOuverte(false)} />}
      <Carte titre={estPatient ? 'Mes rendez-vous' : 'Rendez-vous'}>
        <Alerte>{erreur}</Alerte>
        {!liste && !erreur && <Chargement />}
        {liste && <ListeRendezVous rendezVous={liste} role={utilisateur.role} commentaires={parMedecinRdv} surChangement={charger} />}
      </Carte>
      {estPatient && autres.length > 0 && (
        <Carte titre={`Autres commentaires de mes médecins (${autres.length})`}>
          <CommentairesPatient commentaires={autres} mode="lecture" vide="" />
        </Carte>
      )}
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
