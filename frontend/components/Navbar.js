'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { accueilPourRole, ROLES } from '@/lib/constantes';

export default function Navbar() {
  const { utilisateur, deconnecter } = useAuth();
  const router = useRouter();

  const liens = [];
  if (utilisateur?.role === 'PATIENT') {
    liens.push({ href: '/profil/', texte: 'Mes informations' });
    liens.push({ href: '/mes-medecins/', texte: 'Mes médecins' });
    liens.push({ href: '/rendez-vous/', texte: 'Mes rendez-vous' });
  }
  if (utilisateur?.role === 'MEDECIN') {
    liens.push({ href: '/medecin/', texte: 'Mes patients' });
    liens.push({ href: '/rendez-vous/', texte: 'Rendez-vous' });
    liens.push({ href: '/profil/', texte: 'Mon profil' });
  }
  if (utilisateur?.role === 'ADMIN') {
    liens.push({ href: '/admin/', texte: 'Utilisateurs' });
    liens.push({ href: '/admin/documents/', texte: 'Documents' });
    liens.push({ href: '/rendez-vous/', texte: 'Rendez-vous' });
    liens.push({ href: '/admin/specialites/', texte: 'Spécialités' });
    liens.push({ href: '/profil/', texte: 'Mon profil' });
  }

  return (
    <header className="border-b border-slate-200 bg-white">
      <nav className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
        <Link href={utilisateur ? accueilPourRole(utilisateur.role) : '/'} className="flex items-center gap-2 text-lg font-bold text-marque-700">
          <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-lg bg-marque-600 text-white">
            +
          </span>
          MmadiSanté
        </Link>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          {liens.map((l) => (
            <Link key={l.href} href={l.href} className="font-medium text-slate-700 hover:text-marque-700">
              {l.texte}
            </Link>
          ))}
          {utilisateur ? (
            <>
              <span className="hidden text-slate-500 sm:inline">
                {utilisateur.prenom} {utilisateur.nom} · {ROLES[utilisateur.role]}
              </span>
              <button
                onClick={() => {
                  deconnecter();
                  router.push('/connexion/');
                }}
                className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50"
              >
                Déconnexion
              </button>
            </>
          ) : (
            <>
              <Link href="/connexion/" className="font-medium text-slate-700 hover:text-marque-700">
                Connexion
              </Link>
              <Link href="/inscription/" className="rounded-lg bg-marque-600 px-3 py-1.5 font-medium text-white hover:bg-marque-700">
                Créer un compte
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
