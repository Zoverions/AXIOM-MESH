FROM python:3.11-slim
RUN pip install uv && uv tool install get-physics-done
COPY .gpd/ /workspace/.gpd/
ENTRYPOINT ["gpd"]
CMD ["--headless"]
