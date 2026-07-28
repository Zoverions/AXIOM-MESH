FROM node:26.5.0-alpine3.23@sha256:0473b6671ff22c8eeb570c0e1e51408595d3171e73f8002c269b763f0a943149

WORKDIR /opt/axiom-mesh

ENV NODE_ENV=production \
    AXIOM_AUTO_BOOTSTRAP=false \
    AXIOM_DATA_DIR=/var/lib/axiom-mesh \
    AXIOM_GATEWAY_HOST=0.0.0.0 \
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
