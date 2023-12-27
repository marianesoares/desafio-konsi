import * as dotenv from 'dotenv';
dotenv.config();

export function getConfig() {
  const username = process.env.API_USERNAME;
  const password = process.env.API_PASSWORD;
  const apiUrl = process.env.API_BASE_URL;
  const token = process.env.API_TOKEN;
  const rabbitUrl = process.env.RABBITMQ_URL;

  return {
    username,
    password,
    apiUrl,
    token,
    rabbitUrl
  };
}
