FROM node:20-alpine

WORKDIR /app

COPY frontend/package*.json ./

RUN npm install

COPY frontend/ ./
COPY docs/ /docs/

EXPOSE 5174

CMD ["npm", "run", "dev"]
