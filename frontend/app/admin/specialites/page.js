'use client';
// Gestion des spécialités médicales (administrateur) : ajouter, modifier, désactiver / réactiver.
// Une spécialité n'est jamais supprimée : désactivée, elle disparaît des listes de choix mais reste
// affichée sur les fiches des médecins qui l'avaient déjà.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { appelApi } from '@/lib/api';
import { TYPES_PROFESSIONNEL, normaliser, rangGroupe } from '@/lib/constantes';
import Protege from '@/components/Protege';
import { Alerte, Bouton, Carte, Champ, Chargement, Page, Selecteur } from '@/components/ui';

const OPTIONS_TYPE = [
  { valeur: 'MEDECIN', libelle: TYPES_PROFESSIONNEL.MEDECIN },
  { valeur: 'PROFESSIONNEL_SANTE', libelle: TYPES_PROFESSIONNEL.PROFESSIONNEL_SANTE },
];

function FormulaireSpecialite({ initial, groupes, surValide, surAnnuler, libelleBouton }) {
  const [form, setForm] = useState(initial);
  const [erreur, setErreur] = useState('');
  const [enCours, setEnCours] = useState(false);
  const maj = (champ) => (valeur) => setForm((f) => ({ ...f, [champ]: valeur }));

  async function valider(e) {
    e.preventDefault();
    setErreur('');
    setEnCours(true);
    try {
      await surValide(form);
    } catch (err) {
      setErreur(err.message);
      setEnCours(false);
    }
  }

  return (
    <form onSubmit={valider} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Champ label="Nom de la spécialité" valeur={form.libelle} onChange={maj('libelle')} requis maxLength={120} />
        <Champ label="Groupe" valeur={form.groupe} onChange={maj('groupe')} requis maxLength={120} list="groupes-specialites" />
        <Selecteur label="Type" valeur={form.type} onChange={maj('type')} options={OPTIONS_TYPE} />
      </div>
      <datalist id="groupes-specialites">
        {groupes.map((g) => (
          <option key={g} value={g} />
        ))}
      </datalist>
      <Alerte>{erreur}</Alerte>
      <div className="flex flex-wrap gap-2">
        <Bouton type="submit" enCours={enCours}>
          {libelleBouton}
        </Bouton>
        {surAnnuler && (
          <Bouton type="button" variante="secondaire" onClick={surAnnuler}>
            Annuler
          </Bouton>
        )}
      </div>
    </form>
  );
}

