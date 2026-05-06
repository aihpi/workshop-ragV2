FROM langflowai/langflow:1.9.0

USER root

RUN pip install --no-cache-dir \
    qdrant-client \
    pypdf \
    sentence-transformers

USER user

ENV LANGFLOW_HOST=0.0.0.0
ENV LANGFLOW_PORT=7860
