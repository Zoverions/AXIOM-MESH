import uvicorn
import os

if __name__ == "__main__":
    port = int(os.environ.get("HYPERVISOR_PORT", 8081))
    certs_dir = os.environ.get("CERTS_DIR", "../certs")

    ssl_certfile = os.path.join(certs_dir, "hypervisor.crt")
    ssl_keyfile = os.path.join(certs_dir, "hypervisor.key")
    ssl_ca_certs = os.path.join(certs_dir, "ca.crt")

    if not (os.path.exists(ssl_certfile) and os.path.exists(ssl_keyfile) and os.path.exists(ssl_ca_certs)):
        print(f"mTLS certs not found in {certs_dir}. mTLS is mandatory for security.")
        exit(1)

    print(f"Starting Uvicorn with mTLS on port {port}")
    uvicorn.run(
        "src.api.server:app",
        host="0.0.0.0",
        port=port,
        reload=True,
        ssl_keyfile=ssl_keyfile,
        ssl_certfile=ssl_certfile,
        ssl_ca_certs=ssl_ca_certs,
        ssl_cert_reqs=2 # ssl.CERT_REQUIRED
    )
