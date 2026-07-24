import {
  RabbitMQContainer,
  StartedRabbitMQContainer,
} from '@testcontainers/rabbitmq';

const RABBITMQ_IMAGE = 'rabbitmq:3.13-management-alpine';

export interface RabbitMqTestBroker {
  container: StartedRabbitMQContainer;
  amqpUrl: string;
}

export async function startRabbitMqTestBroker(): Promise<RabbitMqTestBroker> {
  const container = await new RabbitMQContainer(RABBITMQ_IMAGE).start();

  return { container, amqpUrl: container.getAmqpUrl() };
}

export async function stopRabbitMqTestBroker(
  broker: RabbitMqTestBroker,
): Promise<void> {
  await broker.container.stop();
}
