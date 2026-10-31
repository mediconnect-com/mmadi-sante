'use client';
// Création d'un compte de n'importe quel profil par l'administrateur.
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { appelApi } from '@/lib/api';
import Protege from '@/components/Protege';
import { Alerte, Bouton, Carte, Champ, Page, Selecteur } from '@/components/ui';
import SelecteurSpecialites from '@/components/SelecteurSpecialites';

function Contenu() {
  const router = useRouter();
  const [form, setForm] = useState({
    role: 'MEDECIN',
    prenom: '',
    nom: '',
    email: '',
    motDePasse: '',
    telephone: '',
    adresse: '',
    carteIdentite: '',
    // Fiche médecin
    sansCompte: false,
    adresseProfessionnelle: '',
    specialiteIds: [],
  });
  const [erreur, setErreur] = useState('');
  const [enCours, setEnCours] = useState(false);
  const maj = (champ) => (valeur) => setForm((f) => ({ ...f, [champ]: valeur }));
  const estMedecin = form.role === 'MEDECIN';
  const sansCompte = estMedecin && form.sansCompte;

  async function valider(e) {
    e.preventDefault();
    setErreur('');
    setEnCours(true);
    try {
      // On n'envoie les champs « médecin » que pour un médecin ; une fiche sans compte n'a ni mot de passe ni e-mail obligatoire.
      const { sansCompte, adresseProfessionnelle, specialiteIds, ...commun } = form;
      const json = estMedecin ? { ...commun, sansCompte, adresseProfessionnelle, specialiteIds } : commun;
      if (estMedecin && sansCompte) delete json.motDePasse;
      const r = await appelApi('/admin/utilisateurs', { methode: 'POST', json });
      router.replace(`/admin/utilisateur/?id=${r.utilisateur.id}`);
    } catch (err) {
      setErreur(err.message);
      setEnCours(false);
    }
  }

  return (
    <Page
      titre="Nouvel utilisateur"
      sousTitre="Créez un compte patient, médecin ou administrateur."
      action={
        <Link href="/admin/" className="text-sm font-medium text-marque-700 hover:underline">
          ← Retour
        </Link>
      }
    >
      <Carte>
        <form onSubmit={valider} className="space-y-4">
          <Selecteur
            label="Profil"
            valeur={form.role}
            onChange={maj('role')}
            requis
            options={[
              { valeur: 'MEDECIN', libelle: 'Médecin' },
              { valeur: 'PATIENT', libelle: 'Patient' },
              { valeur: 'ADMIN', libelle: 'Administrateur' },
            ]}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Champ label="Prénom" valeur={form.prenom} onChange={maj('prenom')} requis maxLength={100} />
            <Champ label="Nom" valeur={form.nom} onChange={maj('nom')} requis maxLength={100} />
            <Champ label="Adresse e-mail" type="email" valeur={form.email} onChange={maj('email')} requis={!sansCompte} aide={sansCompte ? 'Facultative pour une fiche sans compte.' : undefined} />
            {!sansCompte && (
              <Champ
                label="Mot de passe initial"
                type="password"
                valeur={form.motDePasse}
                onChange={maj('motDePasse')}
                requis
                autoComplete="new-password"
                aide="8 caractères minimum, avec au moins une lettre et un chiffre. Communiquez-le à l'utilisateur."
              />
            )}
            <Champ label="Numéro de mobile" type="tel" valeur={form.telephone} onChange={maj('telephone')} />
            <Champ label="Numéro de la carte d'identité" valeur={form.carteIdentite} onChange={maj('carteIdentite')} maxLength={40} />
          </div>
          <Champ label="Adresse postale" valeur={form.adresse} onChange={maj('adresse')} maxLength={250} />
          {estMedecin && (
            <div className="space-y-4 rounded-xl border border-marque-100 bg-marque-50/40 p-4">
              <p className="text-sm font-semibold text-marque-800">Fiche du médecin</p>
              <SelecteurSpecialites
                label="Spécialités"
                valeur={form.specialiteIds}
                onChange={maj('specialiteIds')}
                aide="Choisissez une ou plusieurs spécialités dans la liste (recherche possible)."
              />
              <Champ
                label="Adresse professionnelle"
                valeur={form.adresseProfessionnelle}
                onChange={maj('adresseProfessionnelle')}
                maxLength={250}
                placeholder="Cabinet, rue, code postal, ville"
              />
              <label className="flex items-start gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={form.sansCompte}
                  onChange={(e) => maj('sansCompte')(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-slate-300"
                />
                <span>
                  Créer seulement la fiche, sans compte de connexion
                  <span className="block text-xs text-slate-500">
                    Pour un médecin qui n&apos;utilisera pas l&apos;application : il apparaît dans l&apos;annuaire des patients mais ne peut pas se connecter.
                  </span>
                </span>
              </label>
            </div>
          )}
          <Alerte>{erreur}</Alerte>
          <Bouton type="submit" enCours={enCours}>
            Créer le compte
          </Bouton>
        </form>
      </Carte>
    </Page>
  );
}

export default function PageNouvelUtilisateur() {
  return (
    <Protege roles={['ADMIN']}>
      <Contenu />
    </Protege>
  );
}
