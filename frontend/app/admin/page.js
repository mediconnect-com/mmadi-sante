'use client';
// Espace administrateur : statistiques, recherche et suppression des utilisateurs.
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { appelApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import Protege from '@/components/Protege';
import { Alerte, BadgeRole, Bouton, Carte, Champ, Chargement, Page, Selecteur } from '@/components/ui';

function Statistique({ valeur, libelle, href, onClick, actif = false }) {
  const classes = `block rounded-xl border bg-white p-4 text-center shadow-sm ${actif ? 'border-marque-500 ring-2 ring-marque-200' : 'border-slate-200'} ${
    href || onClick ? 'transition hover:border-marque-400 hover:shadow focus:outline-none focus:ring-2 focus:ring-marque-300' : ''
  }`;
  const contenu = (
    <>
      <p className="text-2xl font-bold text-marque-700">{valeur}</p>
      <p className="text-xs text-slate-500">{libelle}</p>
    </>
  );
  if (href) return <Link href={href} className={classes}>{contenu}</Link>;
  if (onClick) return <button type="button" onClick={onClick} className={`${classes} w-full`}>{contenu}</button>;
  return <div className={classes}>{contenu}</div>;
}

function Contenu() {
  const { utilisateur: moi } = useAuth();
  const [stats, setStats] = useState(null);
  const [liste, setListe] = useState(null);
  const [role, setRole] = useState('');
  const [recherche, setRecherche] = useState('');
  const [erreur, setErreur] = useState('');

  const charger = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (role) params.set('role', role);
      if (recherche.trim()) params.set('q', recherche.trim());
      const [s, l] = await Promise.all([appelApi('/admin/statistiques'), appelApi(`/admin/utilisateurs?${params}`)]);
      setStats(s);
      setListe(l.utilisateurs);
      setErreur('');
    } catch (e) {
      setErreur(e.message);
    }
  }, [role, recherche]);

  // Petite temporisation pour ne pas interroger l'API à chaque lettre tapée.
  useEffect(() => {
    const t = setTimeout(charger, 250);
    return () => clearTimeout(t);
  }, [charger]);

  async function supprimer(u) {
    if (!window.confirm(`Supprimer définitivement le compte de ${u.prenom} ${u.nom}, ainsi que tous ses documents ?`)) return;
    try {
      await appelApi(`/admin/utilisateurs/${u.id}`, { methode: 'DELETE' });
      await charger();
    } catch (e) {
      setErreur(e.message);
    }
  }

  return (
    <Page
      titre="Administration"
      sousTitre="Tous les utilisateurs et toutes les données de la plateforme."
      action={
        <Link href="/admin/nouveau/" className="rounded-lg bg-marque-600 px-4 py-2 text-sm font-medium text-white hover:bg-marque-700">
          + Nouvel utilisateur
        </Link>
      }
    >
      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
          <Statistique valeur={stats.patients} libelle="Patients" actif={role === 'PATIENT'} onClick={() => setRole(role === 'PATIENT' ? '' : 'PATIENT')} />
          <Statistique valeur={stats.medecins} libelle="Médecins" actif={role === 'MEDECIN'} onClick={() => setRole(role === 'MEDECIN' ? '' : 'MEDECIN')} />
          <Statistique valeur={stats.admins} libelle="Administrateurs" actif={role === 'ADMIN'} onClick={() => setRole(role === 'ADMIN' ? '' : 'ADMIN')} />
          <Statistique valeur={stats.documents} libelle="Documents" href="/admin/documents/" />
          <Statistique valeur={stats.attributions} libelle="Attributions" />
          <Statistique valeur={stats.rendezVous ?? 0} libelle="Rendez-vous (tout voir)" href="/rendez-vous/" />
        </div>
      )}

      <Carte titre="Utilisateurs">
        <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_220px]">
          <Champ label="Rechercher (nom, prénom, e-mail)" valeur={recherche} onChange={setRecherche} />
          <Selecteur
            label="Profil"
            valeur={role}
            onChange={setRole}
            options={[
              { valeur: '', libelle: 'Tous les profils' },
              { valeur: 'PATIENT', libelle: 'Patients' },
              { valeur: 'MEDECIN', libelle: 'Médecins' },
              { valeur: 'ADMIN', libelle: 'Administrateurs' },
            ]}
          />
        </div>
        <Alerte>{erreur}</Alerte>
        {!liste && !erreur && <Chargement />}
        {liste && liste.length === 0 && <p className="text-sm text-slate-500">Aucun utilisateur trouvé.</p>}
        {liste && liste.length > 0 && (
          <ul className="divide-y divide-slate-100">
            {liste.map((u) => (
              <li key={u.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-medium text-slate-800">
                    {u.prenom} {u.nom} <BadgeRole role={u.role} />
                  </p>
                  <p className="truncate text-sm text-slate-500">
                    {u.email || 'sans e-mail'} · {u.telephone || 'pas de mobile'} · {u.nombreDocuments} document(s)
                  </p>
                  {u.role === 'MEDECIN' && (
                    <p className="text-sm text-slate-500">
                      {u.specialites && u.specialites.length > 0 ? u.specialites.map((s) => s.libelle).join(', ') : 'Aucune spécialité'}
                      {u.adresseProfessionnelle ? ` · ${u.adresseProfessionnelle}` : ''}
                      {u.sansCompte ? ' · fiche sans compte de connexion' : ''}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 gap-2">
                  <Link
                    href={`/admin/utilisateur/?id=${u.id}`}
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Consulter
                  </Link>
                  {u.id !== moi.id && (
                    <Bouton variante="danger" onClick={() => supprimer(u)}>
                      Supprimer
                    </Bouton>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Carte>
    </Page>
  );
}

export default function PageAdmin() {
  return (
    <Protege roles={['ADMIN']}>
      <Contenu />
    </Protege>
  );
}
