import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';

const { appId, serverUrl, token, functionsVersion } = appParams;

//Create a client with authentication required
const _base44 = createClient({
  appId,
  serverUrl,
  token,
  functionsVersion,
  requiresAuth: false
});

// Raise the default list() limit from 50 → 500 across the entire app.
// This prevents silent data truncation as record counts grow.
const DEFAULT_LIST_LIMIT = 500;

const entitiesProxy = new Proxy(_base44.entities, {
  get(target, entityName) {
    const entity = target[entityName];
    if (!entity || typeof entity !== 'object') return entity;

    return new Proxy(entity, {
      get(eTarget, method) {
        const original = eTarget[method];
        if (method === 'list' && typeof original === 'function') {
          return function patchedList(sort, limit, ...rest) {
            return original.call(eTarget, sort, limit ?? DEFAULT_LIST_LIMIT, ...rest);
          };
        }
        return original;
      },
    });
  },
});

export const base44 = new Proxy(_base44, {
  get(target, prop) {
    if (prop === 'entities') return entitiesProxy;
    return target[prop];
  },
});