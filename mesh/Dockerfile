FROM node:24.19.0-alpine3.23@sha256:244cc2b53f46f9e876304391d17682b0ddae9ac33491f4857e25e35a36ba7995

WORKDIR /opt/axiom-mesh

ENV NODE_ENV=production \
    AXIOM_AUTO_BOOTSTRAP=false \
    AXIOM_REQUIRE_DENY_EGRESS=true \
    AXIOM_DATA_DIR=/var/lib/axiom-mesh \
    AXIOM_INTERNAL_TLS=true \
    AXIOM_TRANSPORT_DIR=/run/secrets/transport \
    AXIOM_GATEWAY_HOST=127.0.0.1 \
    AXIOM_INTERNAL_HOST=127.0.0.1

COPY --chown=10001:10001 package.json package-lock.json ./
COPY --chown=10001:10001 config ./config
COPY --chown=10001:10001 src ./src

USER 10001:10001

EXPOSE 8080
VOLUME ["/var/lib/axiom-mesh"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "src/healthcheck.mjs"]

ENTRYPOINT ["node", "src/supervisor.mjs"]
