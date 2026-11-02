'use client';
// V3 — Commentaires et pathologies d'un patient, TOUJOURS rédigés à propos d'un rendez-vous.
//   mode « medecin » : le médecin choisit un rendez-vous confirmé et passé, puis saisit, modifie, supprime SES commentaires
//   mode « lecture »  : liste en lecture seule (le patient dans « Mon dossier », l'administrateur dans la fiche du patient)
import { useState } from 'react';
import Link from 'next/link';
import { appelApi } from '@/lib/api';
import { formaterDate, formaterDateHeure } from '@/lib/constantes';
import { Alerte, Bouton, Selecteur } from './ui';

function Formulaire({ initial, rendezVousCommentables = [], rendezVousFixe, surTermine, surAnnuler }) {
  const [rendezVousId, setRendezVousId] = useState(rendezVousFixe || (rendezVousCommentables[0] ? rendezVousCommentables[0].id : ''));
  const [pathologies, setPathologies] = useState(initial?.pathologies || '');
  const [commentaire, setCommentaire] = useState(initial?.commentaire || '');
  const [erreur, setErreur] = useState('');
  const [enCours, setEnCours] = useState(false);

  async function enregistrer(e) {
    e.preventDefault();
    setErreur('');
    if (!initial && !rendezVousId) return setErreur('Choisissez le rendez-vous concerné.');
    if (!pathologies.trim() && !commentaire.trim()) return setErreur('Renseignez au moins les pathologies ou un commentaire.');
    setEnCours(true);
    try {
      if (initial) await appelApi(`/commentaires/${initial.id}`, { methode: 'PUT', json: { pathologies, commentaire } });
      else await appelApi('/commentaires', { methode: 'POST', json: { rendezVousId, pathologies, commentaire } });
      if (!initial) {
        setPathologies('');
        setCommentaire('');
      }
      await surTermine();
    } catch (err) {
      setErreur(err.message);
    } finally {
      setEnCours(false);
    }
  }

  return (
    <form onSubmit={enregistrer} className="space-y-3">
      {!initial && !rendezVousFixe && (
        <Selecteur
          label="Rendez-vous concerné"
          valeur={rendezVousId}
          onChange={setRendezVousId}
          requis
          options={rendezVousCommentables.map((r) => ({ valeur: r.id, libelle: `${formaterDateHeure(r.dateHeure)}${r.motif ? ` — ${r.motif}` : ''}` }))}
        />
      )}
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">Pathologies</span>
        <textarea
          value={pathologies}
          onChange={(e) => setPathologies(e.target.value)}
          rows={2}
          maxLength={1000}
          placeholder="Ex. hypertension artérielle, diabète de type 2"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-marque-600 focus:outline-none focus:ring-2 focus:ring-marque-500/30"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">Commentaire</span>
        <textarea
          value={commentaire}
          onChange={(e) => setCommentaire(e.target.value)}
          rows={4}
          maxLength={3000}
          placeholder="Observations, conduite à tenir, points de vigilance…"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-marque-600 focus:outline-none focus:ring-2 focus:ring-marque-500/30"
        />
      </label>
      <Alerte>{erreur}</Alerte>
      <div className="flex flex-wrap gap-2">
        <Bouton type="submit" enCours={enCours}>
          {initial ? 'Enregistrer les modifications' : 'Enregistrer le commentaire'}
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

export default function CommentairesPatient({
  commentaires,
  rendezVousCommentables = [],
  rendezVousFixe,
  mode = 'lecture',
  surChangement,
  vide = 'Aucun commentaire pour le moment.',
}) {
  const [edition, setEdition] = useState(null);
  const [erreur, setErreur] = useState('');

  async function supprimer(c) {
    if (!window.confirm('Supprimer définitivement ce commentaire ?')) return;
    setErreur('');
    try {
      await appelApi(`/commentaires/${c.id}`, { methode: 'DELETE' });
      await surChangement();
    } catch (e) {
      setErreur(e.message);
    }
  }

  return (
    <div className="space-y-4">
      {mode === 'medecin' && (rendezVousFixe || rendezVousCommentables.length > 0) && (
        <div className="rounded-xl border border-marque-100 bg-marque-50/40 p-4">
          <p className="mb-3 text-sm font-semibold text-marque-800">Nouveau commentaire</p>
          <p className="mb-3 text-xs text-slate-600">
            Un commentaire se rédige à propos d&apos;un rendez-vous (un seul par rendez-vous). Il est visible par le patient, dans son dossier, et par l&apos;administrateur ; les autres médecins ne le voient pas.
          </p>
          <Formulaire rendezVousCommentables={rendezVousCommentables} rendezVousFixe={rendezVousFixe} surTermine={surChangement} />
        </div>
      )}
      {mode === 'medecin' && !rendezVousFixe && rendezVousCommentables.length === 0 && (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
          Aucun rendez-vous à commenter : un commentaire se rédige à propos d&apos;un rendez-vous <strong>confirmé et déjà commencé</strong> avec ce patient, qui n&apos;en a pas encore.{' '}
          <Link href="/rendez-vous/" className="font-medium text-marque-700 hover:underline">
            Voir mes rendez-vous
          </Link>
        </p>
      )}
      <Alerte>{erreur}</Alerte>
      {commentaires.length === 0 ? (
        <p className="text-sm text-slate-500">{vide}</p>
      ) : (
        <ul className="space-y-3">
          {commentaires.map((c) => (
            <li key={c.id} className="rounded-xl border border-slate-200 bg-white p-4">
              {edition === c.id ? (
                <Formulaire
                  initial={c}
                  surAnnuler={() => setEdition(null)}
                  surTermine={async () => {
                    setEdition(null);
                    await surChangement();
                  }}
                />
              ) : (
                <>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                    <span>
                      <span className="font-semibold text-slate-700">{c.medecinNom}</span> · {formaterDate(c.creeLe)}
                      {c.rendezVousId && (
                        <>
                          {' · '}
                          <Link href={`/rendez-vous/detail/?id=${c.rendezVousId}`} className="font-medium text-marque-700 hover:underline">
                            rendez-vous du {formaterDate(c.rendezVousDateHeure)}
                          </Link>
                        </>
                      )}
                      {c.modifieLe && new Date(c.modifieLe) - new Date(c.creeLe) > 60000 && <span> · modifié le {formaterDate(c.modifieLe)}</span>}
                    </span>
                    {mode === 'medecin' && (
                      <span className="flex gap-2">
                        <Bouton variante="secondaire" onClick={() => setEdition(c.id)}>
                          Modifier
                        </Bouton>
                        <Bouton variante="danger" onClick={() => supprimer(c)}>
                          Supprimer
                        </Bouton>
                      </span>
                    )}
                  </div>
                  {c.pathologies && (
                    <p className="mb-2 text-sm">
                      <span className="mr-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-900">Pathologies</span>
                      <span className="whitespace-pre-line text-slate-800">{c.pathologies}</span>
                    </p>
                  )}
                  {c.commentaire && <p className="whitespace-pre-line text-sm text-slate-700">{c.commentaire}</p>}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
