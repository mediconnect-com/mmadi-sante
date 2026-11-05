'use client';
// « Mes médecins » (patient) : coordonnées et spécialités des médecins qui lui sont associés.
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { appelApi } from '@/lib/api';
import { nomComplet } from '@/lib/constantes';
import { Alerte, Bouton, Carte, Chargement } from './ui';
import CarteMedecin from './CarteMedecin';

export default function MesMedecins() {
  const [medecins, setMedecins] = useState(null);
  const [erreur, setErreur] = useState('');

  const charger = useCallback(async () => {
    try {
      const r = await appelApi('/profil/medecins');
      setMedecins(r.medecins);
      setErreur('');
    } catch (e) {
      setErreur(e.message);
    }
  }, []);

  useEffect(() => {
    charger();
  }, [charger]);

  async function retirer(m) {
    if (!window.confirm(`Retirer ${nomComplet(m)} de vos médecins ? Il n'aura plus accès à votre dossier.`)) return;
    try {
      await appelApi(`/profil/medecins/${m.id}`, { methode: 'DELETE' });
      await charger();
    } catch (e) {
      setErreur(e.message);
    }
  }

  return (
    <Carte
      titre={`Mes médecins${medecins ? ` (${medecins.length})` : ''}`}
      action={
        <Link href="/rendez-vous/?nouveau=1" className="rounded-lg bg-marque-600 px-4 py-2 text-sm font-medium text-white hover:bg-marque-700">
          Prendre rendez-vous
        </Link>
      }
    >
      <Alerte>{erreur}</Alerte>
      {!medecins && !erreur && <Chargement />}
      {medecins && medecins.length === 0 && (
        <p className="text-sm text-slate-500">
          Aucun médecin n&apos;est associé à votre dossier pour le moment. Vous pouvez en rechercher un et prendre rendez-vous.
        </p>
      )}
      {medecins && medecins.length > 0 && (
        <ul className="space-y-3">
          {medecins.map((m) => (
            <li key={m.id}>
              <CarteMedecin
                medecin={m}
                actions={
                  <>
                    <Link
                      href={`/rendez-vous/?medecin=${m.id}`}
                      className="rounded-lg border border-marque-600 px-3 py-1.5 text-sm font-medium text-marque-700 hover:bg-marque-50"
                    >
                      Prendre rendez-vous
                    </Link>
                    <Bouton variante="secondaire" onClick={() => retirer(m)}>
                      Retirer
                    </Bouton>
                  </>
                }
              />
            </li>
          ))}
        </ul>
      )}
    </Carte>
  );
}
