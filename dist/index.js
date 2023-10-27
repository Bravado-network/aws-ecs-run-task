/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ 320:
/***/ ((module) => {

module.exports = eval("require")("@actions/core");


/***/ }),

/***/ 705:
/***/ ((module) => {

module.exports = eval("require")("@aws-sdk/client-ecs");


/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __nccwpck_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		var threw = true;
/******/ 		try {
/******/ 			__webpack_modules__[moduleId](module, module.exports, __nccwpck_require__);
/******/ 			threw = false;
/******/ 		} finally {
/******/ 			if(threw) delete __webpack_module_cache__[moduleId];
/******/ 		}
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/compat get default export */
/******/ 	(() => {
/******/ 		// getDefaultExport function for compatibility with non-harmony modules
/******/ 		__nccwpck_require__.n = (module) => {
/******/ 			var getter = module && module.__esModule ?
/******/ 				() => (module['default']) :
/******/ 				() => (module);
/******/ 			__nccwpck_require__.d(getter, { a: getter });
/******/ 			return getter;
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/define property getters */
/******/ 	(() => {
/******/ 		// define getter functions for harmony exports
/******/ 		__nccwpck_require__.d = (exports, definition) => {
/******/ 			for(var key in definition) {
/******/ 				if(__nccwpck_require__.o(definition, key) && !__nccwpck_require__.o(exports, key)) {
/******/ 					Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
/******/ 				}
/******/ 			}
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/hasOwnProperty shorthand */
/******/ 	(() => {
/******/ 		__nccwpck_require__.o = (obj, prop) => (Object.prototype.hasOwnProperty.call(obj, prop))
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/make namespace object */
/******/ 	(() => {
/******/ 		// define __esModule on exports
/******/ 		__nccwpck_require__.r = (exports) => {
/******/ 			if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 				Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 			}
/******/ 			Object.defineProperty(exports, '__esModule', { value: true });
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/compat */
/******/ 	
/******/ 	if (typeof __nccwpck_require__ !== 'undefined') __nccwpck_require__.ab = __dirname + "/";
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
// This entry need to be wrapped in an IIFE because it need to be in strict mode.
(() => {
"use strict";
// ESM COMPAT FLAG
__nccwpck_require__.r(__webpack_exports__);

// EXTERNAL MODULE: ../../../../opt/homebrew/lib/node_modules/@vercel/ncc/dist/ncc/@@notfound.js?@aws-sdk/client-ecs
var client_ecs = __nccwpck_require__(705);
;// CONCATENATED MODULE: external "fs"
const external_fs_namespaceObject = require("fs");
var external_fs_default = /*#__PURE__*/__nccwpck_require__.n(external_fs_namespaceObject);
;// CONCATENATED MODULE: external "path"
const external_path_namespaceObject = require("path");
var external_path_default = /*#__PURE__*/__nccwpck_require__.n(external_path_namespaceObject);
;// CONCATENATED MODULE: ./index.js




const core = __nccwpck_require__(320)

const DEFAULT_WAIT_TIMEOUT_IN_SECONDS = 300

const region = process.env.AWS_REGION
const client = new client_ecs.ECSClient({ region });

const registerNewTaskDefinition = async () => {
  const taskDefinitionFile = core.getInput("task-definition", { required: true })
  const taskDefinitionPath = external_path_default().isAbsolute(taskDefinitionFile) ?
      taskDefinitionFile :
      external_path_default().join(process.env.GITHUB_WORKSPACE, taskDefinitionFile);
  const fileContent = external_fs_default().readFileSync(taskDefinitionPath, "utf8");
  
  core.info("Registering the task definition");

  try {
    const taskDefinitionCommandResult = await client.send(new client_ecs.RegisterTaskDefinitionCommand(JSON.parse(fileContent)))
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

  const result = await client.send(new client_ecs.RunTaskCommand({ 
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
  core.info(`THIS MESSAGE SHOULD BE VISIBLE!`)
  
  return result
}

const checkECSTaskExistCode = async (cluster, taskArn) => {
  const result = await client.send(new client_ecs.DescribeTasksCommand({
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


    
    core.setOutput('task-arn', taskArn);

    core.info(`task-arn:  $(taskArn)`)
    
    const waitForFinish = core.getInput("wait-for-finish") || false
    if (waitForFinish) {
      const cluster = core.getInput("cluster", { required: true })
      const waitTimeoutInSeconds = parseInt(core.getInput("wait-timeout-in-seconds")) || DEFAULT_WAIT_TIMEOUT_IN_SECONDS

      core.info(`Waiting for the task to complete. Will wait for ${waitTimeoutInSeconds / 60} minutes`)
      await (0,client_ecs.waitUntilTasksStopped)({
        client: client,
        maxWaitTime: waitTimeoutInSeconds,
        minDelay: 5,
        maxDelay: 5
      }, { cluster: cluster, tasks: [taskArn] })
      process.on('SIGINT', () => {
        core.info('Workflow was canceled. Performing cleanup or other actions here.');
      });
      
      await checkECSTaskExistCode(cluster, taskArn)
    }  
  } catch (error) {
    core.setFailed(error.message);
    core.error(error.stack);
  }
}

run()

})();

module.exports = __webpack_exports__;
/******/ })()
;