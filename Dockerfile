# Both delivery paths install the same verified application package.
FROM node:24.21.0-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20 AS builder
WORKDIR /source
ARG SOURCE_REVISION=source-hashes
ENV STEPCI_SOURCE_REVISION=$SOURCE_REVISION
COPY . .
RUN npm install --global npm@11.9.0 \
 && npm ci --no-audit --no-fund \
 && npm run package \
 && mkdir /application \
 && tar -xzf artifacts/stepci-2.8.2.tgz -C /application --strip-components=1 \
 && cd /application \
 && npm ci --omit=dev --ignore-scripts --no-audit --no-fund \
 && node scripts/provenance.cjs verify .

FROM node:24.21.0-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20
ARG SOURCE_REVISION=source-hashes
LABEL org.opencontainers.image.source="https://github.com/rclevenger-hm/stepci" \
      org.opencontainers.image.revision=$SOURCE_REVISION
WORKDIR /app
COPY --from=builder /application/ ./
COPY entrypoint.sh /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
