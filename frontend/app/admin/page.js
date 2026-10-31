'use client';
// Espace administrateur : statistiques, recherche et suppression des utilisateurs.
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { appelApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import Protege from '@/components/Protege';
import { Alerte, BadgeRole, Bouton, Carte, Champ, Chargement, Page, Selecteur } from '@/components/ui';

function Statistique({ valeur, libelle }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 text-center shadow-sm">
      <p className="text-2xl font-bold text-marque-700">{valeur}</p>
      <p className="text-xs text-slate-500">{libelle}</p>
    </div>
  );
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
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Statistique valeur={stats.patients} libelle="Patients" />
          <Statistique valeur={stats.medecins} libelle="Médecins" />
          <Statistique valeur={stats.admins} libelle="Administrateurs" />
          <Statistique valeur={stats.documents} libelle="Documents" />
          <Statistique valeur={stats.attributions} libelle="Attributions" />
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
                    {u.email} · {u.telephone || 'pas de mobile'} · {u.nombreDocuments} document(s)
                  </p>
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
