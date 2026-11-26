FROM docker:29-cli AS cli
FROM node:22-bookworm-slim
COPY --from=cli /usr/local/bin/docker /usr/local/bin/docker
COPY broker.mjs /opt/broker.mjs
CMD ["node","/opt/broker.mjs"]
