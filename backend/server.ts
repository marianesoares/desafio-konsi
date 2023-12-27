import express from 'express';
import axios from 'axios';
import amqp from 'amqplib/callback_api';
import Redis from 'ioredis';
import crypto from 'crypto';
import cors from 'cors';
import path from 'path';
import { Client } from '@elastic/elasticsearch';
import { getConfig } from '../config';

const env = getConfig()
const app = express();

app.use(cors());
const port = 3000;


app.get('/login', (req, res) => {
    const loginPath = path.join(__dirname, '..', 'frontend', 'login.html');
    res.sendFile(loginPath);
});

app.get('/index', (req, res) => {
    const indexPath = path.join(__dirname, '..', 'frontend', 'index.html');
    res.sendFile(indexPath);
});


const secretKey = crypto.randomBytes(32).toString('hex');
console.log('Secret Key:', secretKey);

app.use(express.json());

const rabbitQueue = 'cpf_queue';

const rabbitMQConnection = async (): Promise<any> => {
    return new Promise((resolve, reject) => {
        amqp.connect('amqp://localhost:5672', (error, connection: any) => {
            if (error) {
                reject(error);
                return;
            }

            connection.createChannel((err: any, channel: any) => {
                if (err) {
                    reject(err);
                    return;
                }

                channel.assertQueue(rabbitQueue, { durable: true });

                resolve(channel);
            });
        });
    });
};

async function sendCPFToQueue(cpf: string): Promise<void> {
    try {
        const channel: any = await rabbitMQConnection();
        
        channel.sendToQueue(rabbitQueue, Buffer.from(cpf), { persistent: true });

        await channel.close();

    } catch (error) {
        console.error('Erro ao enviar CPF para a fila:', error);
        throw error;
    }
}


async function checkRedisCache(cpf: string): Promise<any | null> {
    return new Promise((resolve, reject) => {
      const client = Redis.createClient();
  
      client.get(cpf, (error, data) => {
        if (error) {
          reject(error);
        } else {
          resolve(data ? JSON.parse(data) : null);
        }
  
        client.quit();
      });
    });
}

async function indexInElasticsearch(cpf: string, beneficios: any): Promise<void> {
    const client = new Client({ node: 'http://localhost:9200' });
  
    await client.index({
      index: 'beneficios',
      body: {
        cpf,
        beneficios,
      },
    });
  
    console.log(`Dados do CPF ${cpf} indexados no Elasticsearch`);
  }

app.post('/api/v1/process-cpf', async (req, res) => {
    const { cpf } = req.body;
  
    try {
      await sendCPFToQueue(cpf);
  
      const redisCacheResult = await checkRedisCache(cpf);
      if (redisCacheResult) {
        return res.json(redisCacheResult);
      }
  
      const inssResponse = await axios.get(`${env.apiUrl}/v1/inss/consulta-beneficios?cpf=${cpf}`);
      console.log(inssResponse)
      const beneficios = inssResponse.data.beneficios;
  
      const client = Redis.createClient();
      client.setex(cpf, 3600, JSON.stringify({ cpf, beneficios }));
      client.quit();
  
      await indexInElasticsearch(cpf, beneficios);
  
      res.json({ cpf, beneficios });
    } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 404) {
            console.log('CPF não encontrado');
            res.status(500).json({ error: 'CPF nao encontrado' });
        }
        console.error('Erro ao processar CPF:', error);
    }
  });


app.post('/api/v1/token', async (req, res) => {
    const { username, password } = req.body;
    try { 
        const response = await axios.post(`${env.apiUrl}/api/v1/token`, {
            username,
            password,
        });

        const token = response.data.data.token;
        res.json({ token: token });

    } catch(error) {
        console.error('Erro na geração de token:', error);
        res.status(500).json({ error: 'Erro na geração de token' });
    }
});


app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}/login`);
});
