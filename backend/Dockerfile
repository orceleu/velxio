FROM python:3.12-slim

# Install system dependencies, arduino-cli, and wasi-sdk (for custom-chip
# compilation). WASI-SDK bundles clang + wasi-libc and is Apache-2.0 licensed.
ARG WASI_SDK_VERSION=22
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    xz-utils \
    ca-certificates \
    && curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh | BINDIR=/usr/local/bin sh \
    && curl -fL https://github.com/WebAssembly/wasi-sdk/releases/download/wasi-sdk-${WASI_SDK_VERSION}/wasi-sdk-${WASI_SDK_VERSION}.0-linux.tar.gz \
       | tar -xz -C /opt \
    && mv /opt/wasi-sdk-${WASI_SDK_VERSION}.0 /opt/wasi-sdk \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*
ENV WASI_SDK=/opt/wasi-sdk

# Initialize arduino-cli and install cores.
# - arduino:avr  → Uno / Nano / Mega / etc.
# - ATTinyCore:avr@1.4.1 → ATtiny85 (pinned, see board-indexes/README.md)
COPY board-indexes/package_drazzy.com_index.json /root/.arduino15/package_drazzy.com_index.json
RUN arduino-cli config init \
    && arduino-cli config add board_manager.additional_urls \
        http://drazzy.com/package_drazzy.com_index.json \
    && arduino-cli config add board_manager.additional_urls \
        https://espressif.github.io/arduino-esp32/package_esp32_index.json \
    && arduino-cli config add board_manager.additional_urls \
        https://github.com/earlephilhower/arduino-pico/releases/download/global/package_rp2040_index.json \
    && (arduino-cli core update-index \
        || echo "WARNING: some board indexes failed to refresh; using seeded copies") \
    && arduino-cli core install arduino:avr \
    && arduino-cli core install ATTinyCore:avr@1.4.1

# ESP32 (série 2.x, sans C6) et Raspberry Pi Pico, dans un RUN séparé
# pour profiter du cache Docker si un téléchargement échoue.
RUN arduino-cli core install esp32:esp32@2.0.17 \
    && arduino-cli core install rp2040:rp2040 \
    && arduino-cli cache clean

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code (includes sdk/velxio-chip.h for chip_compile_service)
COPY . .

EXPOSE 8001

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]