import { fileURLToPath } from 'node:url';
import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { jishoProxy } from './functions/jisho-proxy/resource';

// CDK imports for the "escape hatch" — when Amplify's high-level helpers
// don't cover what we need, we drop down to the underlying AWS CDK constructs.
// FunctionUrl lets us give the Lambda its own public HTTPS endpoint.
// FunctionUrlAuthType.NONE makes it publicly callable (no IAM signing needed).
import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import {
  FunctionUrl,
  FunctionUrlAuthType,
  Runtime,
} from 'aws-cdk-lib/aws-lambda';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
// NodejsFunction is CDK's own Lambda construct. We need it for the sentence
// analyzer because Amplify's defineFunction() exposes no bundling controls —
// see the long comment further down.
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';

/**
 * @see https://docs.amplify.aws/react/build-a-backend/ to add storage, functions, and more
 */
const backend = defineBackend({
  auth,
  data,
  jishoProxy,
});

// --- CDK escape hatch: add a Lambda Function URL ---
//
// A Lambda Function URL is a stable HTTPS endpoint that AWS creates for a
// Lambda function. We use it so the browser can reach the proxy without
// needing API Gateway (which adds cost and setup complexity).
//
// `backend.jishoProxy.resources.lambda` gives us the underlying CDK IFunction
// object that Amplify created when it processed our defineFunction() above.
// From there we can use any CDK Lambda API.

const jishoProxyFn = backend.jishoProxy.resources.lambda;

// Create the Function URL.
// authType: NONE  → no AWS IAM signing required; anyone can call this URL.
//   This is fine because it's a read-only proxy for public Jisho data.
//
// Note: we deliberately do NOT set a `cors` block here. The Lambda handler
// (functions/jisho-proxy/handler.ts) sets the CORS response headers itself and
// answers the OPTIONS preflight. Configuring CORS in both places can produce
// duplicated headers (e.g. "Access-Control-Allow-Origin: *, *"), which browsers
// reject — so we keep all CORS logic in the handler, in one place.
const fnUrl = new FunctionUrl(
  // Every CDK construct needs a "scope" (where it lives in the stack) and
  // an "id" (a unique name within that scope).
  backend.jishoProxy.resources.lambda,   // scope: nest it under the Lambda
  'JishoProxyFunctionUrl',               // id: arbitrary, must be unique in scope
  {
    function: jishoProxyFn,
    authType: FunctionUrlAuthType.NONE,
  }
);

// --- Sentence analyzer: a "custom function" (plain CDK, not defineFunction) ---
//
// Why not defineFunction() like jisho-proxy? Because this Lambda ships a
// ~12.5 MB IPADIC dictionary compiled into a .wasm file, and getting that file
// into the deployment package needs bundling options that defineFunction()
// doesn't expose. So we drop all the way down to CDK's NodejsFunction.
// See docs/adr/0003-sentence-analyzer-in-lambda.md.
//
// `backend.createStack()` is Amplify's supported door into raw CDK: it hands us
// a normal CloudFormation stack, deployed alongside the Amplify-managed ones,
// that we can put any construct into.
const analyzerStack = backend.createStack('sentence-analyzer');

// The npm package holding Lindera + IPADIC. Named once because it appears in
// several places below and a typo in any of them fails at runtime, not at build.
//
// It sits in `dependencies` rather than `devDependencies` on purpose, even
// though only this Lambda uses it: nothing in src/ imports it, so it never
// reaches the browser bundle, and `dependencies` is the safer home for
// something a deploy genuinely needs present on disk.
const LINDERA_PACKAGE = 'lindera-wasm-nodejs-ipadic';

