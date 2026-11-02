# Bookingbooster: one Node process, no packages to install.
FROM node:22-slim
WORKDIR /app
COPY . .
RUN node web/build.js
ENV NODE_ENV=production PORT=8080 DATA_DIR=/data
EXPOSE 8080
VOLUME /data
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://localhost:8080/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/index.js"]
