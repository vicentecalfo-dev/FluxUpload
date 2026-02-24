import Joi from 'joi';

export const fluxUploadConfigValidationSchema = Joi.object({
  PORT: Joi.number().integer().positive().default(3000),
  DATABASE_URL: Joi.string().uri({ scheme: [/postgres/, /postgresql/] }).required(),
  AUTH_TOKEN: Joi.string().min(8).required(),
  CORS_ORIGIN: Joi.string().default('*'),
  S3_BUCKET: Joi.string().min(3).required(),
  S3_REGION: Joi.string().default('us-east-1'),
  S3_ENDPOINT: Joi.string().uri().optional(),
  S3_ACCESS_KEY: Joi.string().required(),
  S3_SECRET_KEY: Joi.string().required(),
  S3_FORCE_PATH_STYLE: Joi.boolean().truthy('true').truthy('1').falsy('false').falsy('0').optional(),
  UPLOAD_DEFAULT_CHUNK_SIZE: Joi.number().integer().min(5 * 1024 * 1024).default(16_777_216),
  UPLOAD_SESSION_TTL_HOURS: Joi.number().integer().positive().default(24),
  PRESIGN_EXPIRES_SECONDS: Joi.number().integer().positive().default(900),
  OBJECT_KEY_PREFIX: Joi.string().default('flux-upload'),
});
