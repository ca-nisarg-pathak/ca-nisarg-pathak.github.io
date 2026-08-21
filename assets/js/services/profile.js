/**
 * Per-client profile data for the client portal.
 *
 * Endpoints are scoped to the signed-in client on the server — the client id
 * is never taken from the URL or the browser, only from the session token.
 * Otherwise any client could read another client's filings.
 */

import { get, put, request } from './api.js';

/** GET /me/profile -> { name, email, phone, pan, gstin, entityType, ... } */
export function getProfile(){
  return get('/me/profile', { auth: true });
}

/** PUT /me/profile */
export function updateProfile(changes){
  return put('/me/profile', changes, { auth: true });
}

/** GET /me/documents -> [{ id, name, category, uploadedAt, sizeBytes }] */
export function listDocuments(){
  return get('/me/documents', { auth: true });
}

/** POST /me/documents (multipart) */
export function uploadDocument(file, { category = 'other' } = {}){
  const formData = new FormData();
  formData.append('file', file);
  formData.append('category', category);
  return request('/me/documents', { method: 'POST', formData, auth: true });
}

/** GET /me/engagements -> the client's active services and their status */
export function listEngagements(){
  return get('/me/engagements', { auth: true });
}
