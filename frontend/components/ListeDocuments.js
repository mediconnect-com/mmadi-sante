'use client';
import { useState } from 'react';
import { appelApi } from '@/lib/api';
import { CATEGORIES, estRecent, formaterDate, formaterDepuis, formaterTaille, JOURS_RECENT } from '@/lib/constantes';
import { Alerte, Bouton } from './ui';

/**
 * Liste de documents avec ouverture, téléchargement et (si autorisé) suppression.
 *  - peutSupprimer : true / false, ou une fonction (document) => booléen (le serveur revérifie toujours)
 *  - grouper : sépare les documents RÉCENTS (moins de 30 jours) de l'HISTORIQUE, et date chaque dépôt
 */
export default function ListeDocuments({ documents, peutSupprimer = false, surSuppression, vide = 'Aucun document pour le moment.', grouper = false }) {
  const [occupe, setOccupe] = useState(null);
  const [erreur, setErreur] = useState('');

  // Le fichier est demandé à l'API AVEC le jeton (un simple lien ne pourrait pas l'envoyer).
  async function recuperer(doc, telecharger) {
    setErreur('');
    setOccupe(doc.id);
    // On ouvre l'onglet tout de suite (clic de l'utilisateur) pour ne pas être bloqué par le navigateur.
    const fenetre = telecharger ? null : window.open('', '_blank');
    try {
      const blob = await appelApi(`/documents/${doc.id}`, { reponse: 'blob' });
      const url = URL.createObjectURL(blob);
      if (telecharger || !fenetre) {
        const a = document.createElement('a');
        a.href = url;
        a.download = doc.nomFichier;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } else {
        fenetre.location.href = url;
      }
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      if (fenetre) fenetre.close();
      setErreur(e.message);
    } finally {
      setOccupe(null);
    }
  }

  async function supprimer(doc) {
    if (!window.confirm(`Supprimer définitivement « ${doc.nomFichier} » ?`)) return;
    setErreur('');
    setOccupe(doc.id);
    try {
      await appelApi(`/documents/${doc.id}`, { methode: 'DELETE' });
      if (surSuppression) surSuppression(doc.id);
    } catch (e) {
      setErreur(e.message);
    } finally {
      setOccupe(null);
    }
  }

  if (!documents || documents.length === 0) return <p className="text-sm text-slate-500">{vide}</p>;

  const supprimable = (d) => (typeof peutSupprimer === 'function' ? peutSupprimer(d) : peutSupprimer);

  const ligne = (d) => {
    const recent = estRecent(d.creeLe);
    const parMedecin = Boolean(d.deposeParNom);
    return (
      <li key={d.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2">
            <span className="truncate font-medium text-slate-800">{d.nomFichier}</span>
            {grouper && recent && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">Récent</span>}
          </p>
          <p className="text-xs text-slate-500">
            <span className="mr-2 rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-700">{CATEGORIES[d.categorie] || d.categorie}</span>
            {formaterTaille(d.tailleOctets)}
          </p>
          <p className="mt-0.5 text-xs text-slate-600">
            <span className="font-medium">Déposé le {formaterDate(d.creeLe)}</span>
            <span className="text-slate-400"> ({formaterDepuis(d.creeLe)})</span>
            {' · '}
            {parMedecin ? (
              <span className="rounded bg-sky-100 px-1.5 py-0.5 font-medium text-sky-800">par {d.deposeParNom}</span>
            ) : (
              <span>par le patient</span>
            )}
          </p>
          {d.description && <p className="mt-1 text-sm text-slate-600">{d.description}</p>}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Bouton variante="secondaire" enCours={occupe === d.id} onClick={() => recuperer(d, false)}>
            Voir
          </Bouton>
          <Bouton variante="secondaire" disabled={occupe === d.id} onClick={() => recuperer(d, true)}>
            Télécharger
          </Bouton>
          {supprimable(d) && (
            <Bouton variante="danger" disabled={occupe === d.id} onClick={() => supprimer(d)}>
              Supprimer
            </Bouton>
          )}
        </div>
      </li>
    );
  };

  const trier = (l) => l.slice().sort((a, b) => new Date(b.creeLe) - new Date(a.creeLe));
  const recents = grouper ? trier(documents.filter((d) => estRecent(d.creeLe))) : [];
  const historiques = grouper ? trier(documents.filter((d) => !estRecent(d.creeLe))) : [];

  return (
    <div className="space-y-4">
      <Alerte>{erreur}</Alerte>
      {grouper ? (
        <>
          <section aria-label="Documents récents">
            <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-emerald-800">
              Récents <span className="font-normal text-slate-500">(moins de {JOURS_RECENT} jours) · {recents.length}</span>
            </h3>
            {recents.length === 0 ? (
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-500">Aucun document déposé ces {JOURS_RECENT} derniers jours.</p>
            ) : (
              <ul className="divide-y divide-slate-100 rounded-lg border border-emerald-100 bg-emerald-50/30 px-3">
                {recents.map(ligne)}
              </ul>
            )}
          </section>
          <section aria-label="Historique des documents">
            <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-600">
              Historique <span className="font-normal text-slate-500">({historiques.length})</span>
            </h3>
            {historiques.length === 0 ? (
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-500">Aucun document plus ancien.</p>
            ) : (
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 px-3">
                {historiques.map(ligne)}
              </ul>
            )}
          </section>
        </>
      ) : (
        <ul className="divide-y divide-slate-100">
          {documents.map(ligne)}
        </ul>
      )}
    </div>
  );
}
