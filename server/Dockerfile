# Polygon Rush community server.
# Build from the repository root (it shares the chat filter and name list with the app):
#   docker build -f server/Dockerfile -t polygon-rush-server .
FROM node:22-slim

ENV NODE_ENV=production \
    DATA_DIR=/data \
    PORT=8080

WORKDIR /app
RUN echo '{"type":"module","private":true}' > package.json \
 && mkdir -p /data && chown node:node /data

COPY server/package.json server/package-lock.json server/
RUN cd server && npm ci --omit=dev && npm cache clean --force

COPY server/src server/src
COPY src/shared src/shared
COPY src/meta/names.ts src/meta/names.ts

USER node
WORKDIR /app/server
VOLUME ["/data"]
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--disable-warning=ExperimentalWarning", "src/main.ts"]