function Contenu() {
  const [liste, setListe] = useState(null);
  const [erreur, setErreur] = useState('');
  const [recherche, setRecherche] = useState('');
  const [filtre, setFiltre] = useState('');
  const [inactives, setInactives] = useState(true);
  const [edition, setEdition] = useState(null);
  const [ajout, setAjout] = useState(false);
  const [message, setMessage] = useState('');

  const charger = useCallback(async () => {
    try {
      const r = await appelApi('/specialites?toutes=true');
      setListe(r.specialites);
      setErreur('');
    } catch (e) {
      setErreur(e.message);
    }
  }, []);

  useEffect(() => {
    charger();
  }, [charger]);

  const groupes = useMemo(() => [...new Set((liste || []).map((s) => s.groupe))], [liste]);

  const visibles = useMemo(() => {
    const q = normaliser(recherche);
    return (liste || [])
      .filter((s) => (inactives || s.actif) && (!filtre || s.type === filtre) && (!q || normaliser(`${s.libelle} ${s.groupe}`).includes(q)))
      .sort((a, b) => rangGroupe(a.groupe) - rangGroupe(b.groupe) || a.groupe.localeCompare(b.groupe) || a.libelle.localeCompare(b.libelle));
  }, [liste, recherche, filtre, inactives]);

  async function basculer(s) {
    setMessage('');
    try {
      await appelApi(`/specialites/${s.id}`, { methode: 'PUT', json: { actif: !s.actif } });
      setMessage(s.actif ? `« ${s.libelle} » est désactivée : elle n'est plus proposée dans les listes.` : `« ${s.libelle} » est de nouveau disponible.`);
      await charger();
    } catch (e) {
      setErreur(e.message);
    }
  }

  let groupeCourant = null;
  return (
    <Page
      titre="Spécialités médicales"
      sousTitre="Liste utilisée pour les fiches médecins et la recherche des patients."
      action={
        !ajout && (
          <Bouton onClick={() => setAjout(true)}>+ Ajouter une spécialité</Bouton>
        )
      }
    >
      {ajout && (
        <Carte titre="Nouvelle spécialité">
          <FormulaireSpecialite
            initial={{ libelle: '', groupe: groupes[0] || '', type: 'MEDECIN' }}
            groupes={groupes}
            libelleBouton="Ajouter"
            surAnnuler={() => setAjout(false)}
            surValide={async (f) => {
              await appelApi('/specialites', { methode: 'POST', json: f });
              setAjout(false);
              setMessage(`« ${f.libelle} » a été ajoutée.`);
              await charger();
            }}
          />
        </Carte>
      )}

      <Carte titre={`Spécialités${liste ? ` (${visibles.length})` : ''}`}>
        <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_220px]">
          <Champ label="Rechercher" valeur={recherche} onChange={setRecherche} />
          <Selecteur
            label="Type"
            valeur={filtre}
            onChange={setFiltre}
            options={[{ valeur: '', libelle: 'Tous' }, ...OPTIONS_TYPE]}
          />
        </div>
        <label className="mb-4 flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={inactives} onChange={(e) => setInactives(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
          Afficher aussi les spécialités désactivées
        </label>
        <Alerte>{erreur}</Alerte>
        <Alerte type="succes">{message}</Alerte>
        {!liste && !erreur && <Chargement />}
        {liste && visibles.length === 0 && <p className="text-sm text-slate-500">Aucune spécialité ne correspond.</p>}
        {liste && visibles.length > 0 && (
          <ul className="mt-2">
            {visibles.map((s) => {
              const entete = s.groupe !== groupeCourant;
              groupeCourant = s.groupe;
              return (
                <li key={s.id}>
                  {entete && <h3 className="mb-1 mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500">{s.groupe}</h3>}
                  {edition === s.id ? (
                    <div className="my-2 rounded-xl border border-marque-200 bg-marque-50/40 p-4">
                      <FormulaireSpecialite
                        initial={{ libelle: s.libelle, groupe: s.groupe, type: s.type }}
                        groupes={groupes}
                        libelleBouton="Enregistrer"
                        surAnnuler={() => setEdition(null)}
                        surValide={async (f) => {
                          await appelApi(`/specialites/${s.id}`, { methode: 'PUT', json: f });
                          setEdition(null);
                          setMessage(`« ${f.libelle} » a été modifiée.`);
                          await charger();
                        }}
                      />
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2 border-t border-slate-100 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                      <div className={s.actif ? '' : 'opacity-60'}>
                        <p className="font-medium text-slate-800">
                          {s.libelle}
                          {s.type === 'PROFESSIONNEL_SANTE' && (
                            <span className="ml-2 rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800">Professionnel de santé</span>
                          )}
                          {!s.actif && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Désactivée</span>}
                        </p>
                        <p className="text-xs text-slate-500">
                          {s.nombreMedecins} fiche{s.nombreMedecins > 1 ? 's' : ''} rattachée{s.nombreMedecins > 1 ? 's' : ''}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <Bouton variante="secondaire" onClick={() => setEdition(s.id)}>
                          Modifier
                        </Bouton>
                        <Bouton variante="secondaire" onClick={() => basculer(s)}>
                          {s.actif ? 'Désactiver' : 'Réactiver'}
                        </Bouton>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Carte>
    </Page>
  );
}

export default function PageSpecialites() {
  return (
    <Protege roles={['ADMIN']}>
      <Contenu />
    </Protege>
  );
}
