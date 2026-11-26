FROM node:22-bookworm-slim
COPY egress.mjs /opt/egress.mjs
RUN mkdir /relay && chown node:node /relay
USER node
CMD ["node","/opt/egress.mjs"]