const sentenceAnalyzerFn = new NodejsFunction(analyzerStack, 'SentenceAnalyzer', {
  // `import.meta.url` is this file's own location. Resolving the handler
  // relative to it means the path doesn't depend on which directory the deploy
  // was launched from. fileURLToPath turns the file:// URL into a plain path,
  // which is what CDK expects.
  entry: fileURLToPath(new URL('./functions/sentence-analyzer/handler.ts', import.meta.url)),
  handler: 'handler',
  runtime: Runtime.NODEJS_22_X,

  // Cold start has to compile 12.5 MB of WebAssembly and parse the dictionary.
  // Lambda scales CPU with memory, so 1024 MB is chosen for the CPU, NOT the
  // RAM — measured peak usage is only 220 MB. Halving it would halve the CPU
  // and roughly double the cold start, and since you pay per GB-millisecond it
  // wouldn't be meaningfully cheaper either.
  //
  // Measured on the sandbox, 2026-08-12: init 316 ms, first invocation 848 ms
  // (≈1.2 s cold in total), then 2-3 ms warm. The 30 s timeout is headroom for
  // that one cold invocation, not an expectation.
  memorySize: 1024,
  timeout: Duration.seconds(30),

  // NOTE: there is deliberately NO `reservedConcurrentExecutions` here, and it
  // is not an oversight.
  //
  // This endpoint is public and unauthenticated, so capping its concurrency
  // would be the right instinct: it shares the account-wide pool with
  // jisho-proxy, and somebody hammering the analyzer could throttle dictionary
  // search and take the far more visible Dictionary tab down with it.
  //
  // But this account's TOTAL Lambda concurrency limit is 10 (not the usual
  // 1000 — it has never been raised), and AWS refuses any reservation that
  // leaves fewer than 10 unreserved. So a cap is impossible until the service
  // quota is raised, which makes the shared-pool risk real rather than
  // theoretical. Tracked in HANDOFF.md; the fix is a quota increase request,
  // then `reservedConcurrentExecutions: 10` here.
  //
  // Explicit log group rather than the `logRetention` prop: that prop provisions
  // an extra custom-resource Lambda to call PutRetentionPolicy, and spending one
  // of only ten concurrent executions on housekeeping is a bad trade.
  logGroup: new LogGroup(analyzerStack, 'SentenceAnalyzerLogs', {
    retention: RetentionDays.ONE_MONTH,
    // The sandbox is torn down and recreated routinely; don't leave orphans.
    removalPolicy: RemovalPolicy.DESTROY,
  }),

  bundling: {
    // THE important part, and the whole reason this function exists in CDK.
    //
    // esbuild bundles JavaScript. It does not bundle binary assets. The Lindera
    // package loads its dictionary at runtime with
    //   fs.readFileSync(__dirname + '/lindera_wasm_bg.wasm')
    // which esbuild cannot see and would silently drop — leaving a Lambda that
    // builds and deploys perfectly and then 500s on the first request.
    //
    // So: mark the package "external" (tell esbuild to leave the `require` call
    // alone rather than inlining the package)...
    //
    // '@aws-sdk/*' is CDK's own default for this option, and supplying our own
    // array REPLACES that default rather than adding to it. Nothing here imports
    // the SDK today, but the first thing that did would get it bundled into the
    // zip instead of using the copy already in the Lambda runtime.
    externalModules: ['@aws-sdk/*', LINDERA_PACKAGE],

    // ...and then copy the real package, .wasm and all, into the deployment
    // package ourselves. Command hooks are shell commands CDK runs around the
    // bundling step; `inputDir` is the repo root and `outputDir` becomes the
    // Lambda's /var/task, so the copied folder lands where Node's ordinary
    // module resolution will find it.
    commandHooks: {
      beforeBundling: () => [],
      beforeInstall: () => [],
      afterBundling: (inputDir: string, outputDir: string) => [
        `mkdir -p "${outputDir}/node_modules"`,
        // -L dereferences symlinks rather than copying them as symlinks, which
        // would land in the zip dangling if node_modules is ever pnpm-backed.
        `cp -RL "${inputDir}/node_modules/${LINDERA_PACKAGE}" "${outputDir}/node_modules/${LINDERA_PACKAGE}"`,
        // Assert the dictionary actually made it. This whole construct exists
        // because a missing .wasm fails at RUNTIME with a green build — so if a
        // future version of the package renames the file or grows a dependency
        // that npm hoists elsewhere, fail the deploy here instead of shipping a
        // Lambda that 500s on its first request.
        `test -f "${outputDir}/node_modules/${LINDERA_PACKAGE}/lindera_wasm_bg.wasm"`,
      ],
    },
  },
});

// Same reasoning as the Jisho proxy above: a public HTTPS endpoint, no IAM
// signing, and deliberately NO `cors` block — all CORS lives in the handler, so
// the two can't produce duplicate headers that browsers reject.
const analyzerFnUrl = sentenceAnalyzerFn.addFunctionUrl({
  authType: FunctionUrlAuthType.NONE,
});

// Emit both Function URLs into the Amplify backend outputs.
//
// `addOutput` writes values into the amplify_outputs.json file that Amplify
// generates during the backend build (and that `npx ampx sandbox` writes
// locally). Both URLs go in ONE call — a second addOutput({ custom: ... })
// would replace this object rather than merge into it.
//
// The two are consumed differently, on purpose:
//   jishoProxyUrl        the amplify.yml preBuild step reads it out and exports
//                        it as VITE_JISHO_PROXY_URL, because local dev has a
//                        working fallback (the Vite dev proxy) when it's unset.
//   sentenceAnalyzerUrl  read straight out of amplify_outputs.json by
//                        src/api/sentence.js. There is no local fallback — the
//                        analyzer only exists in Lambda — so going through an
//                        env var would mean hand-copying a sandbox URL into
//                        .env.local every time the sandbox is recreated.
//
// Note: addOutput is typed for Amplify-specific config keys, so we use the
// `custom` key which accepts arbitrary string values.
backend.addOutput({
  custom: {
    jishoProxyUrl: fnUrl.url,
    sentenceAnalyzerUrl: analyzerFnUrl.url,
  },
});
