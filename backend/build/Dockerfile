# ベースイメージ
FROM ubuntu:22.04

# Set proxy
ARG http_proxy=""
ARG https_proxy=""
ENV HTTP_PROXY=${http_proxy} \
    HTTPS_PROXY=${https_proxy} \
    http_proxy=${http_proxy} \
    https_proxy=${https_proxy}
RUN sh -c 'echo Acquire::http::proxy \"${http_proxy}\"\;' >> /etc/apt/apt.conf
RUN sh -c 'echo Acquire::https::proxy \"${https_proxy}\"\;' >> /etc/apt/apt.conf

# 日本語表示用環境設定
ENV LANG=C.UTF-8 LC_ALL=C.UTF-8

# 環境変数設定
ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1
ENV PYTHONPATH "${PYTHONPATH}:/home/ubuntu/workspace/src"

# aptモジュールインストール
RUN apt-get update && apt-get upgrade -y
RUN apt-get install -y python3.10
RUN apt-get install -y --no-install-recommends python3-pip
RUN apt-get install -y less vim sudo wget curl git zip unzip
RUN apt-get install -y python-is-python3
# RUN apt-get install -y libgl1-mesa-dev
RUN apt-get install -y libglib2.0-0

## 権限定義 ##
ARG user_name=ubuntu
ARG user_id=1000
ARG group_name=ubuntu
ARG group_id=1000

RUN groupadd -g ${group_id} ${group_name}
RUN useradd -u ${user_id} -g ${group_id} -d /home/${user_name} --create-home --shell /usr/bin/bash ${user_name}
RUN echo "${user_name} ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers
RUN chown -R ${user_name}:${group_name} /home/${user_name}

# ワークスペース定義
USER ubuntu
ENV HOME /home/ubuntu
WORKDIR /home/ubuntu/workspace

# パッケージインストール
COPY requirements.txt .
RUN pip install --upgrade pip
RUN pip install --no-cache-dir -r requirements.txt
