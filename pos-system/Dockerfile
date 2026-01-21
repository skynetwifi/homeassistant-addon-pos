ARG BUILD_FROM
FROM ${BUILD_FROM}

# Install Node.js and nginx
RUN apk add --no-cache \
    nodejs \
    npm \
    nginx

# Create app directory
WORKDIR /app

# Copy package.json and install dependencies
COPY rootfs/app/package.json ./
RUN npm install --production

# Copy application code
COPY rootfs/app/ ./

# Copy root filesystem
COPY rootfs /

# Set permissions
RUN chmod a+x /etc/services.d/pos/run \
    && chmod a+x /etc/services.d/pos/finish

# Build arguments
ARG BUILD_ARCH
ARG BUILD_DATE
ARG BUILD_DESCRIPTION
ARG BUILD_NAME
ARG BUILD_REF
ARG BUILD_REPOSITORY
ARG BUILD_VERSION

# Labels
LABEL \
    io.hass.name="${BUILD_NAME}" \
    io.hass.description="${BUILD_DESCRIPTION}" \
    io.hass.arch="${BUILD_ARCH}" \
    io.hass.type="addon" \
    io.hass.version="${BUILD_VERSION}" \
    maintainer="skynetwifi" \
    org.opencontainers.image.title="${BUILD_NAME}" \
    org.opencontainers.image.description="${BUILD_DESCRIPTION}" \
    org.opencontainers.image.source="${BUILD_REPOSITORY}" \
    org.opencontainers.image.created="${BUILD_DATE}" \
    org.opencontainers.image.revision="${BUILD_REF}" \
    org.opencontainers.image.version="${BUILD_VERSION}"
