## Amazon ECS "Run task" Action for GitHub Actions

Registers an Amazon ECS task definition and runs it on ECS.

## Usage

```yaml
    - name: Run database schema migration
      uses: Bravado-network/aws-ecs-run-task@v1
      with:
        task-definition: ${{ steps.db-migration-task-def.outputs.task-definition }}
        cluster: fargate-poc
        subnet: subnet-08b5429a0e68a8ac3
        security-group: sg-06fcaf42e074c960e
        container-name: database-migration
        command: bundle exec rails db:migrate
        wait-timeout-in-seconds: 300
        wait-for-finish: true
```

### Task definition file

You can download a previous task definition, modify it and then run the ECS task as follows:

```sh
- name: Download database schema migration task definition
  run: |
    aws ecs describe-task-definition --task-definition fargate-database-poc \
    --query taskDefinition > database-task-definition.json

- name: Fill in the new image ID in the Amazon ECS database task definition
  id: db-migration-task-def
  uses: aws-actions/amazon-ecs-render-task-definition@v1
  with:
    task-definition: database-task-definition.json
    container-name: database-migration
    image: ${{ steps.login-ecr.outputs.registry }}/fargate-backend-poc:${{ github.sha }}

- name: Run database schema migration
  uses: Bravado-network/aws-ecs-run-task@PLAT-217-run-task
  with:
    task-definition: ${{ steps.db-migration-task-def.outputs.task-definition }}
    cluster: fargate-poc
    subnet: subnet-08b5429a0e68a8ac3
    security-group: sg-06fcaf42e074c960e
    container-name: database-migration
    command: bundle exec rails db:migrate
    wait-timeout-in-seconds: 300
    wait-for-finish: true
```
## Credentials and Region

Use [the `aws-actions/configure-aws-credentials` action](https://github.com/aws-actions/configure-aws-credentials) to configure the GitHub Actions environment with environment variables containing AWS credentials and your desired region.
