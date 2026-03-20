import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

export class SecretManager {
    static async getSecret(secretName: string, defaultVal: string = ''): Promise<string> {
        const provider = process.env.SECRET_PROVIDER || 'env';

        if (provider === 'aws') {
            return await this.getAwsSecret(secretName) || defaultVal;
        } else if (provider === 'vault') {
            return await this.getVaultSecret(secretName) || defaultVal;
        } else {
            return process.env[secretName] || defaultVal;
        }
    }

    private static async getAwsSecret(secretName: string): Promise<string | null> {
        try {
            const secretId = process.env.AWS_SECRET_ID || 'axiom-mesh-secrets';
            const region = process.env.AWS_REGION || 'us-east-1';
            const client = new SecretsManagerClient({ region });

            const response = await client.send(
                new GetSecretValueCommand({ SecretId: secretId, VersionStage: "AWSCURRENT" })
            );

            if (response.SecretString) {
                const secrets = JSON.parse(response.SecretString);
                return secrets[secretName] || null;
            }
            return null;
        } catch (error) {
            console.error(`Failed to fetch AWS secret ${secretName}:`, error);
            return null;
        }
    }

    private static async getVaultSecret(secretName: string): Promise<string | null> {
        try {
            const vault = require('node-vault')({
                apiVersion: 'v1',
                endpoint: process.env.VAULT_ADDR || 'http://127.0.0.1:8200',
                token: process.env.VAULT_TOKEN
            });

            const vaultPath = process.env.VAULT_SECRET_PATH || 'secret/data/axiom-mesh';
            const result = await vault.read(vaultPath);

            if (result && result.data && result.data.data) {
                return result.data.data[secretName] || null;
            }
            return null;
        } catch (error) {
            console.error(`Failed to fetch Vault secret ${secretName}:`, error);
            return null;
        }
    }
}
