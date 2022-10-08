import { ECSClient, RegisterTaskDefinitionCommand, RunTaskCommand, waitUntilTasksStopped } from "@aws-sdk/client-ecs";
import core from "@actions/core"
import fs from "fs"
import path from "path"

const DEFAULT_WAIT_TIMEOUT_IN_SECONDS = 300

const client = new ECSClient({ region: "us-west-2" });

const run = async () => {
  const taskDefinitionFile = core.getInput('task-definition', { required: true })
  const cluster = core.getInput('cluster', { required: true })
  const subnet = core.getInput('subnet', { required: true })
  const securityGroup = core.getInput('security-group', { required: true })
  const containerOverride = { 
    name: core.getInput('container-name', { required: true }),
    command: core.getInput('command', { required: true }).split(" ")
  }
  const waitTimeoutInSeconds = parseInt(core.getInput('wait-timeout-in-seconds')) || DEFAULT_WAIT_TIMEOUT_IN_SECONDS
  const waitForFinish = core.getInput('wait-for-finish') || false

  const taskDefinitionPath = path.join(process.env.GITHUB_WORKSPACE, taskDefinitionFile)
  const fileContents = fs.readFileSync(taskDefinitionPath, 'utf8');
  
  const taskDefinitionCommandResult = await client.send(new RegisterTaskDefinitionCommand(JSON.parse(fileContents)))
  const newTaskDefinitionArn = taskDefinitionCommandResult.taskDefinition.taskDefinitionArn
  core.setOutput('task-definition-arn', newTaskDefinitionArn);

  // TODO: error handling
  const result = await client.send(new RunTaskCommand({ 
    cluster: cluster,
    taskDefinition: newTaskDefinitionArn,
    count: 1,
    launchType: "FARGATE",
    networkConfiguration: {
      awsvpcConfiguration: {
        subnets: [subnet],
        securityGroups: [securityGroup]
      }
    },
    overrides: {
      containerOverrides: [containerOverride]
    }
  }))
  
  if (waitForFinish) {
    const { state } = await waitUntilTasksStopped({
      client: client,
      maxWaitTime: waitTimeoutInSeconds,
      minDelay: 5,
      maxDelay: 5
    }, { cluster: cluster, tasks: [result.tasks[0].taskArn] })
  
    core.debug(state)
  }
}

module.exports = run;

if (require.main === module) {
    run();
}
