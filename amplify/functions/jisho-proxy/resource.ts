/**
 * The Jisho proxy Lambda. 10 seconds rather than the 3-second default, because
 * this makes an outbound request to Jisho, which can take a few seconds on a
 * cold start.
 */
import { defineFunction } from '@aws-amplify/backend';

export const jishoProxy = defineFunction({
  name: 'jisho-proxy',
  entry: './handler.ts',
  timeoutSeconds: 10,
});
