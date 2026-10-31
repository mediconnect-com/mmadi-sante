'use client';
// Liste déroulante AVEC RECHERCHE pour choisir une ou plusieurs spécialités.
// Accessible au clavier : flèches haut/bas, Entrée pour choisir, Échap pour fermer.
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { appelApi } from '@/lib/api';
import { normaliser, rangGroupe } from '@/lib/constantes';

/**
 * valeur    : tableau d'identifiants de spécialités sélectionnées
 * onChange  : reçoit le nouveau tableau d'identifiants
 * multiple  : false = un seul choix (filtre de recherche)
 * deja      : spécialités (objets) déjà rattachées, même désactivées, pour pouvoir les afficher
 */
export default function SelecteurSpecialites({
  label = 'Spécialités',
  valeur,
  onChange,
  multiple = true,
  requis = false,
  aide,
  deja = [],
  placeholder = 'Rechercher une spécialité…',
}) {
  const [catalogue, setCatalogue] = useState(null);
  const [erreur, setErreur] = useState('');
  const [recherche, setRecherche] = useState('');
  const [ouvert, setOuvert] = useState(false);
  const [actif, setActif] = useState(0);
  const racine = useRef(null);
  const idListe = useId();

  useEffect(() => {
    let ok = true;
    appelApi('/specialites')
      .then((r) => ok && setCatalogue(r.specialites))
      .catch((e) => ok && setErreur(e.message));
    return () => {
      ok = false;
    };
  }, []);

  const parId = useMemo(() => {
    const m = new Map();
    (catalogue || []).forEach((s) => m.set(s.id, s));
    deja.forEach((s) => m.set(s.id, { ...s }));
    return m;
  }, [catalogue, deja]);

  const options = useMemo(() => {
    const q = normaliser(recherche);
    const filtrees = (catalogue || []).filter((s) => !q || normaliser(`${s.libelle} ${s.groupe}`).includes(q));
    return filtrees.sort((a, b) => rangGroupe(a.groupe) - rangGroupe(b.groupe) || a.groupe.localeCompare(b.groupe) || a.libelle.localeCompare(b.libelle));
  }, [catalogue, recherche]);

  useEffect(() => setActif(0), [recherche]);

  const selection = valeur || [];
  const estChoisi = (id) => selection.includes(id);

  function basculer(id) {
    if (!multiple) {
      onChange(estChoisi(id) ? [] : [id]);
      setOuvert(false);
      setRecherche('');
      return;
    }
    onChange(estChoisi(id) ? selection.filter((x) => x !== id) : [...selection, id]);
    setRecherche('');
    setOuvert(false); // la liste se referme (elle se rouvre en tapant ou en cliquant dans le champ)
  }

  function surTouche(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOuvert(true);
      setActif((i) => Math.min(i + 1, options.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActif((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      if (ouvert && options[actif]) {
        e.preventDefault();
        basculer(options[actif].id);
      }
    } else if (e.key === 'Escape') {
      setOuvert(false);
    } else if (e.key === 'Backspace' && !recherche && selection.length > 0 && multiple) {
      onChange(selection.slice(0, -1));
    }
  }

  // Fait défiler la liste pour garder l'option active visible.
  useEffect(() => {
    if (!ouvert) return;
    document.getElementById(`${idListe}-${actif}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [actif, ouvert, idListe]);

  let groupeCourant = null;
  return (
    <div
      ref={racine}
      className="relative block"
      onBlur={(e) => {
        if (!racine.current?.contains(e.relatedTarget)) setOuvert(false);
      }}
    >
      <label htmlFor={`${idListe}-champ`} className="mb-1 block text-sm font-medium text-slate-700">
        {label}
        {requis && <span className="text-red-600"> *</span>}
      </label>

      <div className="rounded-lg border border-slate-300 bg-white p-2 shadow-sm focus-within:border-marque-600 focus-within:ring-2 focus-within:ring-marque-500/30">
        {selection.length > 0 && (
          <ul className="mb-2 flex flex-wrap gap-1.5" aria-label="Spécialités choisies">
            {selection.map((id) => {
              const s = parId.get(id);
              return (
                <li key={id} className="inline-flex items-center gap-1 rounded-full bg-marque-50 px-2.5 py-1 text-sm text-marque-800">
                  {s ? s.libelle : 'Spécialité'}
                  {s && s.actif === false && <span className="text-xs text-amber-700">(désactivée)</span>}
                  <button
                    type="button"
                    onClick={() => onChange(selection.filter((x) => x !== id))}
                    className="rounded-full px-1 text-marque-700 hover:bg-marque-100"
                    aria-label={`Retirer ${s ? s.libelle : 'la spécialité'}`}
                  >
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <input
          id={`${idListe}-champ`}
          type="text"
          role="combobox"
          aria-expanded={ouvert}
          aria-controls={`${idListe}-liste`}
          aria-autocomplete="list"
          aria-activedescendant={ouvert && options[actif] ? `${idListe}-${actif}` : undefined}
          value={recherche}
          onChange={(e) => {
            setRecherche(e.target.value);
            setOuvert(true);
          }}
          onFocus={() => setOuvert(true)}
          onClick={() => setOuvert(true)}
          onKeyDown={surTouche}
          placeholder={selection.length > 0 && !multiple ? '' : placeholder}
          autoComplete="off"
          className="w-full bg-transparent px-1 py-1 text-slate-900 placeholder:text-slate-400 focus:outline-none"
        />
      </div>

      {ouvert && (
        <ul
          id={`${idListe}-liste`}
          role="listbox"
          aria-multiselectable={multiple}
          className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          {!catalogue && !erreur && <li className="px-3 py-2 text-sm text-slate-500">Chargement…</li>}
          {erreur && <li className="px-3 py-2 text-sm text-red-700">{erreur}</li>}
          {catalogue && options.length === 0 && <li className="px-3 py-2 text-sm text-slate-500">Aucune spécialité ne correspond à « {recherche} ».</li>}
          {options.map((s, i) => {
            const entete = s.groupe !== groupeCourant;
            groupeCourant = s.groupe;
            return (
              <li key={s.id} role="presentation">
                {entete && <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{s.groupe}</p>}
                <div
                  id={`${idListe}-${i}`}
                  role="option"
                  aria-selected={estChoisi(s.id)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    basculer(s.id);
                  }}
                  onMouseEnter={() => setActif(i)}
                  className={`flex cursor-pointer items-center justify-between gap-2 px-3 py-1.5 text-sm ${
                    i === actif ? 'bg-marque-50 text-marque-800' : 'text-slate-800'
                  }`}
                >
                  <span>
                    {s.libelle}
                    {s.type === 'PROFESSIONNEL_SANTE' && <span className="ml-2 text-xs text-slate-500">(professionnel de santé)</span>}
                  </span>
                  {estChoisi(s.id) && <span aria-hidden="true">✓</span>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {aide && <span className="mt-1 block text-xs text-slate-500">{aide}</span>}
    </div>
  );
}
