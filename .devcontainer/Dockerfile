FROM mcr.microsoft.com/devcontainers/base:2.0.4-noble

ARG NODE_MAJOR=22
ARG PNPM_VERSION=9.15.9

ENV DEBIAN_FRONTEND=noninteractive
ENV PIP_DISABLE_PIP_VERSION_CHECK=1
ENV PATH="/opt/vpype/bin:${PATH}"

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        gnupg \
    && mkdir -p /etc/apt/keyrings \
    && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
        | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" \
        > /etc/apt/sources.list.d/nodesource.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        git \
        nodejs \
        python-is-python3 \
        python3 \
        python3-pip \
        python3-venv \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable \
    && corepack prepare pnpm@${PNPM_VERSION} --activate

RUN python3 -m venv /opt/vpype \
    && /opt/vpype/bin/pip install --no-cache-dir --upgrade pip setuptools wheel \
    && /opt/vpype/bin/pip install --no-cache-dir vpype vpype-gcode
