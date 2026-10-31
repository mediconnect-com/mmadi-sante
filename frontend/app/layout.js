import './globals.css';
import { AuthProvider } from '@/lib/auth';
import Navbar from '@/components/Navbar';

export const metadata = {
  title: 'MmadiSanté',
  description: 'Votre dossier de santé en ligne : informations personnelles et documents médicaux.',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body className="min-h-screen">
        <AuthProvider>
          <Navbar />
          <main>{children}</main>
          <footer className="mx-auto max-w-5xl px-4 py-8 text-center text-xs text-slate-500 sm:px-6">
            MmadiSanté — prototype de démonstration. Ne pas y enregistrer de données de santé réelles
            sans hébergement certifié HDS.
          </footer>
        </AuthProvider>
      </body>
    </html>
  );
}
