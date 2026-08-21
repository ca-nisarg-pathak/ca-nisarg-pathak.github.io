/**
 * Thin HTTP client. Every service module goes through this so that auth
 * headers, JSON handling and error shape are defined in exactly one place.
 */

import { config, hasBackend } from '../config.js';
import { getToken, clearSession } from './auth.js';

export class ApiError extends Error {
  constructor(message, status, body){
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

/** Raised when a call is attempted before `config.apiBaseUrl` is set. */
export class NoBackendError extends Error {
  constructor(){
    super('No API base URL configured — set config.apiBaseUrl in assets/js/config.js');
    this.name = 'NoBackendError';
  }
}

/** The request never reached the server (offline, DNS, CORS, timeout). */
export class NetworkError extends Error {
  constructor(cause){
    super("Couldn't reach the server. Check your connection and try again.");
    this.name = 'NetworkError';
    this.cause = cause;
  }
}

/**
 * @param {string} path    API path, e.g. '/enquiries'
 * @param {object} options
 * @param {string} [options.method='GET']
 * @param {object} [options.body]        serialised as JSON
 * @param {FormData} [options.formData]  sent as-is (file uploads)
 * @param {boolean} [options.auth=false] attach the bearer token
 */
export async function request(path, { method = 'GET', body, formData, auth = false, headers = {} } = {}){
  if(!hasBackend()) throw new NoBackendError();

  const init = { method, headers: { Accept: 'application/json', ...headers } };

  if(formData){
    init.body = formData; // let the browser set the multipart boundary
  }else if(body !== undefined){
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }

  if(auth){
    const token = getToken();
    if(token) init.headers.Authorization = `Bearer ${token}`;
  }

  let response;
  try{
    response = await fetch(`${config.apiBaseUrl}${path}`, init);
  }catch(cause){
    // fetch only rejects when the request never got a response at all.
    throw new NetworkError(cause);
  }

  const payload = await readBody(response);

  if(response.status === 401 && auth){
    clearSession();
  }
  if(!response.ok){
    const message = payload?.message || `Request failed (${response.status})`;
    throw new ApiError(message, response.status, payload);
  }

  return payload;
}

async function readBody(response){
  if(response.status === 204) return null;
  const type = response.headers.get('content-type') || '';
  return type.includes('application/json') ? response.json() : response.text();
}

export const get  = (path, opts)       => request(path, { ...opts, method: 'GET' });
export const post = (path, body, opts) => request(path, { ...opts, method: 'POST', body });
export const put  = (path, body, opts) => request(path, { ...opts, method: 'PUT', body });
export const del  = (path, opts)       => request(path, { ...opts, method: 'DELETE' });
