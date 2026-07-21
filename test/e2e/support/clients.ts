import { Pool } from 'pg';
import Redis from 'ioredis';
import * as amqp from 'amqplib';
import { GraphQLClient } from 'graphql-request';
import { QdrantClient } from '@qdrant/js-client-rest';
import { env, GRAPHQL_ENDPOINT } from './env';

export function createApiPool(): Pool {
  return new Pool({ connectionString: env.apiDatabaseUrl });
}

export function createSearchRedis(): Redis {
  return new Redis(env.redisSearchUrl, { lazyConnect: true });
}

export function createGraphQlClient(accessToken: string): GraphQLClient {
  return new GraphQLClient(GRAPHQL_ENDPOINT, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export function createQdrantClient(): QdrantClient {
  return new QdrantClient({ url: env.qdrantUrl });
}

export async function connectAmqp(): Promise<amqp.ChannelModel> {
  return amqp.connect(env.rabbitmqUri);
}
