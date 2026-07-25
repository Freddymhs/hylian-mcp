import Joi from 'joi';

const schema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  MCP_TRANSPORT: Joi.string().valid('stdio', 'http').default('stdio'),
  PORT: Joi.number().default(3000),
  LOG_LEVEL: Joi.string()
    .valid('trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent')
    .default('info'),
}).options({ abortEarly: false, allowUnknown: true });

const { error, value } = schema.validate(process.env);

if (error) {
  // stderr is safe — stdout is reserved for MCP protocol in stdio mode
  console.error('Config validation error:', error.message);
  process.exit(1);
}

export const env = {
  nodeEnv: value.NODE_ENV as 'development' | 'production' | 'test',
  transport: value.MCP_TRANSPORT as 'stdio' | 'http',
  port: value.PORT as number,
  logLevel: value.LOG_LEVEL as string,
} as const;
