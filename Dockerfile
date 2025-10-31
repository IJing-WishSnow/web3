# 使用最新的Ubuntu作为基础镜像
FROM ubuntu:latest

# 避免安装过程中交互式提示
ENV DEBIAN_FRONTEND=noninteractive

# 设置工作目录
WORKDIR /workspace

# 更新系统并安装基础工具 (包括Git)
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    curl \
    wget \
    git \
    build-essential \
    ca-certificates \
    software-properties-common && \
    rm -rf /var/lib/apt/lists/*

# 安装最新版本的Go
RUN cd /tmp && \
    wget https://go.dev/dl/go1.23.1.linux-amd64.tar.gz && \
    tar -C /usr/local -xzf go1.23.1.linux-amd64.tar.gz && \
    rm go1.23.1.linux-amd64.tar.gz

# 安装最新版本的Python
RUN add-apt-repository ppa:deadsnakes/ppa && \
    apt-get update && \
    apt-get install -y --no-install-recommends \
    python3.12 \
    python3.12-dev \
    python3.12-venv \
    python3-pip && \
    ln -sf /usr/bin/python3.12 /usr/bin/python3 && \
    ln -sf /usr/bin/python3 /usr/bin/python

# 安装Node.js和npm（Hardhat依赖）
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y --no-install-recommends nodejs

# 安装TypeScript和TypeScript相关工具
RUN npm install -g typescript ts-node @types/node

# 安装Solidity编译器（solc）
RUN add-apt-repository ppa:ethereum/ethereum && \
    apt-get update && \
    apt-get install -y --no-install-recommends solc

# 全局安装Hardhat
RUN npm install -g hardhat

# 安装常用的Hardhat插件
RUN npm install -g @nomicfoundation/hardhat-toolbox @nomicfoundation/hardhat-verify

# 安装Foundry
RUN curl -L https://foundry.paradigm.xyz | bash && \
    /root/.foundry/bin/foundryup

# 设置环境变量
ENV PATH="/usr/local/go/bin:/root/go/bin:/root/.foundry/bin:${PATH}"
ENV GOPATH=/root/go

# 验证安装
RUN go version && \
    python3 --version && \
    node --version && \
    npm --version && \
    tsc --version && \
    solc --version && \
    forge --version && \
    echo "Hardhat version: $(hardhat --version)"

# 设置默认命令
CMD ["/bin/bash"]