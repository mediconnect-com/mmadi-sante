'use client';
// Patient : « Mes informations » (informations personnelles + documents). Ses médecins et ses rendez-vous (avec les
// commentaires associés) ont chacun leur propre menu. Médecin et administrateur : « Mon profil ».
import { useCallback, useEffect, useState } from 'react';
import { appelApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import Protege from '@/components/Protege';
import FormulaireProfil from '@/components/FormulaireProfil';
import TeleversementDocuments from '@/components/TeleversementDocuments';
import ListeDocuments from '@/components/ListeDocuments';
import { Alerte, Bouton, Carte, Champ, Chargement, Page } from '@/components/ui';

function ChangerMotDePasse() {
  const [ancien, setAncien] = useState('');
  const [nouveau, setNouveau] = useState('');
  const [erreur, setErreur] = useState('');
  const [succes, setSucces] = useState('');
  const [enCours, setEnCours] = useState(false);

  async function valider(e) {
    e.preventDefault();
    setErreur('');
    setSucces('');
    setEnCours(true);
    try {
      await appelApi('/profil/mot-de-passe', { methode: 'PUT', json: { ancienMotDePasse: ancien, nouveauMotDePasse: nouveau } });
      setSucces('Mot de passe modifié.');
      setAncien('');
      setNouveau('');
    } catch (err) {
      setErreur(err.message);
    } finally {
      setEnCours(false);
    }
  }

  return (
    <form onSubmit={valider} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Champ label="Mot de passe actuel" type="password" valeur={ancien} onChange={setAncien} requis autoComplete="current-password" />
        <Champ label="Nouveau mot de passe" type="password" valeur={nouveau} onChange={setNouveau} requis autoComplete="new-password" aide="8 caractères minimum, avec une lettre et un chiffre." />
      </div>
      <Alerte>{erreur}</Alerte>
      <Alerte type="succes">{succes}</Alerte>
      <Bouton type="submit" variante="secondaire" enCours={enCours}>
        Changer mon mot de passe
      </Bouton>
    </form>
  );
}

function Contenu() {
  const { utilisateur, setUtilisateur } = useAuth();
  const [documents, setDocuments] = useState(null);
  const [erreur, setErreur] = useState('');

  const chargerDocuments = useCallback(async () => {
    try {
      const r = await appelApi('/profil/documents');
      setDocuments(r.documents);
    } catch (e) {
      setErreur(e.message);
    }
  }, []);

  useEffect(() => {
    chargerDocuments();
  }, [chargerDocuments]);

  return (
    <Page
      titre={utilisateur.role === 'PATIENT' ? 'Mes informations' : 'Mon profil'}
      sousTitre={utilisateur.role === 'PATIENT' ? 'Vos informations personnelles et vos documents médicaux.' : 'Vos informations personnelles et la sécurité de votre compte.'}
    >
      <Carte titre="Informations personnelles">
        <FormulaireProfil utilisateur={utilisateur} surMaj={setUtilisateur} />
      </Carte>

      <Carte titre="Ajouter des documents">
        <TeleversementDocuments surTermine={chargerDocuments} />
      </Carte>

      <Carte titre={`Mes documents${documents ? ` (${documents.length})` : ''}`}>
        <Alerte>{erreur}</Alerte>
        {documents ? (
          <ListeDocuments
            documents={documents}
            grouper
            // Un document déposé par un médecin dans votre fiche ne se supprime pas ici (le serveur le refuse aussi).
            peutSupprimer={(d) => !d.deposeParNom}
            surSuppression={chargerDocuments}
            vide="Vous n'avez pas encore ajouté de document."
          />
        ) : (
          <Chargement />
        )}
      </Carte>

      <Carte titre="Sécurité du compte">
        <ChangerMotDePasse />
      </Carte>
    </Page>
  );
}

export default function PageProfil() {
  return (
    <Protege>
      <Contenu />
    </Protege>
  );
}
