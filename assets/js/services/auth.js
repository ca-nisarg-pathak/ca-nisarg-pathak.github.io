/**
 * Client authentication for the (upcoming) client portal.
 *
 * Token storage strategy: the token is kept in sessionStorage so it dies with
 * the tab. If the backend is built with httpOnly session cookies instead —
 * which is the safer option and the recommended one — delete the token
 * helpers below and switch `request()` in api.js to `credentials: 'include'`.
 */

import { post, get } from './api.js';

const TOKEN_KEY = 'np_token';
const USER_KEY = 'np_user';

export function getToken(){
  return sessionStorage.getItem(TOKEN_KEY);
}

export function isSignedIn(){
  return Boolean(getToken());
}

/** The cached client record, or null. Always re-verify server-side. */
export function getCachedUser(){
  try{
    return JSON.parse(sessionStorage.getItem(USER_KEY)) || null;
  }catch{
    return null;
  }
}

export function clearSession(){
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
}

/** POST /auth/login -> { token, user } */
export async function signIn(email, password){
  const { token, user } = await post('/auth/login', { email, password });
  sessionStorage.setItem(TOKEN_KEY, token);
  sessionStorage.setItem(USER_KEY, JSON.stringify(user));
  return user;
}

export async function signOut(){
  try{
    await post('/auth/logout', {}, { auth: true });
  }finally{
    clearSession();
  }
}

/** GET /auth/me -> the signed-in client, refreshing the local cache. */
export async function fetchCurrentUser(){
  const user = await get('/auth/me', { auth: true });
  sessionStorage.setItem(USER_KEY, JSON.stringify(user));
  return user;
}

/** POST /auth/password-reset -> {} (always resolves, never leaks existence) */
export function requestPasswordReset(email){
  return post('/auth/password-reset', { email });
}
