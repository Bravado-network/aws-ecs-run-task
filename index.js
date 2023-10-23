import { 
  ECSClient,
  RegisterTaskDefinitionCommand,
  RunTaskCommand,
  waitUntilTasksStopped,
  DescribeTasksCommand
} from "@aws-sdk/client-ecs";

import fs from "fs"
import path from "path"
const core = require("@actions/core")

const DEFAULT_WAIT_TIMEOUT_IN_SECONDS = 300

const region = process.env.AWS_REGION
const client = new ECSClient({ region });

const registerNewTaskDefinition = async () => {
  const taskDefinitionFile = core.getInput("task-definition", { required: true })
  const taskDefinitionPath = path.isAbsolute(taskDefinitionFile) ?
      taskDefinitionFile :
      path.join(process.env.GITHUB_WORKSPACE, taskDefinitionFile);
  const fileContent = fs.readFileSync(taskDefinitionPath, "utf8");
  
  core.info("Registering the task definition");

  try {
    const taskDefinitionCommandResult = await client.send(new RegisterTaskDefinitionCommand(JSON.parse(fileContent)))
    const { family, revision } = taskDefinitionCommandResult.taskDefinition
    core.info(`New Task definition URL: https://${region}.console.aws.amazon.com/ecs/v2/task-definitions/${family}/${revision}/containers`)
    
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
  const containerName = core.getInput("container-name", { required: true })
  const command = core.getInput("command", { required: true }).split(" ")

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
      containerOverrides: [{ name: containerName, command }]
    }
  }))
  
  const taskId = result.tasks[0].taskArn.split(`${cluster}/`)[1]
  core.info(`Task execution has started with command: ${command}. Watch the execution logs in AWS console: https://${region}.console.aws.amazon.com/ecs/v2/clusters/${cluster}/tasks/${taskId}/configuration/containers/${containerName}`);
  return result
}

const checkECSTaskExistCode = async (cluster, taskArn) => {
  const result = await client.send(new DescribeTasksCommand({
    cluster: cluster,
    tasks: [taskArn]
  }))

  result.tasks.forEach(task => {
    task.containers.forEach(container => {
      if (container.exitCode !== 0) {
        core.setFailed(`Reason: ${container.reason}`)
        core.info("DB migration has failed");
      }
    })
  })

  return result
}

const run = async () => {
  try {
    const newTaskDefinitionArn = await registerNewTaskDefinition()
    const runTaskResult = await runTask(newTaskDefinitionArn)
    const taskArn = runTaskResult.tasks[0].taskArn

    core.setOutput('task-arn', "123");
    
    const waitForFinish = core.getInput("wait-for-finish") || false
    if (waitForFinish) {
      const cluster = core.getInput("cluster", { required: true })
      const waitTimeoutInSeconds = parseInt(core.getInput("wait-timeout-in-seconds")) || DEFAULT_WAIT_TIMEOUT_IN_SECONDS

      core.info(`Waiting for the task to complete. Will wait for ${waitTimeoutInSeconds / 60} minutes`)
      await waitUntilTasksStopped({
        client: client,
        maxWaitTime: waitTimeoutInSeconds,
        minDelay: 5,
        maxDelay: 5
      }, { cluster: cluster, tasks: [taskArn] })
    
      await checkECSTaskExistCode(cluster, taskArn)
    }  
  } catch (error) {
    core.setFailed(error.message);
    core.error(error.stack);
  }
}

run()
