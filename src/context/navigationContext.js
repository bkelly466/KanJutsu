import { createContext, useContext } from 'react';

/**
 * The context object plus its consumer hook.
 *
 * Split from NavigationProvider.jsx because Fast Refresh only hot-reloads a
 * file exporting components alone (`react-refresh/only-export-components`).
 * CLAUDE.md documents the resulting Context.js / Provider.jsx convention.
 */
export const NavigationContext = createContext(null);

/**
 * Read the navigation state and actions. Throws outside the provider, where the
 * alternative is a "cannot destructure property of null" pointing at the call
 * site rather than the mistake.
 */
export function useNavigation() {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error('useNavigation must be used inside <NavigationProvider>');
  }
  return context;
}
