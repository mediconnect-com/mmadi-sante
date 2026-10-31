'use client';
// Espace médecin : liste des patients qui lui sont attribués.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { appelApi } from '@/lib/api';
import { formaterDate } from '@/lib/constantes';
import Protege from '@/components/Protege';
import { Alerte, Carte, Chargement, Page } from '@/components/ui';

function Contenu() {
  const [patients, setPatients] = useState(null);
  const [erreur, setErreur] = useState('');

  useEffect(() => {
    appelApi('/medecin/patients')
      .then((r) => setPatients(r.patients))
      .catch((e) => setErreur(e.message));
  }, []);

  return (
    <Page titre="Mes patients" sousTitre="Les patients qui vous ont été attribués par l'administrateur.">
      <Alerte>{erreur}</Alerte>
      {!patients && !erreur && <Chargement />}
      {patients && (
        <Carte>
          {patients.length === 0 ? (
            <p className="text-sm text-slate-500">Aucun patient ne vous est attribué pour le moment.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {patients.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/medecin/patient/?id=${p.id}`}
                    className="flex flex-col gap-1 rounded-lg px-2 py-3 hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <span>
                      <span className="font-medium text-slate-800">
                        {p.prenom} {p.nom}
                      </span>
                      <span className="ml-2 text-sm text-slate-500">{p.email}</span>
                    </span>
                    <span className="text-sm text-slate-500">
                      {p.nombreDocuments} document(s) · attribué le {formaterDate(p.attribueLe)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Carte>
      )}
    </Page>
  );
}

export default function PageMedecin() {
  return (
    <Protege roles={['MEDECIN']}>
      <Contenu />
    </Protege>
  );
}
