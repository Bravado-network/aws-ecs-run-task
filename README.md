## Amazon ECS "Run task" Action for GitHub Actions

Registers an Amazon ECS task definition and runs it on ECS.

## Usage

```yaml
    - name: Run database schema migration
      uses: Bravado-network/aws-ecs-run-task@v1
      with:
        task-definition: ${{ steps.task-def.outputs.task-definition }}
        cluster: <cluster name>
        subnet: <subnet>
        security-group: <security group>
        container-name: <container name>
        command: <docker CMD>
        wait-timeout-in-seconds: 300
        wait-for-finish: true
```

### Task definition file

You can download a previous task definition, modify it and then run the ECS task as follows:

```sh
- name: Download task definition
  run: |
    aws ecs describe-task-definition --task-definition my-task-definition \
    --query taskDefinition > task-definition-file.json

- name: Fill in the new image ID in task definition
  id: task-def
  uses: aws-actions/amazon-ecs-render-task-definition@v1
  with:
    task-definition: task-definition-file.json
    container-name: <my-container-name>
    image: ${{ steps.login-ecr.outputs.registry }}/my-app-ecr-repo:${{ github.sha }}

- name: Run ECS task
  uses: Bravado-network/aws-ecs-run-task@v1
  with:
    task-definition: ${{ steps.task-def.outputs.task-definition }}
    cluster: <cluster name>
    subnet: <subnet>
    security-group: <security group>
    container-name: <my-container-name>
    command: <docker CMD>
    wait-timeout-in-seconds: 300
    wait-for-finish: true
```
## Credentials and Region

Use [the `aws-actions/configure-aws-credentials` action](https://github.com/aws-actions/configure-aws-credentials) to configure the GitHub Actions environment with environment variables containing AWS credentials and your desired region.
