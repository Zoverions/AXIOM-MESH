import os
import logging

logger = logging.getLogger(__name__)

class SecretManager:
    @staticmethod
    def get_secret(secret_name: str, default: str = None) -> str:
        provider = os.environ.get("SECRET_PROVIDER", "env")

        if provider == "aws":
            return SecretManager._get_aws_secret(secret_name) or default
        elif provider == "vault":
            return SecretManager._get_vault_secret(secret_name) or default
        else:
            return os.environ.get(secret_name, default)

    @staticmethod
    def _get_aws_secret(secret_name: str):
        try:
            import boto3
            from botocore.exceptions import ClientError

            secret_name_aws = os.environ.get("AWS_SECRET_ID", "axiom-mesh-secrets")
            region_name = os.environ.get("AWS_REGION", "us-east-1")

            session = boto3.session.Session()
            client = session.client(
                service_name='secretsmanager',
                region_name=region_name
            )

            get_secret_value_response = client.get_secret_value(
                SecretId=secret_name_aws
            )
            import json
            secrets = json.loads(get_secret_value_response['SecretString'])
            return secrets.get(secret_name)
        except Exception as e:
            logger.error(f"Failed to fetch AWS secret {secret_name}: {e}")
            return None

    @staticmethod
    def _get_vault_secret(secret_name: str):
        try:
            import hvac

            vault_url = os.environ.get("VAULT_ADDR", "http://127.0.0.1:8200")
            vault_token = os.environ.get("VAULT_TOKEN")
            vault_path = os.environ.get("VAULT_SECRET_PATH", "secret/data/axiom-mesh")

            client = hvac.Client(url=vault_url, token=vault_token)

            read_response = client.secrets.kv.v2.read_secret_version(path=vault_path)
            return read_response['data']['data'].get(secret_name)
        except Exception as e:
            logger.error(f"Failed to fetch Vault secret {secret_name}: {e}")
            return None
