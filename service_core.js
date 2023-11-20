/* service_core.js

Taegis ServiceCore manager.
*/

import { Client, gql } from 'graphql-request';
import { InvalidGraphQLEndpoint } from './errors';

class ServiceCore {
  constructor(service) {
    this.service = service;

    this._urls = this.service._environments;
    this._gateway = this.service._gateway;

    this._queries = null;
    this._mutations = null;
    this._subscriptions = null;
  }

  get sync_url() {
    return this.service.url || this._urls[this.service.environment];
  }

  get wss_url() {
    return this.sync_url.replace("https", "wss");
  }

  get gateway() {
    return this.service.gateway || this._gateway;
  }

  get query() {
    throw new Error('Not implemented');
  }

  get mutation() {
    throw new Error('Not implemented');
  }

  get subscription() {
    throw new Error('Not implemented');
  }

  get sync_client() {
    const transport = new RequestsHTTPTransport(
      `${this.sync_url}${this.gateway}`,
      { headers: this.service.headers }
    );
    const client = new Client(transport);
    return client;
  }

  get ws_client() {
    const subprotocols = [
      "graphql-ws",
      `access-token-${this.service.access_token}`,
    ];

    if (this.service.tenant_id) {
      subprotocols.push(`x-tenant-context-${this.service.tenant_id}`);
    }

    const transport = new WebsocketsTransport(
      `${this.wss_url}${this.gateway}`,
      { 
        headers: this.service.headers,
        subprotocols: subprotocols,
        connectArgs: { max_size: null },
      }
    );
    const client = new Client(transport);
    return client;
  }

  async get_sync_schema() {
    const client = this.sync_client;
    const schema = await client.request(
      gql`
        query IntrospectionQuery {
          __schema {
            types {
              name
            }
          }
        }
      `
    );
    return schema;
  }

  async get_ws_schema() {
    const client = this.ws_client;
    const schema = await client.request(
      gql`
        query IntrospectionQuery {
          __schema {
            types {
              name
            }
          }
        }
      `
    );
    return schema;
  }

  async execute_query(endpoint, output, variables) {
    const operation_type = "query";
    const schema = await this.get_sync_schema();
    const graphql_field = schema.queryType.fields.find(f => f.name === endpoint);

    if (!graphql_field) {
      throw new InvalidGraphQLEndpoint(`${endpoint} not found in schema`);
    }

    let query_string;
    if (this.service.output) {
      query_string = this._build_output_query(
        operation_type,
        endpoint,
        graphql_field,
        this.service.output
      );
    } else {
      query_string = this._build_validated_query(
        operation_type,
        endpoint,
        graphql_field,
        output
      );
    }

    return this.execute(query_string, variables);
  }

  async execute_mutation(endpoint, output, variables) {
    const operation_type = "mutation";
    const schema = await this.get_sync_schema();
    const graphql_field = schema.mutationType.fields.find(f => f.name === endpoint);

    if (!graphql_field) {
      throw new InvalidGraphQLEndpoint(`${endpoint} not found in schema`);
    }

    let query_string;
    if (this.service.output) {
      query_string = this._build_output_query(
        operation_type,
        endpoint,
        graphql_field,
        this.service.output
      );
    } else {
      query_string = this._build_validated_query(
        operation_type,
        endpoint,
        graphql_field,
        output
      );
    }

    return this.execute(query_string, variables);
  }

  async execute_subscription(endpoint, output, variables) {
    const operation_type = "subscription";
    const schema = await this.get_ws_schema();
    const graphql_field = schema.subscriptionType.fields.find(f => f.name === endpoint);

    if (!graphql_field) {
      throw new InvalidGraphQLEndpoint(`${endpoint} not found in schema`);
    }

    let query_string;
    if (this.service.output) {
      query_string = this._build_output_query(
        operation_type,
        endpoint,
        graphql_field,
        this.service.output
      );
    } else {
      query_string = this._build_validated_query(
        operation_type,
        endpoint,
        graphql_field,
        output
      );
    }

    return this.subscribe(query_string, variables);
  }

  async execute(query_string, variables) {
    const client = this.sync_client;
    const query = gql(query_string);
    return client.request(query, variables);
  }

  async subscribe(query_string, variables) {
    const client = this.ws_client;
    const query = gql(query_string);
    const results = [];

    await client.subscribe(query, variables, (result) => {
        results.push(result);
    });

    return results.slice(0, -1);
  }

  _build_validated_query(operation_type, endpoint, graphql_field, output) {
    let query_string = this._build_output_query(
      operation_type,
      endpoint,
      graphql_field,
      output
    );
    query_string = query_string.replace(/\s+/g, ' ');

    for (let i = 0; i < 10000; i++) {
      try {
        gql(query_string);
        break;
      } catch (error) {
        if (error.message.includes("Cannot query field")) {
          console.warn(`${this.service.environment} - field ${error.nodes[0].name.value} not found. Removing from query string...`);
          const node = error.nodes[0].loc;
          query_string = remove_node(query_string, node);
        } else {
          throw error;
        }
      }
    }

    return query_string;
  }

  _build_output_query(operation_type, endpoint, graphql_field, output) {
    let directives = "";
    let definitions = "";

    if (graphql_field.args) {
      directives = `(${Object.entries(graphql_field.args).map(([name, def]) => `$${name}: ${def.type}`).join(', ')})`;
      definitions = `(${Object.keys(graphql_field.args).map(name => `${name}: $${name}`).join(', ')})`;
    }

    if (output) {
      output = `{ ${output.trim()} }`;
    }

    const query_string = `${operation_type} ${endpoint}${directives} {
      ${endpoint}${definitions}
      ${output}
    }`;

    return query_string;
  }
}

