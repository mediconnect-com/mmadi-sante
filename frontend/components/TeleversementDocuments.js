'use client';
import { useState } from 'react';
import { appelApi } from '@/lib/api';
import { CATEGORIES, TAILLE_MAX_MO } from '@/lib/constantes';
import { Alerte, Bouton, Champ, Selecteur } from './ui';

const EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png'];

/** Formulaire d'envoi d'un ou plusieurs documents (ordonnance, diagnostic, ...). */
export default function TeleversementDocuments({ surTermine }) {
  const [fichiers, setFichiers] = useState([]);
  const [categorie, setCategorie] = useState('ORDONNANCE');
  const [description, setDescription] = useState('');
  const [erreur, setErreur] = useState('');
  const [succes, setSucces] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [cleChamp, setCleChamp] = useState(0); // permet de vider le champ fichier après envoi

  function choisir(e) {
    setErreur('');
    setSucces('');
    const liste = Array.from(e.target.files || []);
    if (liste.length > 5) return setErreur('Vous pouvez envoyer 5 fichiers au maximum à la fois.');
    for (const f of liste) {
      const ext = f.name.split('.').pop().toLowerCase();
      if (!EXTENSIONS.includes(ext)) return setErreur(`« ${f.name} » : seuls les fichiers PDF, JPG et PNG sont acceptés.`);
      if (f.size > TAILLE_MAX_MO * 1024 * 1024) return setErreur(`« ${f.name} » dépasse ${TAILLE_MAX_MO} Mo.`);
    }
    setFichiers(liste);
  }

  async function envoyer(e) {
    e.preventDefault();
    setErreur('');
    setSucces('');
    if (fichiers.length === 0) return setErreur('Choisissez au moins un fichier.');
    setEnCours(true);
    try {
      const formData = new FormData();
      fichiers.forEach((f) => formData.append('fichiers', f));
      formData.append('categorie', categorie);
      if (description.trim()) formData.append('description', description.trim());
      const r = await appelApi('/profil/documents', { methode: 'POST', formData });
      setSucces(`${r.documents.length} document(s) enregistré(s).`);
      setFichiers([]);
      setDescription('');
      setCleChamp((n) => n + 1);
      if (surTermine) surTermine();
    } catch (err) {
      setErreur(err.message);
    } finally {
      setEnCours(false);
    }
  }

  return (
    <form onSubmit={envoyer} className="space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="champ-fichiers">
          Fichiers (PDF, JPG ou PNG — {TAILLE_MAX_MO} Mo max chacun, 5 à la fois)
        </label>
        <input
          key={cleChamp}
          id="champ-fichiers"
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
          onChange={choisir}
          className="block w-full rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-marque-600 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-marque-700"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Selecteur
          label="Type de document"
          valeur={categorie}
          onChange={setCategorie}
          options={Object.entries(CATEGORIES).map(([valeur, libelle]) => ({ valeur, libelle }))}
        />
        <Champ label="Description (facultatif)" valeur={description} onChange={setDescription} maxLength={300} />
      </div>
      <Alerte>{erreur}</Alerte>
      <Alerte type="succes">{succes}</Alerte>
      <Bouton type="submit" enCours={enCours}>
        Enregistrer le(s) document(s)
      </Bouton>
    </form>
  );
}
