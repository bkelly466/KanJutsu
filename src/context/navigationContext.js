import { createContext, useContext } from 'react';

/**
 * The context object plus its consumer hook.
 *
 * Split out from NavigationProvider.jsx on purpose: Vite's Fast Refresh can only
 * hot-reload a file that exports *only* components, so a file exporting both a
 * provider component and a hook breaks it (the `react-refresh/only-export-components`
 * lint rule). The convention across the app is therefore:
 *
 *   src/context/<name>Context.js   - createContext + the use<Name>() hook (no JSX)
 *   src/context/<name>Provider.jsx - the provider component
 *   src/reducers/<name>.js         - the pure reducer, if it has one
 *
 * Reducers live in src/reducers/ whether or not a context uses them, so all the
 * pure, unit-testable state logic has one home.
 */
export const NavigationContext = createContext(null);

/**
 * Read the navigation state and actions.
 *
 * Throws when used outside the provider — without this you'd get a confusing
 * "cannot destructure property of null" from wherever the value was used, rather
 * than a message naming the actual mistake.
 */
export function useNavigation() {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error('useNavigation must be used inside <NavigationProvider>');
  }
  return context;
}
