import '@testing-library/jest-dom'
import type {} from 'vitest/jsdom'

// Use the browser storage provided by jsdom instead of Node's native accessors.
Object.defineProperties(globalThis, {
  localStorage: { value: jsdom.window.localStorage, configurable: true, writable: true },
  sessionStorage: { value: jsdom.window.sessionStorage, configurable: true, writable: true },
});
