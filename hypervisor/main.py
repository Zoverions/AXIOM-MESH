import uvicorn
import os

if __name__ == "__main__":
    port = int(os.environ.get("HYPERVISOR_PORT", 8081))
    certs_dir = os.environ.get("CERTS_DIR", "../certs")

    mtls_ca_cert = os.environ.get("MTLS_CA_CERT")
    mtls_client_cert = os.environ.get("MTLS_CLIENT_CERT")
    mtls_client_key = os.environ.get("MTLS_CLIENT_KEY")

    if mtls_ca_cert and mtls_client_cert and mtls_client_key:
        print("mTLS certificates loaded securely from environment variables.")
        import tempfile
        # Create temporary files for uvicorn which requires file paths for SSL
        f_cert = tempfile.NamedTemporaryFile(delete=False, suffix=".crt")
        f_cert.write(mtls_client_cert.encode('utf-8'))
        f_cert.close()
        ssl_certfile = f_cert.name

        f_key = tempfile.NamedTemporaryFile(delete=False, suffix=".key")
        f_key.write(mtls_client_key.encode('utf-8'))
        f_key.close()
        ssl_keyfile = f_key.name

        f_ca = tempfile.NamedTemporaryFile(delete=False, suffix=".crt")
        f_ca.write(mtls_ca_cert.encode('utf-8'))
        f_ca.close()
        ssl_ca_certs = f_ca.name
    else:
        ssl_certfile = os.path.join(certs_dir, "hypervisor.crt")
        ssl_keyfile = os.path.join(certs_dir, "hypervisor.key")
        ssl_ca_certs = os.path.join(certs_dir, "ca.crt")

        if not (os.path.exists(ssl_certfile) and os.path.exists(ssl_keyfile) and os.path.exists(ssl_ca_certs)):
            print(f"mTLS certs not found in {certs_dir} and not provided via env vars. mTLS is mandatory for security.")
            exit(1)

    workers = int(os.environ.get("HYPERVISOR_WORKERS", 1))
    reload = True if workers == 1 else False

    print(f"Starting Uvicorn with mTLS on port {port} with {workers} workers")
    uvicorn.run(
        "src.api.server:app",
        host="0.0.0.0",
        port=port,
        workers=workers,
        reload=reload,
        ssl_keyfile=ssl_keyfile,
        ssl_certfile=ssl_certfile,
        ssl_ca_certs=ssl_ca_certs,
        ssl_cert_reqs=2 # ssl.CERT_REQUIRED
    )
