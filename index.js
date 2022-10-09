import { ECSClient, RegisterTaskDefinitionCommand, RunTaskCommand, waitUntilTasksStopped } from "@aws-sdk/client-ecs";
import fs from "fs"
import path from "path"
const core = require("@actions/core")

const DEFAULT_WAIT_TIMEOUT_IN_SECONDS = 300

const region = core.getInput("region", { required: true });
const client = new ECSClient({ region });

const registerNewTaskDefinition = async () => {
  const taskDefinitionFile = core.getInput("task-definition", { required: true })
  const taskDefinitionPath = path.join(process.env.GITHUB_WORKSPACE, taskDefinitionFile)
  const fileContent = fs.readFileSync(taskDefinitionPath, "utf8");
  
  core.info("Registering the task definition");

  try {
    const taskDefinitionCommandResult = await client.send(new RegisterTaskDefinitionCommand(JSON.parse(fileContent)))
    core.info(`New Task definition URL: ${JSON.stringify(taskDefinitionCommandResult.taskDefinition)}`)
    return taskDefinitionCommandResult.taskDefinition.taskDefinitionArn
  } catch (error) {
    core.setFailed("Failed to register task definition in ECS: " + error.message);
    core.info("Task definition contents:");
    core.info(fileContent);
    throw(error);
  }
}

const runTask = async (taskDefinitionArn) => {
  const cluster = core.getInput("cluster", { required: true })
  const subnet = core.getInput("subnet", { required: true })
  const securityGroup = core.getInput("security-group", { required: true })
  const containerOverride = { 
    name: core.getInput("container-name", { required: true }),
    command: core.getInput("command", { required: true }).split(" ")
  }

  const result = await client.send(new RunTaskCommand({ 
    cluster: cluster,
    taskDefinition: taskDefinitionArn,
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

  core.info(JSON.stringify(result))
  core.info(`Task execution has started. Watch the execution logs in AWS console: URL`);
  return result
}

const run = async () => {
  try {
    const newTaskDefinitionArn = await registerNewTaskDefinition()
    const runTaskResult = await runTask(newTaskDefinitionArn)

    const waitForFinish = core.getInput("wait-for-finish") || false
    if (waitForFinish) {
      const cluster = core.getInput("cluster", { required: true })
      const waitTimeoutInSeconds = parseInt(core.getInput("wait-timeout-in-seconds")) || DEFAULT_WAIT_TIMEOUT_IN_SECONDS

      core.info(`Waiting for the task to complete. Will wait for ${waitTimeoutInSeconds / 60} minutes`);
      const { state } = await waitUntilTasksStopped({
        client: client,
        maxWaitTime: waitTimeoutInSeconds,
        minDelay: 5,
        maxDelay: 5
      }, { cluster: cluster, tasks: [runTaskResult.tasks[0].taskArn] })
    
      core.info(state)
    }  
  } catch (error) {
    core.setFailed(error.message);
    core.error(error.stack);
  }
}

run()
