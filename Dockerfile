FROM python:3.14-slim AS hypervisor
WORKDIR /app
COPY hypervisor/ /app/hypervisor
COPY hypervisor/requirements.txt .
RUN pip install -r requirements.txt
CMD ["python", "-m", "hypervisor.agents.master_autonomy_graph"]

FROM node:25-slim AS gateway
WORKDIR /app/gateway
COPY gateway/ /app/gateway
RUN npm install && npm run build
CMD ["npm", "run", "start"]
