'use client';
// Gestion de la session (jeton JWT conservé dans le navigateur) partagée par toutes les pages.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { appelApi, ecrireJeton, effacerJeton, lireJeton, reveillerApi } from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [utilisateur, setUtilisateur] = useState(null);
  const [chargement, setChargement] = useState(true);
  const [serveurReveil, setServeurReveil] = useState(false);

  // Charge le compte courant ; si le serveur gratuit dort, on réessaie quelques fois.
  const recharger = useCallback(async () => {
    if (!lireJeton()) {
      setUtilisateur(null);
      setChargement(false);
      return;
    }
    for (let essai = 0; essai < 8; essai += 1) {
      try {
        const r = await appelApi('/auth/moi');
        setUtilisateur(r.utilisateur);
        setServeurReveil(false);
        setChargement(false);
        return;
      } catch (e) {
        if (e.statut !== 0) break; // vraie erreur (ex. session expirée) : inutile de réessayer
        setServeurReveil(true);
        await new Promise((ok) => setTimeout(ok, 6000));
      }
    }
    setServeurReveil(false);
    setUtilisateur(null);
    setChargement(false);
  }, []);

  useEffect(() => {
    reveillerApi();
    recharger();
    const surDeconnexion = () => setUtilisateur(null);
    window.addEventListener('mmadi:deconnecte', surDeconnexion);
    return () => window.removeEventListener('mmadi:deconnecte', surDeconnexion);
  }, [recharger]);

  const connecter = useCallback(async (email, motDePasse) => {
    const r = await appelApi('/auth/connexion', { methode: 'POST', json: { email, motDePasse } });
    ecrireJeton(r.jeton);
    setUtilisateur(r.utilisateur);
    return r.utilisateur;
  }, []);

  const inscrire = useCallback(async (donnees) => {
    const r = await appelApi('/auth/inscription', { methode: 'POST', json: donnees });
    ecrireJeton(r.jeton);
    setUtilisateur(r.utilisateur);
    return r.utilisateur;
  }, []);

  const deconnecter = useCallback(() => {
    effacerJeton();
    setUtilisateur(null);
  }, []);

  const valeur = useMemo(
    () => ({ utilisateur, setUtilisateur, chargement, serveurReveil, connecter, inscrire, deconnecter }),
    [utilisateur, chargement, serveurReveil, connecter, inscrire, deconnecter]
  );
  return <AuthContext.Provider value={valeur}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé dans <AuthProvider>.');
  return ctx;
}
