FROM python:3.12-slim AS hypervisor
WORKDIR /app
COPY hypervisor/ /app/hypervisor
COPY requirements.txt .
RUN pip install -r requirements.txt
CMD ["python", "-m", "hypervisor.agents.master_autonomy_graph"]

FROM node:20-slim AS gateway
WORKDIR /app
COPY gateway/ /app/gateway
RUN npm install && npm run build
CMD ["npm", "run", "start"]
