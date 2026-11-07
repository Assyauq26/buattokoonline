FROM node:22-bookworm-slim
WORKDIR /relay
COPY app/src/modules/auth/mail-contract.mjs app/src/modules/auth/mail-contract.mjs
COPY services/mail-relay/*.mjs services/mail-relay/
USER node
EXPOSE 8092
CMD ["node", "services/mail-relay/server.mjs"]
