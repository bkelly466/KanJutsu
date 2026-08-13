/**
 * Jisho API Proxy — Lambda handler. Jisho sends no CORS headers permitting
 * browser requests, so the app calls this instead, and it fetches server-side.
 *
 * Reached through a public Function URL, given to the frontend as
 * VITE_JISHO_PROXY_URL at build time. Local dev uses the Vite dev proxy on
 * /api/jishoapi instead.
 *
 * Function URLs send an API Gateway HTTP API v2-shaped event, so the query
 * string arrives as `event.queryStringParameters`.
 */

import type { LambdaFunctionURLEvent, APIGatewayProxyResultV2 } from 'aws-lambda';

const JISHO_API_BASE = 'https://jisho.org/api/v1/search/words';

export const handler = async (
  event: LambdaFunctionURLEvent
): Promise<APIGatewayProxyResultV2> => {

  // The Function URL is on a different origin from Amplify Hosting, so the
  // browser blocks the response without these. Any origin is allowed: a
  // read-only proxy for public Jisho data.
  //
  // Here and ONLY here — backend.ts sets no `cors` block, because configuring
  // both produces duplicated headers that browsers reject.
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
  };

  // The browser's CORS preflight, sent before the real cross-origin GET.
  const method = event.requestContext?.http?.method;
  if (method === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  // Read-only, so anything but GET is rejected rather than forwarded to Jisho.
  if (method && method !== 'GET') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  const keyword = event.queryStringParameters?.keyword;

  // Capped so a giant string can't burn Lambda time on a doomed Jisho request.
  // Real lookups are a handful of characters.
  if (!keyword || keyword.length > 200) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'keyword query parameter is required (max 200 characters)' }),
    };
  }

  try {
    const jishoUrl = `${JISHO_API_BASE}?keyword=${encodeURIComponent(keyword)}`;
    const response = await fetch(jishoUrl);

    if (!response.ok) {
      return {
        statusCode: 502,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Jisho API returned an error' }),
      };
    }

    const data = await response.json();

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(data),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: message }),
    };
  }
};
