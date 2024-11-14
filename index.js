import { 
  ECSClient,
  RegisterTaskDefinitionCommand,
  RunTaskCommand,
  //waitUntilTasksStopped,
  DescribeTasksCommand
} from "@aws-sdk/client-ecs";

import fs from "fs"
import path from "path"
const core = require("@actions/core")

import { 
  CloudWatchLogsClient,
  GetLogEventsCommand
} from "@aws-sdk/client-cloudwatch-logs";

const DEFAULT_WAIT_TIMEOUT_IN_SECONDS = 300

const region = process.env.AWS_REGION
const client = new ECSClient({ region });

const cloudWatchLogsClient = new CloudWatchLogsClient({ region });

const getCloudWatchLogs = async (logGroupName, logStreamName) => {
  try {
    const response = await cloudWatchLogsClient.send(new GetLogEventsCommand({
      logGroupName,
      logStreamName,
      startFromHead: true
    }));

    return response.events.map(event => event.message).join('\n');
  } catch (error) {
    core.warning(`Failed to fetch CloudWatch logs: ${error.message}`);
    return null;
  }
};

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
  core.info(`THIS MESSAGE SHOULD BE VISIBLE!`)
  const taskId = result.tasks[0].taskArn.split(`${cluster}/`)[1]
  core.info(`Task execution has started with command: ${command}. Watch the execution logs in AWS console: https://${region}.console.aws.amazon.com/ecs/v2/clusters/${cluster}/tasks/${taskId}/configuration/containers/${containerName}`);
  return result
}

const checkECSTaskExistCode = async (cluster, taskArn) => {
  const result = await client.send(new DescribeTasksCommand({
    cluster: cluster,
    tasks: [taskArn]
  }));

  for (const task of result.tasks) {
    for (const container of task.containers) {
      const logStreamName = `${container.name}/${container.name}/${task.taskArn.split('/').pop()}`;
      const logGroupName = `${container.name}-logs`;

      const logs = await getCloudWatchLogs(logGroupName, logStreamName);
      if (logs) {
        core.info('Container Logs:');
        core.info('-------------------');
        core.info(logs);
        core.info('-------------------');
      }

      if (container.exitCode !== 0) {
        core.setFailed(`Reason: ${container.reason}`);
        core.info("Task has failed");
      }
    }
  }

  return result;
}

const getCloudWatchLogsIncremental = async (logGroupName, logStreamName, nextToken = null) => {
  try {
    const params = {
      logGroupName,
      logStreamName,
      startFromHead: true,
      limit: 100 // Adjust this value as needed
    };
    
    if (nextToken) {
      params.nextToken = nextToken;
    }

    const response = await cloudWatchLogsClient.send(new GetLogEventsCommand(params));
    return response;
  } catch (error) {
    core.warning(`Failed to fetch CloudWatch logs: ${error.message}`);
    return null;
  }
};

const waitUntilTasksStopped = async (cluster, taskArn) => {
  try {
    let taskStopped = false;
    let nextTokenMap = {}; // Store nextToken for each container

    while (!taskStopped) {
      const result = await client.send(new DescribeTasksCommand({
        cluster: cluster,
        tasks: [taskArn]
      }));

      const task = result.tasks[0];
      
      // Get logs for each container
      for (const container of task.containers) {
        const logStreamName = `${container.name}/${container.name}/${task.taskArn.split('/').pop()}`;
        const logGroupName = `${container.name}-logs`;
        const containerKey = `${logGroupName}-${logStreamName}`;

        const response = await getCloudWatchLogsIncremental(
          logGroupName, 
          logStreamName, 
          nextTokenMap[containerKey]
        );

        if (response && response.events.length > 0) {
          response.events.forEach(event => {
            core.info(`${event.message}`);
          });
          // Store the nextToken for next iteration
          nextTokenMap[containerKey] = response.nextForwardToken;
        }
      }

      // Check if task is stopped
      taskStopped = task.lastStatus === 'STOPPED';
      
      if (!taskStopped) {
        // Wait before next poll (adjust as needed)
        await new Promise(resolve => setTimeout(resolve, 5000)); // 5 second delay
      } else {
        // Check final status
        for (const container of task.containers) {
          if (container.exitCode !== 0) {
            core.setFailed(`Container ${container.name} failed with exit code ${container.exitCode}. Reason: ${container.reason || 'Unknown'}`);
            return false;
          }
        }
      }
    }
    
    return true;
  } catch (error) {
    core.setFailed(error.message);
    return false;
  }
};

const run = async () => {
  try {
    const newTaskDefinitionArn = await registerNewTaskDefinition()
    const runTaskResult = await runTask(newTaskDefinitionArn)
    const taskArn = runTaskResult.tasks[0].taskArn

    const waitForFinish = core.getInput("wait-for-finish") || false
    if (waitForFinish) {
      const cluster = core.getInput("cluster", { required: true })
      const waitTimeoutInSeconds = parseInt(core.getInput("wait-timeout-in-seconds")) || DEFAULT_WAIT_TIMEOUT_IN_SECONDS

      core.info(`Waiting for the task to complete. Will wait for ${waitTimeoutInSeconds / 60} minutes`)
      await waitUntilTasksStopped(cluster, taskArn)
    }  
  } catch (error) {
    core.setFailed(error.message);
    core.error(error.stack);
  }
}

run()
