
import { Environment } from '@aws-cdk/cx-api';
import { DefaultSelection, ExtendedStackSelection, StackCollection } from './api/cxapp/cloud-assembly';
import { CdkToolkit } from './cdk-toolkit';
import { print } from './logging';
import { CliOptions, setup } from './workfow-helper';

/**
 * List Workflow Options
 */
export interface ListWorkflowOptions {
  readonly selectedStacks: string[];
  readonly cliOptions?: CliOptions;
}

export type StackDetails = {
  id: string;
  name: string;
  environment: Environment;
  dependencies: StackDetails[];
};

/**
 * List Workflow
 *
 * @param toolkit a cdk toolkit instance
 * @param options list workflow options
 * @returns list of stack data objects
 */
// TODO Switch to Promise<string> for doucment and uncomment lines below
export async function listWorkflow(options: ListWorkflowOptions): Promise<number> {

  let toolkit: CdkToolkit;
  // Or IDE options
  if (options.cliOptions) {
    toolkit = await setup(options.cliOptions);
  } else {
    throw new Error('CLI options needs to be defined!');
  }

  const assembly = await toolkit.assembly();

  const stacks = await assembly.selectStacks({
    patterns: options.selectedStacks,
  }, {
    extend: ExtendedStackSelection.Upstream,
    defaultBehavior: DefaultSelection.AllStacks,
  });

  toolkit.validateStacksSelected(stacks, options.selectedStacks);
  toolkit.validateStacks(stacks);

  function calculateStackDependencies(collectionOfStacks: StackCollection): StackDetails[] {
    const allData: StackDetails[] = [];

    for (const stack of collectionOfStacks.stackArtifacts) {
      const data: StackDetails = {
        id: stack.id,
        name: stack.stackName,
        environment: stack.environment,
        dependencies: [],
      };

      for (const dependencyId of stack.dependencies.map(x => x.manifest.displayName ?? x.id)) {
        if (dependencyId.includes('.assets')) {
          continue;
        }

        const depStack = assembly.stackById(dependencyId);

        if (depStack.stackCount > 1) {
          throw new Error(`This command requires exactly one stack and we matched more than one: ${depStack.stackIds}`);
        }

        if (depStack.stackArtifacts[0].dependencies.length > 0 &&
          depStack.stackArtifacts[0].dependencies.filter((dep) => !(dep.manifest.displayName ?? dep.id).includes('.assets')).length > 0) {

          const stackWithDeps = calculateStackDependencies(depStack);

          data.dependencies?.push(...stackWithDeps);
        } else {
          data.dependencies?.push({
            id: depStack.stackArtifacts[0].id,
            name: depStack.stackArtifacts[0].stackName,
            environment: depStack.stackArtifacts[0].environment,
            dependencies: [],
          });
        }
      }

      allData.push(data);
    }

    return allData;
  }

  const result = calculateStackDependencies(stacks);

  print(JSON.stringify(result, null, 4));
  // return JSON.stringify(result);

  return 0;
}

// Serialize to json what is returned here