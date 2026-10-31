'use client';
import { useState } from 'react';
import { appelApi } from '@/lib/api';
import { CATEGORIES, formaterDate, formaterTaille } from '@/lib/constantes';
import { Alerte, Bouton } from './ui';

/** Liste de documents avec ouverture, téléchargement et (si autorisé) suppression. */
export default function ListeDocuments({ documents, peutSupprimer = false, surSuppression, vide = 'Aucun document pour le moment.' }) {
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

  return (
    <div className="space-y-3">
      <Alerte>{erreur}</Alerte>
      <ul className="divide-y divide-slate-100">
        {documents.map((d) => (
          <li key={d.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="truncate font-medium text-slate-800">{d.nomFichier}</p>
              <p className="text-xs text-slate-500">
                <span className="mr-2 rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-700">
                  {CATEGORIES[d.categorie] || d.categorie}
                </span>
                {formaterTaille(d.tailleOctets)} · {formaterDate(d.creeLe)}
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
              {peutSupprimer && (
                <Bouton variante="danger" disabled={occupe === d.id} onClick={() => supprimer(d)}>
                  Supprimer
                </Bouton>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
