import '@jsii/check-node/run';
import { ILock } from './api/util/rwlock';
import { CliOptions } from './workflows';
import { SdkProvider } from '../lib/api/aws-auth';
import { CloudExecutable } from '../lib/api/cxapp/cloud-executable';
import { execProgram } from '../lib/api/cxapp/exec';
import { Deployments } from '../lib/api/deployments';
import { ToolkitInfo } from '../lib/api/toolkit-info';
import { CdkToolkit } from '../lib/cdk-toolkit';
import { Command, Configuration } from '../lib/settings';

export async function setup(options: CliOptions): Promise<CdkToolkit> {
  // Configuration
  const configuration = new Configuration({
    commandLineArguments: {
      ...options.arguments,
      _: options.arguments._ as [Command, ...string[]], // TypeScript at its best
    },
  });
  await configuration.load();

  // SDKProvider
  const sdkProvider = await SdkProvider.withAwsCliCompatibleDefaults({
    profile: configuration.settings.get(['profile']),
    ec2creds: options.arguments.ec2creds,
    httpOptions: {
      proxyAddress: options.arguments.ec2creds,
      caBundlePath: options.arguments.ec2creds ? options.arguments.ec2creds['ca-bundle-path'] : undefined,
    },
  });

  // CloudExecutable
  let outDirLock: ILock | undefined;
  const cloudExecutable = new CloudExecutable({
    configuration,
    sdkProvider,
    // options.synthesizer in cli.ts. Do not see it being used in any reference, dead code?
    synthesizer: (async (aws, config) => {
      // Invoke 'execProgram', and copy the lock for the directory in the global
      // variable here. It will be released when the CLI exits. Locks are not re-entrant
      // so release it if we have to synthesize more than once (because of context lookups).
      await outDirLock?.release();
      const { assembly, lock } = await execProgram(aws, config);
      outDirLock = lock;
      return assembly;
    }),
  });

  // CloudFormation
  const toolkitStackName: string = ToolkitInfo.determineName(configuration.settings.get(['toolkitStackName']));
  const cloudFormation = new Deployments({ sdkProvider, toolkitStackName });

  // CdkToolkit
  const toolkit = new CdkToolkit({
    cloudExecutable,
    deployments: cloudFormation,
    verbose: options.arguments.trace || options.arguments.verbose > 0,
    ignoreErrors: options.arguments['ignore-errors'],
    strict: options.arguments.strict,
    configuration,
    sdkProvider,
  });

  return toolkit;
}