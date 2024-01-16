
import { CloudFormationStackArtifact } from '@aws-cdk/cx-api';
import { DefaultSelection, ExtendedStackSelection, StackCollection } from './api/cxapp/cloud-assembly';
import { CdkToolkit } from './cdk-toolkit';
import { print } from './logging';

export interface ListWorkflowOptions {
  readonly selectedStacks: string[];
}

export type StackData = {
  stack: CloudFormationStackArtifact;
  dependencies: StackData[];
};

export async function listWorkflow(toolkit: CdkToolkit, options: ListWorkflowOptions) {

  const assembly = await toolkit.assembly();

  // const stacks = await assembly.selectStacks({ patterns }, { defaultBehavior: DefaultSelection.AllStacks });

  // TODO this would fail if there are multiple stacks for which we want to view nested hierarchy due to how we are selecting upstream stacks with DefaultSelection.AllStacks
  const stacks = await assembly.selectStacks({
    patterns: options.selectedStacks,
  }, {
    extend: ExtendedStackSelection.Upstream,
    defaultBehavior: DefaultSelection.AllStacks,
  });

  toolkit.validateStacksSelected(stacks, options.selectedStacks);
  toolkit.validateStacks(stacks);

  // See if you need to pass more information --> allStacks.get(dependencyId)! === assembly.stackById
  // ...assembly.stackById(dependencyId).stackArtifacts instead of dependencyId

  // const added = new Map<string, Array<string>>();

  // // TODO maybe we can pass data about dependency stack too?
  // const added = new Map<CloudFormationStackArtifact, Array<string>>();

  // for (const stack of stacks.stackArtifacts) {
  //   // const stackName = stack.manifest.displayName ?? stack.id;
  //   for (const dependencyId of stack.dependencies.map(x => x.manifest.displayName ?? x.id)) {

  //     assembly.stackById(dependencyId).stackArtifacts;

  //     assembly.getStac;

  //     if (added.get(stack)) {
  //       added.get(stack)?.push(dependencyId);
  //     } else {
  //       added.set(stack, [dependencyId]);
  //     }
  //   }
  // }

  /**
   * A
   *
   * B
   * --- A
   *
   * C
   * --- A
   * --- B
   * ------ A
   *
   */

  function calculateStackDependencies(collectionOfStacks: StackCollection): StackData[] {
    const allData: StackData[] = [];

    for (const stack of collectionOfStacks.stackArtifacts) {
      const data: StackData = {
        stack: stack,
        dependencies: [],
      };

      // const stackName = stack.manifest.displayName ?? stack.id;

      for (const dependencyId of stack.dependencies.map(x => x.manifest.displayName ?? x.id)) {
        if (dependencyId.includes('.assets')) {
          continue;
        }

        const depStack = assembly.stackById(dependencyId);

        if (depStack.stackCount > 1) {
          // I believe there should just be one stack artifact when we search it with dependency id
          throw new Error('I hit an edge case, was not expecting this!!');
        }

        // // TODO this might be an issue, check the object before concluding this is the correct approach
        // if ((depStack.stackArtifacts[0].displayName ?? depStack.stackArtifacts[0].id) === stackName) {
        //   continue;
        // }

        // If dependency stack also has dependencies
        // let dependenciesOfDependency: StackData[] = [];
        if (depStack.stackArtifacts[0].dependencies.length > 0 &&
          depStack.stackArtifacts[0].dependencies.filter((dep) => !(dep.manifest.displayName ?? dep.id).includes('.assets')).length > 0) {

          print(`We were here for ${(depStack.stackArtifacts[0].displayName ?? depStack.stackArtifacts[0].id)}`);

          const stackWithDeps = calculateStackDependencies(depStack);

          data.dependencies?.push(...stackWithDeps);
        } else {
          data.dependencies?.push({
            stack: depStack.stackArtifacts[0],
            dependencies: [],
          });
        }
      }

      allData.push(data);
    }

    return allData;
  }

  return calculateStackDependencies(stacks);
}