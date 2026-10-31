'use client';
// Tous les documents de tous les utilisateurs (administrateur).
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { appelApi } from '@/lib/api';
import Protege from '@/components/Protege';
import ListeDocuments from '@/components/ListeDocuments';
import { Alerte, Carte, Chargement, Page } from '@/components/ui';

function Contenu() {
  const [documents, setDocuments] = useState(null);
  const [erreur, setErreur] = useState('');

  const charger = useCallback(async () => {
    try {
      setDocuments((await appelApi('/admin/documents')).documents);
    } catch (e) {
      setErreur(e.message);
    }
  }, []);

  useEffect(() => {
    charger();
  }, [charger]);

  // On regroupe par propriétaire pour retrouver facilement les documents de chacun.
  const groupes = {};
  (documents || []).forEach((d) => {
    (groupes[d.proprietaire.id] ||= { proprietaire: d.proprietaire, documents: [] }).documents.push(d);
  });

  return (
    <Page titre="Tous les documents" sousTitre="Documents enregistrés par l'ensemble des utilisateurs.">
      <Alerte>{erreur}</Alerte>
      {!documents && !erreur && <Chargement />}
      {documents && documents.length === 0 && <Carte>Aucun document enregistré.</Carte>}
      {Object.values(groupes).map((g) => (
        <Carte
          key={g.proprietaire.id}
          titre={`${g.proprietaire.prenom} ${g.proprietaire.nom}`}
          action={
            <Link href={`/admin/utilisateur/?id=${g.proprietaire.id}`} className="text-sm font-medium text-marque-700 hover:underline">
              Voir le dossier →
            </Link>
          }
        >
          <ListeDocuments documents={g.documents} peutSupprimer surSuppression={charger} />
        </Carte>
      ))}
    </Page>
  );
}

export default function PageDocumentsAdmin() {
  return (
    <Protege roles={['ADMIN']}>
      <Contenu />
    </Protege>
  );
}
