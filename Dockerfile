FROM node:22-slim
WORKDIR /app
COPY package.json ./
COPY *.js ./
COPY public ./public
ENV NODE_ENV=production \
    DB_PATH=/data/reparared.db
EXPOSE 3000
CMD ["npm", "start"]
