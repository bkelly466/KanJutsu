import { fileURLToPath } from 'node:url';
import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { jishoProxy } from './functions/jisho-proxy/resource';

// CDK escape hatches, for what Amplify's own helpers don't cover.
import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import {
  FunctionUrl,
  FunctionUrlAuthType,
  Runtime,
} from 'aws-cdk-lib/aws-lambda';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';

/**
 * @see https://docs.amplify.aws/react/build-a-backend/ to add storage, functions, and more
 */
const backend = defineBackend({
  auth,
  data,
  jishoProxy,
});

// A Function URL rather than API Gateway, which would add cost and setup for
// an endpoint this simple.
const jishoProxyFn = backend.jishoProxy.resources.lambda;

// `authType: NONE` means no IAM signing — acceptable for a read-only proxy of
// public Jisho data.
//
// Deliberately NO `cors` block: the handler sets the CORS headers and answers
// the preflight itself, and configuring both produces duplicated headers
// ("Access-Control-Allow-Origin: *, *") that browsers reject.
const fnUrl = new FunctionUrl(
  backend.jishoProxy.resources.lambda,
  'JishoProxyFunctionUrl',
  {
    function: jishoProxyFn,
    authType: FunctionUrlAuthType.NONE,
  }
);

// The sentence analyzer is raw CDK rather than defineFunction(), because it
// ships a ~12.5 MB IPADIC dictionary as a .wasm and getting that into the
// deployment package needs bundling options defineFunction() doesn't expose.
// See ADR-0003.
const analyzerStack = backend.createStack('sentence-analyzer');

// Named once because it appears in several places below, where a typo would
// fail at runtime rather than at build.
//
// In `dependencies`, not `devDependencies`, even though only this Lambda uses
// it: nothing in src/ imports it so it never reaches the browser bundle, and a
// deploy genuinely needs it present on disk.
const LINDERA_PACKAGE = 'lindera-wasm-nodejs-ipadic';

const sentenceAnalyzerFn = new NodejsFunction(analyzerStack, 'SentenceAnalyzer', {
  // Resolved against this file rather than the working directory, so the path
  // doesn't depend on where the deploy was launched from.
  entry: fileURLToPath(new URL('./functions/sentence-analyzer/handler.ts', import.meta.url)),
  handler: 'handler',
  runtime: Runtime.NODEJS_22_X,

  // 1024 MB is chosen for the CPU, not the RAM — Lambda scales CPU with memory,
  // and measured peak usage is 220 MB. Halving it would halve the CPU and
  // roughly double the cold start without being meaningfully cheaper, since
  // billing is per GB-millisecond.
  //
  // Measured on the sandbox 2026-08-12: init 316 ms + first invocation 848 ms
  // ≈ 1.2 s cold, then 2-3 ms warm. The 30 s timeout is headroom for that one
  // cold invocation, not an expectation.
  memorySize: 1024,
  timeout: Duration.seconds(30),

  // NO `reservedConcurrentExecutions`, and that is not an oversight. Capping
  // this public endpoint would be the right instinct — it shares the
  // account-wide pool with jisho-proxy, so hammering it could throttle
  // dictionary search and take the Dictionary tab down. But this account's
  // TOTAL limit is 10 rather than the usual 1000, and AWS refuses any
  // reservation leaving fewer than 10 unreserved, so every value fails and the
  // attempt rolls the stack back. The fix is a service quota increase for
  // "Concurrent executions" in us-east-2, then `reservedConcurrentExecutions:
  // 10` here.
  //
  // An explicit log group rather than the `logRetention` prop, which provisions
  // an extra custom-resource Lambda to call PutRetentionPolicy — a bad trade
  // against a ceiling of ten.
  logGroup: new LogGroup(analyzerStack, 'SentenceAnalyzerLogs', {
    retention: RetentionDays.ONE_MONTH,
    // The sandbox is torn down and recreated routinely; don't leave orphans.
    removalPolicy: RemovalPolicy.DESTROY,
  }),

  bundling: {
    // The whole reason this function is in CDK. esbuild bundles JavaScript, not
    // binary assets, and Lindera loads its dictionary at runtime with
    // `fs.readFileSync(__dirname + '/lindera_wasm_bg.wasm')` — invisible to
    // esbuild, silently dropped, leaving a Lambda that deploys perfectly and
    // then 500s on the first request. So the package is marked external here
    // and copied whole below.
    //
    // '@aws-sdk/*' is CDK's default for this option, and supplying an array
    // REPLACES that default rather than extending it. Nothing imports the SDK
    // today, but the first thing that did would be bundled into the zip instead
    // of using the runtime's copy.
    externalModules: ['@aws-sdk/*', LINDERA_PACKAGE],

    // `inputDir` is the repo root and `outputDir` becomes /var/task, so the
    // copied folder lands where Node's module resolution finds it.
    commandHooks: {
      beforeBundling: () => [],
      beforeInstall: () => [],
      afterBundling: (inputDir: string, outputDir: string) => [
        `mkdir -p "${outputDir}/node_modules"`,
        // -L dereferences symlinks, which would otherwise land in the zip
        // dangling if node_modules is ever pnpm-backed.
        `cp -RL "${inputDir}/node_modules/${LINDERA_PACKAGE}" "${outputDir}/node_modules/${LINDERA_PACKAGE}"`,
        // A missing .wasm fails at RUNTIME behind a green build, so assert it
        // landed. If this ever fires, the cause is a package version that
        // renamed the file or grew a dependency npm hoisted elsewhere.
        `test -f "${outputDir}/node_modules/${LINDERA_PACKAGE}/lindera_wasm_bg.wasm"`,
      ],
    },
  },
});

// Same as the Jisho proxy above, CORS block included: all of it lives in the
// handler so the two can't produce duplicate headers.
const analyzerFnUrl = sentenceAnalyzerFn.addFunctionUrl({
  authType: FunctionUrlAuthType.NONE,
});

// Both URLs in ONE call — a second addOutput({ custom: ... }) would replace
// this object rather than merge into it.
//
// They're consumed differently on purpose:
//   jishoProxyUrl        amplify.yml's preBuild step exports it as
//                        VITE_JISHO_PROXY_URL, because local dev has a working
//                        fallback (the Vite dev proxy) when it's unset.
//   sentenceAnalyzerUrl  read from amplify_outputs.json by src/api/sentence.js.
//                        No local fallback exists, so an env var would mean
//                        hand-copying a sandbox URL after every recreate.
//
// `custom` because addOutput is otherwise typed for Amplify's own config keys.
backend.addOutput({
  custom: {
    jishoProxyUrl: fnUrl.url,
    sentenceAnalyzerUrl: analyzerFnUrl.url,
  },
});
