// Locale files are required inside try/catch, which Metro treats as optional dependencies: a
// language with no file yet (or no engine file) stays unregistered and falls back to `en` per key.
// Adding de.json, es.json or pt.json needs no code change. Vitest registers the same files from
// disk (testSetup.ts).
import { registerResources } from './core';

try {
  registerResources('en', require('../../locales/en.json'), false);
} catch {
  // no en.json yet
}
try {
  registerResources('de', require('../../locales/de.json'), false);
} catch {
  // no de.json yet
}
try {
  registerResources('es', require('../../locales/es.json'), false);
} catch {
  // no es.json yet
}
try {
  registerResources('pt', require('../../locales/pt.json'), false);
} catch {
  // no pt.json yet
}
try {
  registerResources('en', require('../../locales/engine/en.json'), true);
} catch {
  // no engine/en.json yet
}
try {
  registerResources('de', require('../../locales/engine/de.json'), true);
} catch {
  // no engine/de.json yet
}
try {
  registerResources('es', require('../../locales/engine/es.json'), true);
} catch {
  // no engine/es.json yet
}
try {
  registerResources('pt', require('../../locales/engine/pt.json'), true);
} catch {
  // no engine/pt.json yet
}
