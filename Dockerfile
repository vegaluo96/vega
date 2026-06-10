FROM node:22-bookworm-slim
WORKDIR /app
COPY . .
EXPOSE 8787
CMD ["node", "--disable-warning=ExperimentalWarning", "--experimental-strip-types", "src/server/daemon.ts"]
