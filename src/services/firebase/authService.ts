import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithCredential,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import { firebaseAuth } from './firebaseConfig';
import { AniCSAnalytics } from './analyticsService';

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export interface AuthUserInfo {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

export function formatAuthUser(user: User | null): AuthUserInfo | null {
  if (!user) return null;
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
  };
}

/**
 * Inicia sesión con Google abriendo el navegador seguro del sistema operativo
 * para evitar las restricciones de WebView2 / WebView (403 disallowed_useragent).
 */
export async function loginWithGoogleBrowser(onWaitingChange?: (waiting: boolean) => void): Promise<AuthUserInfo> {
  try {
    let port = 0;
    try {
      port = await invoke<number>('get_local_server_port');
    } catch {
      return await loginWithGoogle();
    }

    if (!port || port === 0) {
      return await loginWithGoogle();
    }

    const authUrl = `http://localhost:${port}/auth/login`;

    // Limpiar estado residual anterior
    try {
      await fetch(`http://127.0.0.1:${port}/auth/clear`, { method: 'POST' });
    } catch {}

    // Abrir en el navegador predeterminado del sistema
    try {
      await openUrl(authUrl);
    } catch {
      if (typeof window !== 'undefined') {
        window.open(authUrl, '_blank');
      }
    }

    if (onWaitingChange) onWaitingChange(true);

    const startTime = Date.now();
    const timeoutMs = 3 * 60 * 1000; // 3 minutos

    while (Date.now() - startTime < timeoutMs) {
      await new Promise((res) => setTimeout(res, 800));

      try {
        const response = await fetch(`http://127.0.0.1:${port}/auth/status`);
        if (response.ok) {
          const data = await response.json();
          if (data.authenticated && data.user) {
            // Limpiar estado en el servidor
            await fetch(`http://127.0.0.1:${port}/auth/clear`, { method: 'POST' }).catch(() => {});
            
            const u = data.user;
            
            // Autenticar la instancia de Firebase Auth local si se recibieron tokens
            if (u.id_token || u.idToken || u.access_token || u.accessToken) {
              try {
                const cred = GoogleAuthProvider.credential(u.id_token || u.idToken, u.access_token || u.accessToken);
                const localRes = await signInWithCredential(firebaseAuth, cred);
                const localFormatted = formatAuthUser(localRes.user);
                if (localFormatted) {
                  if (onWaitingChange) onWaitingChange(false);
                  AniCSAnalytics.logLogin('google');
                  return localFormatted;
                }
              } catch (credErr) {
                console.warn('[AniCS Auth] Fallback local signInWithCredential:', credErr);
              }
            }

            const formatted: AuthUserInfo = {
              uid: u.uid,
              email: u.email || null,
              displayName: u.display_name || u.displayName || null,
              photoURL: u.photo_url || u.photoURL || null,
            };

            if (onWaitingChange) onWaitingChange(false);
            AniCSAnalytics.logLogin('google');
            return formatted;
          }
        }
      } catch {}
    }

    if (onWaitingChange) onWaitingChange(false);
    throw new Error('Tiempo de espera agotado en la autenticación del navegador.');
  } catch (error: any) {
    if (onWaitingChange) onWaitingChange(false);
    console.error('[AniCS Auth] Error en loginWithGoogleBrowser:', error);
    throw error;
  }
}

export async function loginWithGoogle(): Promise<AuthUserInfo> {
  try {
    const result = await signInWithPopup(firebaseAuth, googleProvider);
    const formatted = formatAuthUser(result.user);
    if (!formatted) throw new Error('No se pudo obtener la información de usuario de Google');
    AniCSAnalytics.logLogin('google');
    return formatted;
  } catch (error: any) {
    console.error('[AniCS Auth] Error en login con Google:', error);
    if (error.code === 'auth/popup-blocked') {
      throw new Error('Las ventanas emergentes están bloqueadas por el navegador de la aplicación. Por favor inicia sesión o regístrate con tu Correo y Contraseña.');
    }
    if (error.code === 'auth/popup-closed-by-user') {
      throw new Error('Inicio de sesión cancelado.');
    }
    if (error.code === 'auth/unauthorized-domain') {
      throw new Error('Dominio no autorizado en Firebase Console. Asegúrate de añadir localhost en la consola.');
    }
    if (error.code === 'auth/operation-not-allowed') {
      throw new Error('El proveedor de Google no está habilitado en la consola de Firebase Authentication.');
    }
    throw new Error(error.message || 'Error al iniciar sesión con Google.');
  }
}

export async function loginWithEmail(email: string, pass: string): Promise<AuthUserInfo> {
  try {
    const result = await signInWithEmailAndPassword(firebaseAuth, email.trim(), pass);
    const formatted = formatAuthUser(result.user);
    if (!formatted) throw new Error('Usuario no válido');
    AniCSAnalytics.logLogin('email');
    return formatted;
  } catch (error: any) {
    console.error('[AniCS Auth] Error en login con Email:', error);
    if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
      throw new Error('Credenciales incorrectas. Verifica tu correo y contraseña.');
    }
    if (error.code === 'auth/invalid-email') {
      throw new Error('El formato del correo no es válido.');
    }
    throw new Error(error.message || 'Error al iniciar sesión con correo.');
  }
}

export async function registerWithEmail(email: string, pass: string): Promise<AuthUserInfo> {
  try {
    const result = await createUserWithEmailAndPassword(firebaseAuth, email.trim(), pass);
    const formatted = formatAuthUser(result.user);
    if (!formatted) throw new Error('No se pudo crear la cuenta');
    return formatted;
  } catch (error: any) {
    console.error('[AniCS Auth] Error en registro con Email:', error);
    if (error.code === 'auth/email-already-in-use') {
      throw new Error('Este correo ya está registrado. Intenta iniciar sesión.');
    }
    if (error.code === 'auth/weak-password') {
      throw new Error('La contraseña es demasiado débil (mínimo 6 caracteres).');
    }
    throw new Error(error.message || 'Error al registrar cuenta.');
  }
}

export async function logoutFirebase(): Promise<void> {
  try {
    await signOut(firebaseAuth);
  } catch (error) {
    console.error('[AniCS Auth] Error al cerrar sesión:', error);
    throw error;
  }
}

export function getCurrentFirebaseUser(): AuthUserInfo | null {
  return formatAuthUser(firebaseAuth.currentUser);
}

export function subscribeToAuthChanges(callback: (user: AuthUserInfo | null) => void): () => void {
  return onAuthStateChanged(firebaseAuth, (user) => {
    callback(formatAuthUser(user));
  });
}
