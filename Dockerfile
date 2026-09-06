FROM node:20-bookworm

# adb is required so the daemon can drive the real Android emulator
# (OCD_ADB=emulator:5555 -> `adb -s emulator:5555 shell ...`).
RUN apt-get update \
 && apt-get install -y --no-install-recommends android-tools-adb ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY daemon.mjs /app/daemon.mjs
COPY ocd-entrypoint.sh /app/ocd-entrypoint.sh
RUN chmod +x /app/ocd-entrypoint.sh

EXPOSE 18790
ENTRYPOINT ["/app/ocd-entrypoint.sh"]
